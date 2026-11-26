import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_BOOK, RESERVE_ACCOUNT, type AccountOperation } from '../domain/accounts';
import { applyExchange, buildExchange, exchangeRevision, prepareExchange, previewExchange, type ExchangeFile } from '../domain/exchange';
import { ledger } from '../domain/ledger';
import type { Debt } from '../domain/types';

const storage = new Map<string, string>();
vi.stubGlobal('window', { localStorage: {
  getItem: (name: string) => storage.get(name) ?? null,
  setItem: (name: string, value: string) => storage.set(name, value),
  removeItem: (name: string) => storage.delete(name),
} });

const date = '2026-11-20';
const at = date + 'T10:00:00.000Z';
const debt: Debt = { id: 'd1', name: 'План оплаты', short: 'План', kind: 'split', balance: 87000, startBalance: 87000,
  rate: 0, dueDay: 20, rule: { type: 'fixed', amount: 1100 }, frozen: true, order: 1, closed: false };
const old = {
  debts: [debt], expenses: [], reserve: 7000, ready: true,
  cardBalance: { amount: 3000, date, at, source: 'manual' },
  reserveLog: [{ id: 'r', date, at, amount: 7000, abs: true, note: 'Сверка' }],
  checks: { audit: { done: true, at } }, checklist: [{ id: 'audit', title: 'Сверить счёт', note: 'Локальная заметка' }],
  marks: { oldIncome: { done: true, at, paidDate: date, amount: 5800 } },
};
const exchange = (patch: Partial<ExchangeFile>, protocolVersion = '2.7'): ExchangeFile =>
  ({ app: 'kurs-exchange', version: 2, protocolVersion, ...patch });

async function reopen(version: number, state: unknown) {
  storage.set('kurs', JSON.stringify({ version, state }));
  vi.resetModules();
  return (await import('./store')).useStore;
}

describe('обратная совместимость и подтверждение операций', () => {
  beforeEach(() => storage.clear());

  it('открывает прежнее хранилище и полный JSON с отметками, журналом и сверкой', async () => {
    const store = await reopen(4, old);
    expect(store.getState()).toMatchObject(old);
    expect(store.getState().accountBook).toEqual({ ...EMPTY_BOOK, paymentRouting: 'life' });
    expect(ledger(store.getState()).card).toBe(3000);
    const copy = JSON.parse(store.getState().exportData());
    store.getState().startEmpty();
    expect(store.getState().importData(copy)).toBe(true);
    expect(store.getState()).toMatchObject(old);
    const reopened = await reopen(5, store.getState());
    expect(reopened.getState()).toMatchObject(old);
  });

  it('переклассифицирует отмеченный заём без увеличения уже сверенного долга и сохраняет откат', async () => {
    const store = await reopen(4, { ...old, oneOff: [{ key: 'oldIncome', kind: 'income', date, dateMode: 'exact', title: 'Перевод', amount: 5800 }] });
    const op: AccountOperation = { id: 'transfer-ref', eventKey: 'oldIncome', externalId: 'b1',
      accountId: RESERVE_ACCOUNT, date, at, amount: 5800, type: 'loan_disbursement', debtId: debt.id,
      debtBooked: true, cashBooked: true, origin: 'exchange', status: 'confirmed', fundingSource: 'borrowed' };
    const file = exchange({ accountBook: { operations: [op] }, status: { totalDebt: 1 } });
    const apply = (f: ExchangeFile) => store.getState().applySync(applyExchange(f, store.getState(), date, new Set(['accountBook']), () => 'a'), 'Журнал');
    expect(previewExchange(file, store.getState(), date)[0].lines).toHaveLength(1);
    expect(store.getState().accountBook.operations).toHaveLength(0);
    apply(file);
    expect(previewExchange(file, store.getState(), date)).toEqual([]);
    expect(ledger({ ...store.getState(), now: date }).debtBalances[debt.id].estimated).toBe(debt.balance);
    expect(store.getState().marks.oldIncome).toEqual(old.marks.oldIncome);
    expect(store.getState().accountBook.operations).toHaveLength(1);
    store.getState().rollbackImport(store.getState().imports[0].id);
    expect(store.getState()).toMatchObject(old);
    expect(store.getState().accountBook.operations).toHaveLength(0);
  });

  it('повторное применение 2.6 и 2.7 сохраняет независимые покупки с равными суммами', async () => {
    const store = await reopen(4, old);
    const file = (version: string) => exchange({ expenses: [
      { id: 'trip-1', date, amount: 111, category: 'transport' },
      { id: 'trip-2', date, amount: 111, category: 'transport', dup: true },
    ] }, version);
    for (const version of ['2.6', '2.7', '2.6']) {
      store.getState().applySync(applyExchange(file(version), store.getState(), date, new Set(['expenses']), () => 'random'));
    }
    expect(store.getState().expenses.map(e => e.id)).toEqual(['trip-1', 'trip-2']);
  });

  it('зачисляет фактическую премию один раз и не даёт списать небезопасную досрочку', async () => {
    const store = await reopen(4, old);
    const data = { id: 'bonus-confirmed', eventKey: 'inc:bonusYear:2026-11', amount: 3000,
      title: 'Поступление', accountId: 'life', date };
    expect(store.getState().applyBonus(data)).toBe(true);
    expect(store.getState().applyBonus(data)).toBe(false);
    expect(store.getState().debts[0]).toEqual(debt);
    const state = store.getState();
    expect(state.prepay(debt.id, 500, RESERVE_ACCOUNT, { principal: 500 })).toBe(false);
    expect(store.getState().accountBook).toBe(state.accountBook);
    const file = buildExchange(store.getState(), date, { short: true });
    expect(file.protocolVersion).toBe('2.8');
    expect(file.status?.coverage).toMatchObject({ scenario: 'base' });
  });
});

it('classifies historical loans and card fees without moving balances or repeating a marked payment', async () => {
  const calc = await import('../domain/calendar');
  const summary = await import('../domain/accounts');
  const key = 'old-unlabelled';
  const event = { key, title: 'Перевод', kind: 'income', date, amount: 780, dateMode: 'exact' } as const;
  const fee = { id: 'fee-1', source: 'credit', category: 'fixed', date, amount: 19, createdAt: at } as const;
  const store = await reopen(5, { ...old, oneOff: [event], expenses: [fee], accountBook: EMPTY_BOOK,
    marks: { ...old.marks, [key]: { done: true, paidDate: date, at: date + 'T11:00:00Z', amount: 780 } } });
  const before = store.getState();
  const patch = exchange({ accountBook: { historicalLoans: [
    { eventKey: key, date, amount: 999, debtId: debt.id },
    { eventKey: key, date, amount: 780, debtId: debt.id },
  ], creditChargeKinds: { 'fee-1': 'fee' } } });
  const importBook = () => store.getState().applySync(applyExchange(patch, store.getState(), date, new Set(['accountBook']), () => 'rand'), 'Обмен');
  importBook();
  const after = store.getState();
  expect(calc.eventsBetween(after, date, date).filter(e => e.key === key)).toMatchObject([{ economicType: 'loan_disbursement', amount: 780 }]);
  expect(summary.monthDebtActivity(after.accountBook, after.expenses, date)).toMatchObject({ loanDisbursements: 780, creditPurchases: 0, fees: 19 });
  const actual = ledger(after), original = ledger(before);
  expect(actual.debtBalances[debt.id]).toMatchObject({ estimated: original.debtBalances[debt.id].estimated, classifiedLoanHistory: 780 });
  expect(actual.card).toBe(original.card);
  expect(actual.reserve).toBe(original.reserve);
  expect(after.marks).toEqual(before.marks);
  expect(after.expenses).toEqual(before.expenses);
  expect(after.accountBook.operations).toEqual([]);
  expect(previewExchange(patch, after, date)).toEqual([]);
});

it('refines the date of a documented bonus on one key without marking any cash movement', async () => {
  const key = 'inc:bonusQuarter:2026-10';
  const pay = { kind: 'bonusQuarter', title: 'Премия', net: 17440, gross: 20045, asOf: date, payMonth: '2026-10' } as const;
  const store = await reopen(5, { ...old, work: { from: '2026-01-01', rates: [{
    from: '2026-01-01', unit: 2000, positionUnits: 15, rankUnits: 5,
    seniority: 0.1, conditions: 0.2, monthlyBonus: 0.3, confidence: 'estimate',
  }], actual: { [key]: pay } },
    incomes: [{ kind: 'bonusQuarter', name: 'Премия', day: 29, amount: 17440, months: [10, 12] }],
    overrides: { 'inc:bonusQuarter:2026-12': { amount: 18888, date: '2026-12-24' } },
    templateFrom: '2026-01' });
  const before = store.getState();
  const file = exchange({ work: { actual: { [key]: { ...pay, payDate: '2026-10-23' } } } });
  store.getState().applySync(applyExchange(file, before, date, new Set(['work']), () => 'synthetic'));
  const after = store.getState();
  const out = buildExchange(after, date, { short: false });
  expect(out.calendar?.filter(row => row.key === key)).toMatchObject([{
    date: '2026-10-23', actualPayDate: '2026-10-23', incomeStatus: 'documented', exact: true, done: false, amount: 17440,
  }]);
  const future = out.calendar?.find(row => row.key === 'inc:bonusQuarter:2026-12');
  expect(future).toMatchObject({ manuallyAdjusted: true, incomeStatus: 'conditional', approx: true, done: false });
  expect(future).not.toHaveProperty('exact');
  expect(ledger(after)).toEqual(ledger(before));
  expect(after.marks).toEqual(before.marks);
  expect(previewExchange(file, after, date)).toEqual([]);
});

it('updates only matching strategy text and preserves all payment and checklist marks', async () => {
  const strategy = [{ title: 'План', text: 'Строка А\nСтарый текст\nСтрока Б' }, { title: 'История', text: 'Старый текст' }];
  const store = await reopen(5, { ...old, strategy });
  const file = exchange({ strategyEdits: [{ title: 'План', find: 'Старый текст', replace: 'Новый текст' }] });
  const before = store.getState();
  store.getState().applySync(applyExchange(file, before, date, new Set(['strategy']), () => 'synthetic'));
  expect(store.getState().strategy).toEqual([{ ...strategy[0], text: 'Строка А\nНовый текст\nСтрока Б' }, strategy[1]]);
  expect(store.getState().marks).toEqual(before.marks);
  expect(store.getState().checks).toEqual(before.checks);
  expect(previewExchange(file, store.getState(), date)).toEqual([]);
});

it('exports the exact debt delta and separates post-anchor charges from amounts already in the base', async () => {
  const credit = { ...debt, kind: 'card' as const, balance: 100000.25, rate: 0.365, updatedAt: '2026-11-19T10:00:00Z',
    bankBalance: { amount: 100000.25, date: '2026-11-19', at: '2026-11-19T10:00:00Z', includedIds: ['included'] } };
  const spend = (id: string, date: string, amount: number, createdAt?: string) =>
    ({id,date,amount,createdAt,source:'credit' as const,category:'fixed' as const,creditCard:credit.id});
  const store = await reopen(5, { ...old, debts: [credit], expenses: [
    spend('included', '2026-11-19', 34), spend('unknown-time','2026-11-19', 25),
    spend('later', date, 60), spend('fee', date, 12.35),
  ], accountBook: { ...EMPTY_BOOK, creditChargeKinds: { fee: 'fee' } } });
  const out = buildExchange(store.getState(), date, { short: false });
  expect(out.status?.debtReconciliation).toMatchObject({
    basis: 100000.25, estimated: 100172.60, delta: 172.35,
    rows: [{ id: credit.id, basisKind: 'bank', added: { purchases: 60, fees: 12.35 },
      alreadyCovered: { purchases: 34 }, missingTime: { purchases: 25 }, estimatedInterest: 100 }],
  });
  expect(out.status?.totalDebt).toBe(100172.6);
});

it('links a review payment idempotently, edits only notes, and waits for booked income before raising a task', async () => {
  const { alerts } = await import('../domain/summary');
  const main = { key: 'scheduled-test', title: 'Оплата по графику', kind: 'payment', amount: 600, date, dateMode: 'exact', debtId: debt.id, note: 'Старое пояснение' } as const;
  const review = { ...main, key: 'review-test', amount: 30 };
  const store = await reopen(5, { ...old, oneOff: [main, review], checklist: [{id:'check',title:'Сверить', due: date }] });
  const patch = exchange({
    calendar: [{ key: review.key, projection: 'review', reviewFor: main.key }],
    events: [{ key: main.key, note: 'Сверить карту' }],
    checklist: [{ id: 'check', due: '', afterReceiptKey: 'expected-receipt' }],
  });
  const before = store.getState();
  const selected = new Set(previewExchange(patch, before, date).map(entry => entry.id));
  store.getState().applySync(applyExchange(patch, before, date, selected, () => 'test'));
  const after = store.getState();
  expect(previewExchange(patch, after, date)).toEqual([]);
  expect(ledger(after)).toEqual(ledger(before));
  expect(after.marks).toEqual(before.marks);
  expect(after.oneOff.find(e => e.key === main.key)).toEqual({ ...main, note: 'Сверить карту' });
  const alert = (marks: typeof before.marks) => alerts({ cal: after, marks, checklist: after.checklist, now: date,
    checks: after.checks, lastBackupAt: date, lastIcsAt: date, nowMs: Date.parse(at), expenses: [], wishes: [] });
  expect(alert(after.marks).map(r => r.id)).not.toContain('check:check');
  expect(alert({ ...after.marks, 'expected-receipt': { done: true, at, paidDate: date, amount: 200 } }).map(r => r.id)).toContain('check:check');
});

it('переносит журнал из версии 8, оставляет неизменяемый снимок и повторно открывает копию', async () => {
  storage.clear();
  const first = { id: 'trip-1', amount: 95, source: 'life', category: 'transport', date: '2026-11-21', createdAt: at } as const;
  const source = { ...old, expenses: [first, { ...first, id: 'trip-2' }], accountBook: { ...EMPTY_BOOK, paymentRouting: 'life' } };
  const initial = JSON.stringify({ version: 8, state: source });
  const firstOpen = await reopen(8, source);
  const savedJournal = firstOpen.getState().accountBook;
  const store = await reopen(8, source);
  expect(store.getState().accountBook).toEqual(savedJournal);
  expect(storage.get('kurs:before-0.9.0')).toBe(initial);
  const current = store.getState();
  expect(current.expenses).toEqual(source.expenses);
  expect(current.accountBook.operations.map(op => op.id)).toEqual(['expense:trip-1', 'expense:trip-2']);
  expect(ledger({ ...current, now: '2026-11-21' }).card).toBe(2810);
  current.updateExpense('trip-2', { amount: 100 });
  expect(ledger({ ...store.getState(), now: '2026-11-21' }).card).toBe(2805);
  current.removeExpense('trip-1');
  expect(ledger({ ...store.getState(), now: '2026-11-21' }).card).toBe(2900);
  expect(store.getState().accountBook.expenseChanges?.map(change => change.before.id)).toEqual(['trip-2', 'trip-1']);
  const backup = JSON.parse(current.exportData());
  for (let i = 0; i < 2; i++) expect(current.importData(backup)).toBe(true);
  const restarted = await reopen(9, store.getState());
  expect(restarted.getState().accountBook.operations.map(op => op.id)).toEqual(['expense:trip-2']);
  expect(ledger({ ...restarted.getState(), now: '2026-11-21' }).card).toBe(2900);
  expect(storage.get('kurs:before-0.9.0')).toBe(initial);
});

it('сверяет дублированный расход и доступные остатки одним патчем, сохраняя историю', async () => {
  const day = '2026-11-21';
  const key = 'fix:sample:2026-12';
  const expense = { id: 'history', date: day, amount: 150, category: 'fixed', source: 'reserve', createdAt: at } as const;
  const operation = { id: 'payment', type: 'expense', eventKey: key, accountId: 'life', date: day, amount: 150,
    status: 'confirmed', origin: 'manual', fundingSource: 'unknown' } as const;
  const store = await reopen(8, { ...old, expenses: [expense], accountBook: { ...EMPTY_BOOK, operations: [operation] },
    marks: { [key]: { done: true, at, paidDate: day, amount: 150 } } });
  const before = store.getState();
  const revision = exchangeRevision(before);
  const patch: ExchangeFile = { app: 'kurs-exchange', version: 2, protocolVersion: '2.8', from: 'chat', date: day,
    patchId: 'reconcile-sample', baseRevision: revision, exportId: day + '-' + revision,
    paymentReconciliation: [{ operationId: operation.id, expenseId: expense.id, transferId: 'funded', reason: 'Подтверждение' }],
    bankCorrection: [['life', 3000, 3000], ['reserve', 7000, 6850]].map(([key, oldValue, newValue]) => ({
      key: String(key), oldValue: Number(oldValue), newValue: Number(newValue), date: day, revision,
      availableSnapshot: true, source: 'Выписка', reason: 'Остаток',
    })) };
  expect(prepareExchange({ ...patch, exportId: 'stale' }, before, day).errors).not.toEqual([]);
  expect(prepareExchange(patch, before, day).errors).toEqual([]);
  before.applySync(applyExchange(patch, before, day, null, () => 'sample'), 'Сверка');
  const after = store.getState();
  expect(after.expenses).toEqual([expense]);
  expect(after.marks).toEqual(before.marks);
  expect(after.accountBook.operations.map(row => row.id)).toEqual(['funded', 'payment']);
  expect(ledger({ ...after, now: day })).toMatchObject({ card: 3000, reserve: 6850, heldOnCard: 0 });
  expect(prepareExchange(patch, after, day)).toMatchObject({ sections: [], errors: [] });
});

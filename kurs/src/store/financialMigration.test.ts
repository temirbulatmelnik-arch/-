import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_BOOK, RESERVE_ACCOUNT, type AccountOperation } from '../domain/accounts';
import { applyExchange, buildExchange, previewExchange, type ExchangeFile } from '../domain/exchange';
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
    expect(store.getState().accountBook).toEqual(EMPTY_BOOK);
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
    expect(file.protocolVersion).toBe('2.7');
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
  expect(ledger(after)).toEqual(ledger(before));
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

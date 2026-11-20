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

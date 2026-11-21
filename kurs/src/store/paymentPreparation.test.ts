import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_BOOK, LIFE_ACCOUNT, RESERVE_ACCOUNT, type AccountOperation } from '../domain/accounts';
import { eventsBetween } from '../domain/calendar';
import { coverage, coverageInput, safePrepayment } from '../domain/coverage';
import { applyExchange, previewExchange, type ExchangeFile } from '../domain/exchange';
import { moscowClock, paymentPreparations, weeklyTopUp } from '../domain/funds';
import { buildIcs, calendarTest } from '../domain/ics';
import { ledger } from '../domain/ledger';
import type { CalEvent } from '../domain/types';

const day = '2026-11-30';
const at = day + 'T16:00:00.000Z';
const next = '2026-12-01';
const base = { ready: true, cardBalance: { amount: 1760, date: day, at, source: 'manual' },
  reserve: 60000.66, reserveLog: [{ id: 'reserve-start', date: day, at, abs: true, amount: 60000.66, note: 'Сверка' }],
  weeklyOverrides: [{ from: day, to: '2026-12-06', amount: 10500 }], templateFrom: '2027-01',
  marks: {}, accountBook: EMPTY_BOOK };
const split: CalEvent = { key: 'payment-1', kind: 'payment', title: 'Рассрочка', accountId: LIFE_ACCOUNT, amount: 25184, date: next, dateMode: 'exact' };
const unknown: CalEvent = { key: 'payment-unknown', kind: 'payment', title: 'Минимум', amount: 18926.71,
  date: '2026-12-02', dateMode: 'until' };
const salary: CalEvent = { key: 'inc:salary:2026-11', kind: 'income', incomeKind: 'salary', title: 'Зарплата',
  amount: 53513, accountId: LIFE_ACCOUNT, date: day, dateMode: 'exact' };

const storage = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

async function open(overrides = {}) {
  storage.set('kurs', JSON.stringify({ version: 5, state: { ...base, oneOff: [split, unknown, salary], ...overrides } }));
  vi.resetModules();
  return (await import('./store')).useStore;
}

describe('подготовка обязательств и движение между счетами', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('window', { localStorage });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(day + 'T17:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('доливает 8 740 до 10 500 и не записывает доход или расход', async () => {
    const store = await open();
    const s = store.getState;
    const before = ledger(s());
    expect(before.lifeAvailable).toBe(1760);
    expect(weeklyTopUp(10500, before.lifeAvailable!)).toBe(8740);
    expect(s().confirmWeeklyTransfer('wk:2026-11-30', 8740)).toBe(true);
    expect(s().confirmWeeklyTransfer('wk:2026-11-30', 8740)).toBe(false);
    const after = ledger(s());
    expect(after).toMatchObject({ card: 10500, lifeAvailable: 10500, reserve: 51260.66 });
    expect(after.card! + after.reserve).toBeCloseTo(before.card! + before.reserve, 2);
    expect(s().accountBook.operations).toMatchObject([{ type: 'transfer', purpose: 'weekly' }]);
    expect(s().expenses).toEqual([]);
  });

  it('удерживает частичное пополнение, пересчитывает довзнос и списывает деньги только с карты', async () => {
    const store = await open();
    const s = store.getState;
    expect(s().fundPayment('t1', 'reserve', [split.key], next, LIFE_ACCOUNT, 5000, day)).toBe(true);
    expect(s().fundPayment('t1', 'reserve', [split.key], next, LIFE_ACCOUNT, 5000, day)).toBe(false);
    let led = ledger(s());
    expect(led).toMatchObject({ card: 6760, lifeAvailable: 1760, heldOnCard: 5000, reserve: 55000.66 });
    expect(paymentPreparations([split, unknown], s().marks, led.heldForPayments, led.reserve))
      .toMatchObject([{ total: 25184, prepared: 5000, toFund: 20184, remindDate: day }, { toFund: null }]);
    expect(s().fundPayment('t2', 'reserve', [split.key], next, LIFE_ACCOUNT, 20184, day)).toBe(true);
    expect(ledger(s())).toMatchObject({ card: 26944, lifeAvailable: 1760, heldOnCard: 25184, reserve: 34816.66 });
    vi.setSystemTime(new Date(next + 'T12:00:00Z'));
    s().markEvent(split, true, 25184, 'card', { accountId: LIFE_ACCOUNT, paidDate: next });
    s().markEvent(split, true, 25184, 'card', { accountId: LIFE_ACCOUNT, paidDate: next });
    led = ledger(s());
    expect(led).toMatchObject({ card: 1760, lifeAvailable: 1760, heldOnCard: 0, reserve: 34816.66 });
    expect(s().accountBook.operations.map(op => op.type)).toEqual(['transfer', 'transfer', 'expense']);
    expect(s().marks[split.key]).toMatchObject({ done: true, amount: 25184, paidDate: next });
  });

  it('сохраняет просрочку и остаток после частичного списания или изменения суммы', async () => {
    const store = await open();
    const s = store.getState;
    s().fundPayment('t', 'reserve', [split.key], next, LIFE_ACCOUNT, 25184, day);
    vi.setSystemTime(new Date('2026-12-02T12:00:00Z'));
    expect(s().marks[split.key]).toBeUndefined();
    expect(ledger(s()).heldOnCard).toBe(25184);
    s().markEvent(split, true, 8000, 'card', { accountId: LIFE_ACCOUNT, partialId: 'part', paidDate: next });
    s().markEvent(split, true, 8000, 'card', { accountId: LIFE_ACCOUNT, partialId: 'part', paidDate: next });
    expect(s().marks[split.key]).toBeUndefined();
    let remaining = eventsBetween(s(), next, next).find(e => e.key === split.key)!;
    expect(remaining.amount).toBe(17184);
    s().setOverride(split.key, { amount: 23184, date: '2026-12-03' });
    remaining = eventsBetween(s(), next, '2026-12-03').find(e => e.key === split.key)!;
    expect(remaining.amount).toBe(15184);
    s().markEvent(remaining, true, 15184, 'card', { accountId: LIFE_ACCOUNT, paidDate: '2026-12-02' });
    expect(ledger(s())).toMatchObject({ heldOnCard: 2000, lifeAvailable: 1760 });
    expect(s().marks[split.key].amount).toBe(23184);
    expect(s().returnEarmark('return', LIFE_ACCOUNT, split.key, 2000, '2026-12-02')).toBe(true);
    expect(ledger(s())).toMatchObject({ heldOnCard: 0, lifeAvailable: 1760, reserve: 36816.66 });
  });

  it('оставляет необъяснённый излишек банковского остатка вне недельных денег', async () => {
    const store = await open();
    store.getState().setCardBalance({ amount: 2160.41, date: day, source: 'manual' });
    expect(ledger(store.getState())).toMatchObject({ card: 2160.41, lifeAvailable: 1760, unassignedOnCard: 400.41 });
  });

  it('изолирует фактическую зарплату и сохраняет назначение после новой сверки', async () => {
    const store = await open();
    const s = store.getState;
    s().markEvent(salary, true, salary.amount);
    s().markEvent(salary, true, salary.amount);
    expect(ledger(s())).toMatchObject({ card: 55273, lifeAvailable: 1760, incomeOnCard: 53513 });
    s().setCardBalance({ amount: 55273, date: day, source: 'manual' });
    expect(ledger(s()).incomeOnCard).toBe(53513);
    expect(s().sweepIncome('sweep', LIFE_ACCOUNT, 53513, day)).toBe(true);
    expect(s().sweepIncome('sweep', LIFE_ACCOUNT, 53513, day)).toBe(false);
    expect(ledger(s())).toMatchObject({ card: 1760, lifeAvailable: 1760, incomeOnCard: 0, reserve: 113513.66 });
    expect(s().accountBook.operations.map(op => op.type)).toEqual(['income', 'transfer']);
  });

  it('выделяет часть полученного дохода и проводит отдельный маршрут до другого банка', async () => {
    const other = { ...split, accountId: 'known' };
    const store = await open({ oneOff: [other, salary], accountBook: { ...EMPTY_BOOK,
      accounts: [{ id: 'known', name: 'Счёт списания', balance: { amount: 0, date: day, at } }] } });
    const s = store.getState;
    s().markEvent(salary, true, salary.amount);
    expect(s().fundPayment('a', 'allocate', [other.key], next, 'known', 5000, day)).toBe(false);
    expect(s().fundPayment('direct', 'via', [other.key], next, 'known', 5000, day)).toBe(true);
    let led = ledger(s());
    expect(led).toMatchObject({ card: 60273, lifeAvailable: 1760, heldOnCard: 5000 });
    expect(paymentPreparations([other], s().marks, led.heldForPayments, led.reserve)[0]).toMatchObject({ inTransit: 5000, toFund: 20184 });
    expect(s().fundPayment('leg-two', 'forward', [other.key], next, 'known', 5000, day)).toBe(true);
    led = ledger(s());
    expect(led.cashAccounts[0].expected).toBe(5000);
    expect(led).toMatchObject({ card: 55273, lifeAvailable: 1760, heldOnCard: 0, reserve: 55000.66 });
    s().setPaymentAccount(other.key, LIFE_ACCOUNT);
    expect(s().fundPayment('a', 'allocate', [other.key], next, LIFE_ACCOUNT, 3500, day)).toBe(true);
    expect(ledger(s())).toMatchObject({ card: 55273, lifeAvailable: 1760, heldOnCard: 3500, incomeOnCard: 50013 });
  });

  it('сохраняет 0.5.2, хранит локальную копию, переносит назначения через JSON 2.7 один раз', async () => {
    const source = await open({ checks: { kept: { done: true, at } } });
    expect(JSON.parse(storage.get('kurs:before-0.6.0')!).version).toBe(5);
    source.getState().fundPayment('t', 'reserve', [split.key], next, LIFE_ACCOUNT, 5000, day);
    const copy = JSON.parse(source.getState().exportData());
    expect(copy.checks.kept.done).toBe(true);
    const ops = source.getState().accountBook.operations;
    const file: ExchangeFile = { app: 'kurs-exchange', version: 2, protocolVersion: '2.7', accountBook: { operations: ops } };
    vi.resetModules();
    const restored = (await import('./store')).useStore;
    expect(ledger(restored.getState()).heldOnCard).toBe(5000);
    const target = await open();
    const patch = applyExchange(file, target.getState(), day, new Set(['accountBook']), () => 'import');
    target.getState().applySync(patch, 'Помечено');
    expect(previewExchange(file, target.getState(), day)).toEqual([]);
    expect(target.getState().marks[split.key]).toBeUndefined();
    expect(ledger(target.getState())).toMatchObject({ lifeAvailable: 1760, heldOnCard: 5000, reserve: 55000.66 });
    target.getState().rollbackImport(target.getState().imports[0].id);
    expect(ledger(target.getState())).toMatchObject({ lifeAvailable: 1760, heldOnCard: 0, reserve: 60000.66 });
  });

  it('не обещает использовать недельные деньги для платежа и сохраняет отдельный риск маршрута', async () => {
    const store = await open({ cardBalance: { ...base.cardBalance, amount: 10500 } });
    const s = store.getState();
    const led = ledger(s);
    expect(paymentPreparations([split, unknown], s.marks, led.heldForPayments, led.reserve)[0].toFund).toBe(25184);
    const input = coverageInput(s, led);
    const result = coverage(input, day, 'base', '2026-12-02');
    expect(result.paymentFunding?.find(p => p.key === split.key)).toMatchObject({ fromReserve: 25184, held: 0, prepareBy: day });
    expect(result.paymentFunding?.find(p => p.key === unknown.key)).toMatchObject({ fromReserve: null, shortfall: null });
    expect(result.steps.filter(step => step.key === split.key).map(step => step.delta)).toEqual([-25184]);
    expect(safePrepayment(input, day, RESERVE_ACCOUNT)).toBe(0);
  });
});

describe('уведомление Календаря iPhone', () => {
  it('объединяет списания со счёта и назначает сигнал на 20:00 МСК с переходом месяца', () => {
    const items = [split, { ...split, key: 'payment-2', amount: 400 }, unknown];
    const weekly: CalEvent = { key: 'wk:2026-11-30', date: '2026-11-29', dateMode: 'exact', title: 'Неделя', kind: 'weekly', amount: 10500 };
    const groups = paymentPreparations(items, {}, [], 20000);
    expect(groups).toHaveLength(2);
    const out = buildIcs([...items, weekly], { hideAmounts: true, remindDays: [1], time: '10:00',
      now: new Date('2026-11-28T09:00:00Z'), preparation: { groups, time: '20:00' } });
    expect(out.match(/DTSTART:20261130T170000Z/g)).toHaveLength(1);
    expect(out).toContain('DTSTART:20261201T170000Z');
    expect(out).toContain('DTSTART:20261129T170000Z');
    expect(out.match(/TRIGGER:PT0S/g)).toHaveLength(3);
    expect(out).not.toContain('25184');
    expect(moscowClock(new Date('2026-11-30T21:00:00Z'))).toEqual({ date: next, time: '00:00' });
    expect(calendarTest(new Date('2026-11-30T16:57:00Z'))).toContain('DTSTART:20261130T170000Z');
  });

  it('не создаёт повторные напоминания о закрытом и уже подготовленном платеже', () => {
    const move: AccountOperation = { id: 't', date: day, at, status: 'confirmed', amount: split.amount,
      type: 'transfer', purpose: 'prepare', accountId: RESERVE_ACCOUNT, toAccountId: LIFE_ACCOUNT,
      fundingSource: 'own', origin: 'manual', shares: [{ key: split.key, amount: split.amount }] };
    const led = ledger({ ...base, now: day, accountBook: { ...EMPTY_BOOK, operations: [move] },
      checkups: [], cardBalance: { ...base.cardBalance, source: 'manual' }, expenses: [], oneOff: [split], debts: [], bridge: null });
    const groups = paymentPreparations([split], {}, led.heldForPayments, led.reserve);
    expect(groups[0].toFund).toBe(0);
    const out = buildIcs([split], { hideAmounts: false, remindDays: [1], time: '10:00',
      now: new Date('2026-11-28T09:00:00Z'), preparation: { groups, time: '20:00' } });
    expect(out).not.toContain('BEGIN:VALARM');
    expect(paymentPreparations([split], { [split.key]: { done: true, at } }, led.heldForPayments, led.reserve)).toEqual([]);
  });
});

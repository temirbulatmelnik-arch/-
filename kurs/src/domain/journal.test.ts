import { describe, expect, it } from 'vitest';
import { appendOperations, budgetExpenses, EMPTY_BOOK, postings, type AccountOperation } from './accounts';
import { today } from './dates';
import { paymentBudget, weeklyTopUp } from './funds';
import { ledger, type LedgerInput } from './ledger';
import { availableToday, dayBudget, weekSummary } from './summary';
import type { Expense } from './types';

const date = '2026-11-26';
const bank = '2026-11-23';
const at = bank + 'T10:00:00Z';
const base: LedgerInput = {
  now: date, debts: [], bridge: null, expenses: [], marks: {}, oneOff: [], checkups: [],
  cardBalance: { amount: 7000, date: bank, at, source: 'manual' },
  reserve: 10000, reserveLog: [{ id: 'check', date: bank, at, amount: 10000, abs: true, note: 'Сверка' }],
};
const op = { date, status: 'confirmed', origin: 'manual', fundingSource: 'own' } as const;
const book = (operations: AccountOperation[]) => ({ ...EMPTY_BOOK, operations });
const bill = 'fix:phone:2026-12';
const limit = [{ from: bank, to: '2026-11-29', amount: 7000 }];
const prepare: AccountOperation = { ...op, id: 'prepare', type: 'transfer', accountId: 'reserve', toAccountId: 'life',
  purpose: 'prepare', amount: 1270, shares: [{ key: bill, amount: 1270 }] };
const pay: AccountOperation = { ...op, id: 'pay', type: 'expense', eventKey: bill, accountId: 'life', amount: 1270,
  budget: paymentBudget(1270, 1270) };
const expense = (id: string, amount: number, source: Expense['source'] = 'life', category: Expense['category'] = 'groceries'): Expense =>
  ({ id, date, amount, source, category, createdAt: at });

describe('финансовый журнал', () => {
  it('подготовка и списание двигают деньги единожды, свободный остаток сохраняется', () => {
    const before = ledger({ ...base, accountBook: book([prepare]) });
    expect(before).toMatchObject({ card: 8270, lifeAvailable: 7000, heldOnCard: 1270, reserve: 8730 });
    expect(before.card! + before.reserve).toBe(17000);
    const operations = appendOperations([prepare, pay], [prepare, pay, { ...pay, id: 'repeat' }]);
    expect(operations).toHaveLength(2);
    const after = ledger({ ...base, accountBook: book(operations) });
    expect(after).toMatchObject({ card: 7000, lifeAvailable: 7000, heldOnCard: 0, reserve: 8730 });
    expect(after.card! + after.reserve).toBe(15730);
    expect(weekSummary(budgetExpenses([], book(operations)), [], limit, date).spent).toBe(0);
  });

  it('три назначения платежей и смешанная оплата дают независимые банковские и недельные эффекты', () => {
    const expenses = [expense('card', 250), expense('reserve', 250, 'reserve'),
      { ...expense('subscription', 250, 'life', 'fixed'), budgetScope: 'weekly' as const }];
    const prep = { ...prepare, amount: 300, shares: [{ key: bill, amount: 300 }] };
    const mixed = { ...pay, amount: 500, budget: paymentBudget(500, 300, 'weekly') };
    const accountBook = book([prep, mixed]);
    expect(ledger({ ...base, expenses, accountBook })).toMatchObject({ card: 6300, reserve: 9450 });
    const budget = budgetExpenses(expenses, accountBook);
    expect(weekSummary(budget, [], limit, date)).toMatchObject({ spent: 950, left: 6050 });
    expect(dayBudget(budget, [], limit, date)).toMatchObject({ spentLife: 700, spentReserve: 250, spentToday: 950 });
  });

  it('повторно не прибавляет аванс и считает предлагаемое пополнение из свободных денег', () => {
    const income: AccountOperation = { ...op, type: 'income', accountId: 'life', amount: 42913.57, pendingSweep: true, id: 'advance', eventKey: 'inc:advance:2026-11' };
    const sweep: AccountOperation = { ...op, type: 'transfer', purpose: 'sweep', id: 'sweep', amount: income.amount, accountId: 'life', toAccountId: 'reserve' };
    const operations = appendOperations([income], [income, { ...income, id: 'duplicate' }]);
    const received = ledger({ ...base, accountBook: book(operations) });
    const swept = ledger({ ...base, accountBook: book([...operations, sweep]) });
    expect(received).toMatchObject({ card: 49913.57, reserve: 10000, incomeOnCard: income.amount, lifeAvailable: 7000 });
    expect(swept).toMatchObject({ card: 7000, reserve: 52913.57, incomeOnCard: 0, lifeAvailable: 7000 });
    const small = { ...base, cardBalance: { ...base.cardBalance!, amount: 300 } };
    const led = ledger({ ...small, accountBook: book([{ ...income, amount: 5000 }, { ...prepare, amount: 1200, shares: [{ key: bill, amount: 1200 }] }]) });
    expect(led).toMatchObject({ card: 6500, lifeAvailable: 300, incomeOnCard: 5000, heldOnCard: 1200 });
    expect(weeklyTopUp(7000, led.lifeAvailable!)).toBe(6700);
  });

  it('две одинаковые поездки считаются раздельно, а возврат уменьшает исходную неделю', () => {
    const expenses = [expense('trip-a', 95), expense('trip-b', 95), expense('credit', 250, 'credit')];
    const refund: AccountOperation = { ...op, id: 'refund-a', type: 'refund', expenseId: 'trip-a', accountId: 'life', amount: 95 };
    const operations = appendOperations([refund], [refund]);
    const led = ledger({ ...base, expenses, accountBook: book(operations) });
    expect(led.card).toBe(6905);
    expect(weekSummary(budgetExpenses(expenses, book(operations)), [], limit, date).spent).toBe(345);
  });

  it('авторизация отделяется от проведённого остатка и может быть проведена или отменена', () => {
    const purchase = expense('order', 250);
    const authorization: AccountOperation = { ...op, id: 'order-auth', type: 'expense', accountId: 'life', amount: 250, authorization: true,
      expenseId: purchase.id, budget: paymentBudget(250, 0, 'weekly') };
    const check = (operations: AccountOperation[]) => ledger({ ...base, expenses: [purchase],
      cardBalance: { ...base.cardBalance!, kind: 'posted' }, accountBook: book(operations) });
    expect(check([authorization])).toMatchObject({ card: 6750, cardPosted: 7000 });
    const posted = { ...authorization, authorization: undefined };
    expect(check(appendOperations([authorization], [posted, posted]))).toMatchObject({ card: 6750, cardPosted: 6750 });
    expect(check(appendOperations([authorization], [{ ...authorization, status: 'voided' }]))).toMatchObject({ card: 7000, cardPosted: 7000 });
  });

  it('показывает конфликт снимка и сходный платёж без автоматического создания проводок', () => {
    const onBankDay: AccountOperation = { ...op, id: 'unknown-time', type: 'expense', accountId: 'life', amount: 100, date: bank };
    const candidate = { ...expense('original', 1270, 'reserve', 'fixed'), note: 'Связь' };
    const state = { ...base, fixed: [{ id: 'phone', name: 'Связь, подписка', day: 8, amount: 1270 }], expenses: [candidate] };
    const unresolved = ledger({ ...state, accountBook: book([pay, onBankDay]) });
    expect(unresolved.reconciliation).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'possible_duplicate', relatedId: candidate.id }),
      expect.objectContaining({ kind: 'snapshot_order', operationId: onBankDay.id }),
    ]));
    expect(unresolved).toMatchObject({ card: 5730, reserve: 8730 });
    const linked = { ...pay, expenseId: candidate.id };
    expect(ledger({ ...state, accountBook: book([prepare, linked]) })).toMatchObject({ card: 7000, reserve: 8730, heldOnCard: 0, reconciliation: [] });
  });

  it('московский день меняется в 21:00 UTC, дневной лимит ограничен свободной картой', () => {
    expect(today(new Date('2026-11-29T20:59:59Z'))).toBe('2026-11-29');
    expect(today(new Date('2026-11-29T21:00:00Z'))).toBe('2026-11-30');
    const day = dayBudget([expense('today', 50)], [], limit, date);
    expect(day).toMatchObject({ day: 1750, spentToday: 50, canSpend: 1700 });
    expect(availableToday(day, 90)).toBe(90);
    expect(availableToday(day, 0)).toBe(0);
  });

  it('серии переводов, платежей и возвратов дают сбалансированные копейки и воспроизводимые итоги', () => {
    let random = 49;
    const operations: AccountOperation[] = [];
    for (let i = 0; i < 150; i++) {
      random = (random * 48271) % 2147483647;
      const amount = (random % 850 + 1) / 100;
      operations.push({ ...prepare, id: 'transfer-' + i, amount, shares: [{ key: bill, amount }] });
      if (i % 2 === 0) operations.push({ ...pay, id: 'charge-' + i, eventKey: undefined, amount, budget: paymentBudget(amount, 0, 'weekly') });
      if (i % 6 === 0) operations.push({ ...op, id: 'refund-' + i, type: 'refund', expenseId: 'charge-' + i, accountId: 'life', amount });
    }
    const cash = (row: ReturnType<typeof ledger>) => Math.round((row.card! + row.reserve) * 100);
    expect(operations.every(row => postings(row).reduce((sum, p) => sum + p.amount, 0) === 0)).toBe(true);
    expect(cash(ledger({ ...base, accountBook: book(operations.filter(row => row.type === 'transfer')) }))).toBe(1700000);
    expect(appendOperations(operations, JSON.parse(JSON.stringify(operations)))).toBe(operations);
    expect(ledger({ ...base, accountBook: book(JSON.parse(JSON.stringify(operations))) })).toEqual(ledger({ ...base, accountBook: book(operations) }));
  });
});

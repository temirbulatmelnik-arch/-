import { describe, expect, it } from 'vitest';
import { accountProjection, appendOperations, debtProjection, EMPTY_BOOK, type AccountOperation } from './accounts';
import { eventsBetween } from './calendar';
import type { Debt, Expense } from './types';

const date = '2026-11-20';
const at = '2026-11-20T12:00:00.000Z';
const anchor = { amount: 10000, date, at: '2026-11-20T11:00:00.000Z' };
const account = { id: 'debit', name: 'Дебетовая', balance: anchor };
const debt: Debt = { id: 'loan', short: 'Заём', name: 'Заём', kind: 'split', balance: 10000, startBalance: 10000,
  rate: 0, dueDay: 20, rule: { type: 'fixed', amount: 1000 }, frozen: true, order: 1, closed: false, bankBalance: anchor };
const common = { date, at, accountId: account.id, origin: 'bank', status: 'confirmed', fundingSource: 'unknown' } as const;
const loan: AccountOperation = { ...common, id: 'loan-op', type: 'loan_disbursement', amount: 8500, debtId: debt.id, fundingSource: 'borrowed', externalId: 'x' };

describe('счета и экономический смысл операций', () => {
  it('учитывает заём один раз; покупка с дебетовой карты долг повторно не увеличивает', () => {
    const operations = appendOperations([], [loan, { ...loan, id: 'retry' }]);
    const book = { ...EMPTY_BOOK, accounts: [account], operations };
    const purchase: Expense = { id: 'e', date, amount: 2400, createdAt: at, category: 'fun', source: 'life', accountId: account.id, fundingSource: 'borrowed' };
    expect(accountProjection(book, [purchase], date)[0].expected).toBe(16100);
    expect(debtProjection(debt, [purchase], book, date).estimated).toBe(18500);
    expect(debtProjection(debt, [], { ...book, operations: [{ ...loan, debtBooked: true }] }, date).estimated).toBe(10000);
    expect(debtProjection({ ...debt, bankBalance: { ...anchor, includedIds: [loan.id] } }, [], book, date).estimated).toBe(10000);
  });

  it('перевод между своими счетами сохраняет сумму, а погашение отделяет проценты от тела', () => {
    const transfer: AccountOperation = { ...common, id: 't', type: 'transfer', toAccountId: 'other', amount: 5000 };
    const payment: AccountOperation = { ...common, id: 'p', type: 'debt_payment', amount: 2000, principal: 1500, interest: 500, debtId: debt.id };
    const book = { ...EMPTY_BOOK, accounts: [account, { ...account, id: 'other', balance: { ...anchor, amount: 0 } }], operations: [transfer] };
    expect(accountProjection(book, [], date).map(a => a.expected)).toEqual([5000, 5000]);
    const paid = { ...book, operations: [transfer, payment] };
    expect(accountProjection(paid, [], date).map(a => a.expected)).toEqual([3000, 5000]);
    expect(debtProjection(debt, [], paid, date).estimated).toBe(8500);
    expect(debtProjection(debt, [], { ...book, operations: [{ ...payment, principal: undefined }] }, date))
      .toMatchObject({ estimated: 10000, unknownPrincipal: 2000 });
  });

  it('групповое автосписание Сплита заменяет только явно указанные строки', () => {
    const cal = { debts: [debt], fixed: [], incomes: [], oneOff: [], weeklyOverrides: [], templateFrom: '2026-11',
      accountBook: { ...EMPTY_BOOK, splitDebits: [{ id: 'group', date, amount: 1700, debtIds: [debt.id], accountId: account.id, replacesKeys: ['pay:loan:2026-11'] }] } };
    expect(eventsBetween(cal, date, date)).toEqual([expect.objectContaining({ key: 'split-debit:group', amount: 1700, accountId: 'debit' })]);
  });
});

describe('возврат и повторный импорт', () => {
  it('уменьшает бюджет покупки без зарплатного дохода', async () => {
    const { budgetExpenses } = await import('./accounts');
    const purchase: Expense = { id: 'e', date, amount: 900, category: 'transport', source: 'life', accountId: account.id, createdAt: at };
    const refund: AccountOperation = { ...common, id: 'r', type: 'refund', amount: 300, expenseId: purchase.id };
    const book = { ...EMPTY_BOOK, accounts: [account], operations: appendOperations([], [refund, refund]) };
    expect(budgetExpenses([purchase], book)[0].amount).toBe(600);
    expect(accountProjection(book, [purchase], date)[0].expected).toBe(9400);
    expect(book.operations[0].type).toBe('refund');
  });
});

it('выдачи к сверке не создают обязательств до подтверждения, а одинаковые суммы проверяются отдельно', async () => {
  const { bookOperationAllowed } = await import('./accounts');
  const review = [{ id: 'a', from: date, to: date, amount: 8500, label: 'Выдача на счёт' },
    { id: 'b', from: date, to: date, amount: 8500, label: 'Вторая выдача' }];
  const book = { ...EMPTY_BOOK, accounts: [account], loanReviews: review };
  expect(debtProjection(debt, [], book, date).estimated).toBe(debt.balance);
  expect(bookOperationAllowed({ ...loan, auditId: 'a' }, book, [debt], [])).toBe(false);
  const a = { ...loan, auditId: 'a', debtBooked: true } as const;
  const b = { ...a, id: 'b-op', auditId: 'b', externalId: 'y' };
  expect(bookOperationAllowed(a, book, [debt], [])).toBe(true);
  const operations = appendOperations([], [a, { ...a, id: 'repeat-a', externalId: 'z' }, b]);
  expect(operations.map(op => op.id)).toEqual([a.id, b.id]);
  expect(debtProjection(debt, [], { ...book, operations }, date).estimated).toBe(debt.balance);
});

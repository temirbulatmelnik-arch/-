import { monthKey } from './dates';
import type { Debt, Expense } from './types';

export const LIFE_ACCOUNT = 'life';
export const RESERVE_ACCOUNT = 'reserve';

export interface BankBalance {
  amount: number;
  date: string;
  at?: string;
  includedIds?: string[];
}

export interface CashAccount {
  id: string;
  name: string;
  balance?: BankBalance;
}

interface OperationBase {
  id: string;
  date: string;
  at?: string;
  amount: number;
  accountId: string;
  eventKey?: string;
  externalId?: string;
  note?: string;
  origin: 'manual' | 'bank' | 'exchange';
  status: 'confirmed' | 'planned';
  fundingSource: 'own' | 'borrowed' | 'unknown';
}

export type AccountOperation = OperationBase & (
  { type: 'transfer'; toAccountId: string }
  | { type: 'loan_disbursement'; debtId: string; splitPlanId?: string; debtBooked?: boolean }
  | { type: 'debt_payment'; debtId: string; principal?: number; interest?: number; fee?: number; debtBooked?: boolean }
  | { type: 'interest' | 'fee'; debtId?: string }
  | { type: 'income' | 'adjustment' }
  | { type: 'refund'; expenseId: string }
);

export interface SplitPlan {
  id: string;
  debtId: string;
  name: string;
  schedule: { date: string; amount: number }[];
  payoff?: { date: string; amount: number };
}

export interface SplitDebit {
  id: string;
  date: string;
  amount: number;
  accountId: string;
  debtIds: string[];
  replacesKeys: string[];
}

export interface AccountBook {
  accounts: CashAccount[];
  operations: AccountOperation[];
  paymentAccounts: Record<string, string>;
  splitPlans: SplitPlan[];
  splitDebits: SplitDebit[];
  stress?: { date: string; amount: number; accountId: string };
}

export const EMPTY_BOOK: AccountBook = { accounts: [], operations: [], paymentAccounts: {}, splitPlans: [], splitDebits: [] };

export const cents = (amount: number) => Math.round(amount * 100);
export const rubles = (amount: number) => amount / 100;
export const kopecks = (amount: number) => rubles(cents(amount));

export function validDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = Date.parse(date);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date;
}

export const validAmount = (amount: unknown): amount is number => typeof amount === 'number' &&
  Number.isFinite(amount) && Math.abs(amount) <= Number.MAX_SAFE_INTEGER / 100;

export function validOperation(op: AccountOperation): boolean {
  if (!op || typeof op.id !== 'string' || !op.id || !validDate(op.date) ||
      !validAmount(op.amount) || op.amount <= 0 || typeof op.accountId !== 'string' || !op.accountId ||
      !['confirmed', 'planned'].includes(op.status) ||
      !['manual', 'bank', 'exchange'].includes(op.origin) ||
      !['own', 'borrowed', 'unknown'].includes(op.fundingSource) ||
      (op.at != null && (typeof op.at !== 'string' || !Number.isFinite(Date.parse(op.at))))) return false;
  switch (op.type) {
    case 'transfer': return typeof op.toAccountId === 'string' && !!op.toAccountId && op.accountId !== op.toAccountId;
    case 'loan_disbursement': return typeof op.debtId === 'string' && !!op.debtId && op.fundingSource === 'borrowed';
    case 'refund': return typeof op.expenseId === 'string' && !!op.expenseId;
    case 'debt_payment': {
      const parts = [op.principal, op.interest, op.fee];
      return typeof op.debtId === 'string' && !!op.debtId
        && parts.every(p => p == null || (validAmount(p) && p >= 0))
        && parts.reduce<number>((sum, p) => sum + cents(p ?? 0), 0) <= cents(op.amount);
    }
    case 'income': case 'interest': case 'fee': case 'adjustment': return true;
    default: return false;
  }
}

export function appendOperations(existing: AccountOperation[], incoming: AccountOperation[]): AccountOperation[] {
  const ids = new Set(existing.map(op => op.id));
  const eventKeys = new Set(existing.flatMap(op => op.eventKey ? [op.eventKey] : []));
  const externalKey = (op: AccountOperation) => op.externalId ? JSON.stringify([op.accountId, op.externalId]) : null;
  const external = new Set(existing.map(externalKey).filter(k => k != null));
  const added: AccountOperation[] = [];
  for (const op of incoming) {
    if (!validOperation(op)) continue;
    const key = externalKey(op);
    if (ids.has(op.id) || (key && external.has(key)) || (op.eventKey && eventKeys.has(op.eventKey))) continue;
    ids.add(op.id);
    if (op.eventKey) eventKeys.add(op.eventKey);
    if (key) external.add(key);
    added.push(op);
  }
  return added.length ? [...existing, ...added] : existing;
}

export const cashAccount = (e: Expense) => e.source === 'credit' ? undefined : e.accountId ?? (e.source === 'reserve' ? RESERVE_ACCOUNT : LIFE_ACCOUNT);

export function recordedAfter(op: { id: string; date: string; at?: string }, anchor: BankBalance): boolean {
  if (anchor.includedIds?.includes(op.id) || op.date < anchor.date) return false;
  if (op.date > anchor.date) return true;
  return !!(op.at && anchor.at && (Date.parse(op.at) > Date.parse(anchor.at)
    || (anchor.includedIds !== undefined && Date.parse(op.at) === Date.parse(anchor.at))));
}

export function accountMovement(op: AccountOperation, id: string): number {
  if (op.type === 'transfer' && op.toAccountId === id) return cents(op.amount);
  if (op.accountId !== id) return 0;
  switch (op.type) {
    case 'transfer': case 'debt_payment': return -cents(op.amount);
    case 'interest': case 'fee': return op.debtId ? 0 : -cents(op.amount);
    default: return cents(op.amount);
  }
}

interface DebtMovement { change: number; unknown: boolean }

export function debtMovement(op: AccountOperation, debtId: string): DebtMovement {
  if (!('debtId' in op) || op.debtId !== debtId || ('debtBooked' in op && op.debtBooked)) return { change: 0, unknown: false };
  switch (op.type) {
    case 'loan_disbursement': case 'interest': case 'fee': return { change: cents(op.amount), unknown: false };
    case 'debt_payment': return { change: -cents(op.principal ?? 0), unknown: op.principal == null };
    default: return { change: 0, unknown: false };
  }
}

export function accountOptions(book: AccountBook): { id: string; name: string }[] {
  return [{ id: LIFE_ACCOUNT, name: 'Карта жизни' }, { id: RESERVE_ACCOUNT, name: 'Резерв' }, ...book.accounts];
}

export function accountProjection(book: AccountBook, expenses: Expense[], now: string) {
  const confirmed = book.operations.filter(op => op.status === 'confirmed' && op.date <= now);
  return book.accounts.map(account => {
    const anchor = account.balance;
    if (!anchor) return { ...account, expected: null };
    let delta = 0;
    for (const op of confirmed) if (recordedAfter(op, anchor)) delta += accountMovement(op, account.id);
    for (const expense of expenses) if (expense.date <= now && cashAccount(expense) === account.id &&
        recordedAfter({ ...expense, at: expense.occurredAt ?? expense.createdAt }, anchor)) delta -= cents(expense.amount);
    return { ...account, expected: kopecks(anchor.amount + rubles(delta)) };
  });
}

export function debtProjection(debt: Debt, expenses: Expense[], book: AccountBook, now: string, estimatedInterest = 0) {
  const anchor = debt.bankBalance ?? (debt.updatedAt ? { amount: debt.balance, date: debt.updatedAt.slice(0, 10), at: debt.updatedAt } : null);
  let delta = 0;
  let unknown = 0;
  for (const op of book.operations) {
    if (op.status !== 'confirmed' || op.date > now || (anchor && !recordedAfter(op, anchor))) continue;
    const move = debtMovement(op, debt.id);
    delta += move.change;
    if (move.unknown) unknown += cents(op.amount);
  }
  for (const e of expenses) {
    if (e.source !== 'credit' || e.creditCard !== debt.id || e.date > now) continue;
    if (!anchor || recordedAfter({ ...e, at: e.occurredAt ?? e.createdAt }, anchor)) delta += cents(e.amount);
  }
  const estimated = Math.max(0, kopecks(debt.balance + rubles(delta) + estimatedInterest));
  return { confirmed: debt.bankBalance?.amount ?? null, anchor, estimated, estimatedInterest, delta: rubles(delta),
    unknownPrincipal: rubles(unknown), difference: debt.bankBalance ? kopecks(estimated - debt.bankBalance.amount) : null };
}

export function debtActivity(book: AccountBook, expenses: Expense[], from: string, to: string) {
  const totals = { borrowed: 0, principal: 0, interestAndFees: 0, unknownPrincipal: 0 };
  for (const op of book.operations) {
    if (op.status !== 'confirmed' || op.date < from || op.date > to) continue;
    if (op.type === 'loan_disbursement') totals.borrowed += cents(op.amount);
    if (op.type === 'debt_payment') {
      totals.principal += cents(op.principal ?? 0);
      totals.interestAndFees += cents(op.interest ?? 0) + cents(op.fee ?? 0);
      if (op.principal == null) totals.unknownPrincipal += cents(op.amount);
    }
    if ((op.type === 'interest' || op.type === 'fee') && op.debtId) totals.interestAndFees += cents(op.amount);
  }
  for (const e of expenses) if (e.source === 'credit' && e.date >= from && e.date <= to) totals.borrowed += cents(e.amount);
  return { borrowed: rubles(totals.borrowed), principal: rubles(totals.principal),
    interestAndFees: rubles(totals.interestAndFees), unknownPrincipal: rubles(totals.unknownPrincipal) };
}

export const monthDebtActivity = (book: AccountBook, expenses: Expense[], now: string) =>
  debtActivity(book, expenses, `${monthKey(now)}-01`, now);

export function bookOperationAllowed(op: AccountOperation, book: AccountBook, debts: Debt[], expenses: Expense[]): boolean {
  if (!validOperation(op)) return false;
  const accounts = accountOptions(book);
  if (!accounts.some(a => a.id === op.accountId)) return false;
  if (op.type === 'transfer' && !accounts.some(a => a.id === op.toAccountId)) return false;
  if ('debtId' in op && op.debtId && !debts.some(d => d.id === op.debtId)) return false;
  if (op.type === 'loan_disbursement' && op.splitPlanId && !book.splitPlans.some(p => p.id === op.splitPlanId && p.debtId === op.debtId)) return false;
  if (op.type !== 'refund') return true;
  const expense = expenses.find(e => e.id === op.expenseId);
  if (!expense || cashAccount(expense) !== op.accountId || expense.date > op.date) return false;
  const refunded = book.operations.reduce((sum, entry) =>
    sum + (entry.type === 'refund' && entry.expenseId === expense.id && entry.status === 'confirmed' ? cents(entry.amount) : 0), 0);
  return refunded + cents(op.amount) <= cents(expense.amount);
}

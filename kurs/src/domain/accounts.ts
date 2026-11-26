import type { StatementCheck } from './bankReconciliation';
import { monthKey } from './dates';
import type { CategoryId, Debt, Expense } from './types';

export const LIFE_ACCOUNT = 'life';
export const RESERVE_ACCOUNT = 'reserve';

export interface BankBalance {
  amount: number;
  date: string;
  at?: string;
  includedIds?: string[];
  kind?: 'available' | 'posted';
  reason?: string;
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
  createdAt?: string;
  amount: number;
  accountId: string;
  eventKey?: string;
  partialFor?: string;
  cashBooked?: boolean;
  externalId?: string;
  note?: string;
  origin: 'manual' | 'bank' | 'exchange';
  status: 'confirmed' | 'planned' | 'voided';
  fundingSource: 'own' | 'borrowed' | 'unknown';
  /** Импорт старого расхода с сохранением ссылки на историю. */
  legacyExpense?: true;
  /** Provenance and booking policy of a migrated calendar mark or reserve movement. */
  legacy?: 'mark' | 'reserve';
  reserveIncluded?: true;
  legacyForKeys?: string[];
}

export interface PaymentShare { key: string; amount: number }

export interface PaymentBudget {
  weekly: number;
  prepared: number;
  separate: number;
  unknown: number;
}

interface Authorization {
  authorization?: true;
  authorizationBase?: { amount: number; date: string; at?: string };
}

export type AccountOperation = OperationBase & (
  { type: 'transfer'; toAccountId: string; purpose?: 'weekly' | 'sweep' | 'prepare' | 'return' | 'unassigned'; shares?: PaymentShare[]; weeklyExcess?: number }
  | { type: 'allocation'; shares: PaymentShare[]; existingCash?: boolean; toWeekly?: never }
  | { type: 'allocation'; toWeekly: true; shares?: never; existingCash?: never }
  | { type: 'loan_disbursement'; debtId: string; splitPlanId?: string; debtBooked?: boolean; auditId?: string }
  | { type: 'debt_payment'; debtId?: string; principal?: number; interest?: number; fee?: number; debtBooked?: boolean; budget?: PaymentBudget }
  | { type: 'interest' | 'fee'; debtId?: string; expenseId?: string }
  | { type: 'income'; pendingSweep?: boolean; payrollParts?: PaymentShare[] }
  | { type: 'adjustment' }
  | ({ type: 'expense'; expenseId?: string; category?: CategoryId; budget?: PaymentBudget } & Authorization)
  | ({ type: 'credit_purchase'; expenseId: string; debtId?: string; category?: CategoryId; budget?: PaymentBudget } & Authorization)
  | { type: 'refund'; expenseId: string; debtId?: string; operationId?: string }
);

export interface SplitPlan {
  id: string;
  debtId: string;
  name: string;
  schedule: { date: string; amount: number }[];
  payoff?: { date: string; amount: number };
  replacesKeys?: string[];
}

export interface SplitDebit {
  id: string;
  date: string;
  amount: number;
  accountId: string;
  debtIds: string[];
  replacesKeys: string[];
}

export interface LoanReview {
  id: string;
  from: string;
  to: string;
  amount: number;
  label: string;
}

/** A categorization of an existing, already marked receipt. It never posts money or changes debt. */
export interface HistoricalLoan {
  eventKey: string;
  debtId: string;
  date: string;
  amount: number;
}

export interface PayoffTerms {
  closeDate?: string;
  closeAmount?: number;
  partialConfirmed?: boolean;
  partialFee?: number;
  rateLow?: number;
  rateHigh?: number;
  loanModes?: ('term' | 'payment')[];
}

export function validPayoffTerms(terms: PayoffTerms): boolean {
  if (!terms || typeof terms !== 'object' || Array.isArray(terms)) return false;
  if ((terms.closeDate != null || terms.closeAmount != null) &&
      (!validDate(terms.closeDate) || !validAmount(terms.closeAmount) || terms.closeAmount <= 0)) return false;
  return (terms.partialConfirmed == null || typeof terms.partialConfirmed === 'boolean') &&
    (terms.partialFee == null || validAmount(terms.partialFee) && terms.partialFee >= 0) &&
    [terms.rateLow, terms.rateHigh].every(rate => rate == null || typeof rate === 'number' && rate >= 0 && rate <= 5) &&
    (terms.rateLow == null || terms.rateHigh == null || terms.rateLow <= terms.rateHigh) &&
    (terms.loanModes == null || Array.isArray(terms.loanModes) && terms.loanModes.every(mode => mode === 'term' || mode === 'payment'));
}

export interface BankImportBatch {
  id: string;
  fileHash: string;
  bank: string;
  importedAt: string;
  parserVersion: string;
  rowCount: number;
  partial?: true;
  statement?: StatementCheck & { accountId: string; ledgerClosingMinor?: number };
}

export interface OperationChange {
  at: string;
  reason: string;
  before: AccountOperation;
  after?: AccountOperation;
}

export interface AccountBook {
  journalVersion?: 1;
  historicalPaymentKeys?: string[];
  payoffTerms?: Record<string, PayoffTerms>;
  paymentRouting?: 'life';
  accounts: CashAccount[];
  operations: AccountOperation[];
  importBatches?: BankImportBatch[];
  expenseChanges?: { at: string; before: Expense; after?: Expense }[];
  operationChanges?: OperationChange[];
  paymentAccounts: Record<string, string>;
  splitPlans: SplitPlan[];
  splitDebits: SplitDebit[];
  loanReviews?: LoanReview[];
  historicalLoans?: HistoricalLoan[];
  creditChargeKinds?: Record<string, 'interest' | 'fee'>;
  stress?: { date: string; amount: number; accountId: string };
}

export const EMPTY_BOOK: AccountBook = { accounts: [], operations: [], paymentAccounts: {}, splitPlans: [], splitDebits: [] };

/** Corrections keep the prior record while only the current revision affects money. */
export function reviseOperations(book: AccountBook, operations: AccountOperation[], at: string, reason: string): AccountBook {
  if (operations === book.operations) return book;
  const current = new Map(operations.map(op => [op.id, op]));
  const changes = book.operations.filter(op => !op.legacyExpense).flatMap(before => {
    const after = current.get(before.id);
    return before === after ? [] : [{ at, reason, before, ...(after ? { after } : {}) }];
  });
  return { ...book, operations, ...(changes.length ? { operationChanges: [...book.operationChanges ?? [], ...changes] } : {}) };
}

export const cents = (amount: number) => Math.round(amount * 100);
export const rubles = (amount: number) => amount / 100;
export const kopecks = (amount: number) => rubles(cents(amount));

export function validPaymentBudget(budget: PaymentBudget | undefined, amount: number) {
  if (budget == null) return budget === undefined;
  if (typeof budget !== 'object' || Array.isArray(budget)) return false;
  const parts = [budget.weekly, budget.prepared, budget.separate, budget.unknown];
  return parts.every(part => validAmount(part) && part >= 0) && parts.reduce((sum, part) => sum + cents(part), 0) === cents(amount);
}

export function validDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = Date.parse(date);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date;
}

export const validAmount = (amount: unknown): amount is number => typeof amount === 'number' &&
  Number.isFinite(amount) && Math.abs(amount) <= Number.MAX_SAFE_INTEGER / 100;

export function validOperation(op: AccountOperation): boolean {
  if (!op || (op.eventKey != null && typeof op.eventKey !== 'string') ||
      (op.partialFor != null && (typeof op.partialFor !== 'string' || !op.partialFor || op.eventKey || !['debt_payment', 'expense'].includes(op.type))) ||
      (op.externalId != null && typeof op.externalId !== 'string') ||
      (op.note != null && typeof op.note !== 'string') ||
      typeof op.id !== 'string' || !op.id || !validDate(op.date) ||
      !validAmount(op.amount) || op.amount <= 0 || typeof op.accountId !== 'string' || !op.accountId ||
      !['confirmed', 'planned', 'voided'].includes(op.status) || (op.status === 'voided' && !reversibleOperation(op)) ||
      !['manual', 'bank', 'exchange'].includes(op.origin) ||
      !['own', 'borrowed', 'unknown'].includes(op.fundingSource) ||
      (op.at != null && (typeof op.at !== 'string' || !Number.isFinite(Date.parse(op.at)))) ||
      (op.createdAt != null && (typeof op.createdAt !== 'string' || !Number.isFinite(Date.parse(op.createdAt))))) return false;
  const validShares = (shares: PaymentShare[] | undefined) => Array.isArray(shares) && shares.length > 0 &&
    new Set(shares.map(share => share?.key)).size === shares.length &&
    shares.every(share => typeof share?.key === 'string' && !!share.key && validAmount(share.amount) && cents(share.amount) > 0) &&
    shares.reduce((sum, share) => sum + cents(share.amount), 0) === cents(op.amount);
  switch (op.type) {
    case 'transfer':
      if (typeof op.toAccountId !== 'string' || !op.toAccountId || op.accountId === op.toAccountId) return false;
      if (op.purpose === 'prepare' || op.purpose === 'return') return !op.eventKey && validShares(op.shares) &&
        (op.purpose === 'prepare' ? op.toAccountId !== RESERVE_ACCOUNT : op.toAccountId === RESERVE_ACCOUNT);
      if (op.purpose === 'sweep') return !op.eventKey && op.toAccountId === RESERVE_ACCOUNT;
      if (op.purpose === 'unassigned') return !op.eventKey && op.toAccountId === LIFE_ACCOUNT;
      if (op.purpose === 'weekly') return op.eventKey?.startsWith('wk:') === true && op.accountId === RESERVE_ACCOUNT &&
        op.toAccountId === LIFE_ACCOUNT && (op.weeklyExcess == null ||
        (validAmount(op.weeklyExcess) && op.weeklyExcess >= 0 && cents(op.weeklyExcess) <= cents(op.amount)));
      return op.purpose == null;
    case 'allocation': return !op.eventKey && op.accountId !== RESERVE_ACCOUNT &&
      (op.toWeekly === true ? op.accountId === LIFE_ACCOUNT && op.shares == null && !op.existingCash :
        (!op.existingCash || op.accountId !== LIFE_ACCOUNT) && validShares(op.shares));
    case 'loan_disbursement': return typeof op.debtId === 'string' && !!op.debtId && op.fundingSource === 'borrowed'
      && (op.auditId == null || (typeof op.auditId === 'string' && !!op.auditId && typeof op.debtBooked === 'boolean'));
    case 'refund': return typeof op.expenseId === 'string' && !!op.expenseId;
    case 'debt_payment': {
      const parts = [op.principal, op.interest, op.fee];
      return (typeof op.debtId === 'string' && !!op.debtId || (op.eventKey ?? op.partialFor)?.startsWith('split-debit:') === true)
        && parts.every(p => p == null || (validAmount(p) && p >= 0))
        && parts.reduce<number>((sum, p) => sum + cents(p ?? 0), 0) <= cents(op.amount) && validPaymentBudget(op.budget, op.amount);
    }
    case 'credit_purchase': case 'expense': return validPaymentBudget(op.budget, op.amount) &&
      (op.type === 'expense' && op.expenseId == null || typeof op.expenseId === 'string' && !!op.expenseId) &&
      (op.authorization == null || op.authorization === true && op.status !== 'planned') &&
      (op.authorizationBase == null || !op.authorization && validAmount(op.authorizationBase.amount) && op.authorizationBase.amount > 0 &&
        validDate(op.authorizationBase.date) && (op.authorizationBase.at == null || Number.isFinite(Date.parse(op.authorizationBase.at))));
    case 'income': return op.payrollParts == null || !op.eventKey && op.fundingSource !== 'borrowed' && validShares(op.payrollParts);
    case 'interest': case 'fee': case 'adjustment': return true;
    default: return false;
  }
}

export function reversibleOperation(op: AccountOperation) {
  return op.type === 'allocation' || (op.type === 'transfer' && !!op.purpose) ||
    ((op.type === 'expense' || op.type === 'credit_purchase') && !!(op.expenseId || op.authorization)) ||
    ((op.type === 'expense' || op.type === 'debt_payment') && !!(op.eventKey || op.partialFor));
}

export function appendOperations(existing: AccountOperation[], incoming: AccountOperation[]): AccountOperation[] {
  const ids = new Set(existing.map(op => op.id));
  const eventKeys = new Set(existing.flatMap(op => op.eventKey && !op.legacy && op.status !== 'voided' ? [op.eventKey] : []));
  const externalKey = (op: AccountOperation) => op.externalId ? JSON.stringify([op.accountId, op.externalId]) : null;
  const external = new Set(existing.map(externalKey).filter(k => k != null));
  const linkedExpenses = new Set(existing.filter(op => !op.legacyExpense).map(linkedExpenseId).filter(Boolean));
  const reviewed = new Set(existing.flatMap(op => op.type === 'loan_disbursement' && op.auditId ? [op.auditId] : []));
  const added: AccountOperation[] = [];
  const confirmed = new Map<string, AccountOperation>();
  for (const op of incoming) {
    if (!validOperation(op)) continue;
    const key = externalKey(op);
    const previous = existing.find(entry => entry.id === op.id);
    if (previous && (previous.type === 'expense' || previous.type === 'credit_purchase') && previous.authorization &&
        previous.type === op.type && !op.authorization && op.status === 'confirmed' && previous.status === 'confirmed' &&
        op.accountId === previous.accountId && op.externalId === previous.externalId && op.expenseId === previous.expenseId &&
        op.eventKey === previous.eventKey) {
      confirmed.set(op.id, { ...op, authorizationBase: { amount: previous.amount, date: previous.date, at: previous.at } });
      continue;
    }
    if (op.status === 'voided' && previous?.status === 'confirmed') {
      if (Object.keys({ ...op, ...previous }).every(k => k === 'status' ||
          JSON.stringify(op[k as keyof AccountOperation]) === JSON.stringify(previous[k as keyof AccountOperation]))) confirmed.set(op.id, op);
      continue;
    }
    if (previous?.type === 'transfer' && previous.status === 'planned' && op.type === 'transfer' && op.status === 'confirmed' &&
        op.accountId === previous.accountId && op.toAccountId === previous.toAccountId &&
        cents(op.amount) === cents(previous.amount) && op.externalId === previous.externalId && op.eventKey === previous.eventKey) {
      confirmed.set(op.id, op);
      continue;
    }
    if (op.type === 'loan_disbursement' && op.auditId && reviewed.has(op.auditId)) continue;
    const expenseId = linkedExpenseId(op);
    if (ids.has(op.id) || (key && external.has(key)) || (op.status !== 'voided' && op.eventKey && eventKeys.has(op.eventKey)) ||
        (expenseId && linkedExpenses.has(expenseId))) continue;
    ids.add(op.id);
    if (expenseId) linkedExpenses.add(expenseId);
    if (op.type === 'loan_disbursement' && op.auditId) reviewed.add(op.auditId);
    if (op.eventKey && op.status !== 'voided') eventKeys.add(op.eventKey);
    if (key) external.add(key);
    added.push(op);
  }
  return added.length || confirmed.size ? [...existing.map(op => confirmed.get(op.id) ?? op), ...added] : existing;
}

export const cashAccount = (e: Pick<Expense, 'source' | 'accountId'>) => e.source === 'credit' ? undefined : e.accountId ?? (e.source === 'reserve' ? RESERVE_ACCOUNT : LIFE_ACCOUNT);

/** Обязательные платежи из резерва учитываются в банковских остатках, но идут вне недельного бюджета. */
export const countsWeekly = (e: Pick<Expense, 'source' | 'accountId' | 'category' | 'budgetScope'>) =>
  e.budgetScope ? e.budgetScope === 'weekly' : e.category !== 'fixed' || cashAccount(e) !== RESERVE_ACCOUNT;

export const weeklyExpenseCents = (e: Expense) => e.weeklyAmount != null ? cents(e.weeklyAmount) : countsWeekly(e) ? cents(e.amount) : 0;

export function recordedAfter(op: { id: string; date: string; at?: string }, anchor: BankBalance): boolean {
  if (anchor.includedIds?.includes(op.id) || op.date < anchor.date) return false;
  if (op.date > anchor.date) return true;
  return !!(op.at && anchor.at && (Date.parse(op.at) > Date.parse(anchor.at)
    || (anchor.includedIds !== undefined && Date.parse(op.at) === Date.parse(anchor.at))));
}

export interface Posting { account: string; amount: number }

/** Две стороны перевода живут в одной операции. Суммы проводок — целые копейки. */
export function postings(op: AccountOperation): Posting[] {
  if (op.status !== 'confirmed' || op.type === 'allocation') return [];
  const cash = `cash:${op.accountId}`;
  const amount = cents(op.amount);
  const debt = 'debtId' in op && op.debtId ? `debt:${op.debtId}` : 'debt:unclassified';
  const pair = (to: string, from: string): Posting[] => [{ account: to, amount }, { account: from, amount: -amount }];
  switch (op.type) {
    case 'transfer': return pair(`cash:${op.toAccountId}`, cash);
    case 'expense': return pair('external:expense', cash);
    case 'credit_purchase': return pair('external:expense', debt);
    case 'interest': case 'fee': return pair(`external:${op.type}`, op.debtId ? debt : cash);
    case 'loan_disbursement': return pair(cash, debt);
    case 'refund': return pair(op.debtId ? debt : cash, 'external:expense');
    case 'debt_payment': {
      const principal = cents(op.principal ?? 0), interest = cents(op.interest ?? 0), fee = cents(op.fee ?? 0);
      return [{ account: cash, amount: -amount }, { account: debt, amount: principal }, { account: 'external:interest', amount: interest },
        { account: 'external:fee', amount: fee }, { account: 'external:unallocated-payment', amount: amount - principal - interest - fee }];
    }
    case 'income': return pair(cash, 'external:income');
    case 'adjustment': return pair(cash, 'external:adjustment');
  }
}

export function accountMovement(op: AccountOperation, id: string): number {
  if (op.cashBooked) return 0;
  return postings(op).find(p => p.account === `cash:${id}`)?.amount ?? 0;
}

export function expenseOperation(e: Expense, book: AccountBook): AccountOperation {
  const knownCharge = book.creditChargeKinds?.[e.id];
  const amount = kopecks(e.amount);
  const base = { id: `expense:${e.id}`, date: e.date, createdAt: e.createdAt || undefined, at: e.occurredAt,
    amount, ...(e.bankRoutePending ? { cashBooked: true } : {}), accountId: cashAccount(e) ?? e.creditCard ?? 'credit-unclassified', note: e.note, expenseId: e.id,
    category: e.category, status: 'confirmed' as const, origin: e.origin === 'manual' ? 'manual' as const : 'exchange' as const,
    fundingSource: e.source === 'credit' ? 'borrowed' as const : e.fundingSource ?? 'unknown' as const, legacyExpense: true as const,
    budget: { weekly: weeklyExpenseCents(e) / 100, prepared: 0, separate: countsWeekly(e) || e.budgetScope === 'unknown' ? 0 : amount,
      unknown: e.budgetScope === 'unknown' ? amount : 0 } };
  if (e.source !== 'credit') return { ...base, type: 'expense' };
  if (knownCharge) return { ...base, type: knownCharge, debtId: e.creditCard };
  return { ...base, type: 'credit_purchase', debtId: e.creditCard };
}

export function linkedExpenseId(op: AccountOperation) {
  return op.type !== 'refund' && 'expenseId' in op ? op.expenseId : undefined;
}

/** Адаптер старых файлов. Идентификатор операции сохраняется при правках и повторном импорте. */
export function canonicalBook(book: AccountBook, expenses: Expense[]): AccountBook {
  const explicit = book.operations.filter(op => !op.legacyExpense);
  const linked = new Set(explicit.map(linkedExpenseId).filter(Boolean));
  const saved = new Map(book.operations.filter(op => op.legacyExpense).map(op => [linkedExpenseId(op), op]));
  const entries = expenses.filter(e => !linked.has(e.id)).map(e => saved.get(e.id) ?? expenseOperation(e, book));
  return { ...book, operations: [...explicit, ...entries] };
}

export function journalOperations(book: AccountBook, expenses: Expense[]) {
  return book.journalVersion ? book.operations : canonicalBook(book, expenses).operations;
}

export function accountOptions(book: AccountBook): { id: string; name: string }[] {
  return [{ id: LIFE_ACCOUNT, name: 'Карта жизни' }, { id: RESERVE_ACCOUNT, name: 'Резерв' }, ...book.accounts];
}

export function accountProjection(book: AccountBook, expenses: Expense[], now: string) {
  const confirmed = journalOperations(book, expenses).filter(op => op.status === 'confirmed' && op.date <= now);
  return book.accounts.map(account => {
    const anchor = account.balance;
    if (!anchor) return { ...account, expected: null };
    let delta = 0;
    for (const op of confirmed) {
      const e = op.legacyExpense ? { ...op, id: linkedExpenseId(op) ?? op.id, at: op.at ?? op.createdAt } : op;
      if (!anchor.includedIds?.includes(op.id) && recordedAfter(e, anchor)) delta += accountMovement(op, account.id);
    }
    return { ...account, expected: kopecks(anchor.amount + rubles(delta)) };
  });
}

export function debtProjection(debt: Debt, expenses: Expense[], book: AccountBook, now: string, estimatedInterest = 0) {
  const anchor = debt.bankBalance ?? (debt.updatedAt ? { amount: debt.balance, date: debt.updatedAt.slice(0, 10), at: debt.updatedAt } : null);
  const amounts = () => ({ purchases: 0, fees: 0, interest: 0, loanDisbursements: 0, principal: 0, refunds: 0 });
  const after = amounts(), inBase = amounts(), unverified = amounts();
  const includedIds = new Set(anchor?.includedIds);
  const target = (entry: { id: string; date: string; at?: string }, booked = false) => {
    if (booked || includedIds.has(entry.id)) return inBase;
    if (!anchor || recordedAfter(entry, anchor)) return after;
    if (entry.date === anchor.date && (!entry.at || !anchor.at)) return unverified;
    return inBase;
  };
  let unknown = 0, unallocated = 0;
  const operations = journalOperations(book, expenses);
  for (const op of operations) {
    if (op.status !== 'confirmed' || op.date > now || !('debtId' in op) || op.debtId !== debt.id) continue;
    const entry = op.legacyExpense ? { ...op, id: linkedExpenseId(op) ?? op.id, at: op.at ?? op.createdAt } : op;
    const totals = target(entry, 'debtBooked' in op && op.debtBooked === true);
    switch (op.type) {
      case 'credit_purchase': totals.purchases += cents(op.amount); break;
      case 'loan_disbursement': totals.loanDisbursements += cents(op.amount); break;
      case 'interest': totals.interest += cents(op.amount); break;
      case 'fee': totals.fees += cents(op.amount); break;
      case 'refund': totals.refunds += cents(op.amount); break;
      case 'debt_payment':
        totals.principal += cents(op.principal ?? 0);
        if (totals === after) {
          if (op.principal == null) unknown += cents(op.amount);
          unallocated += cents(op.amount) - cents(op.principal ?? 0) - cents(op.interest ?? 0) - cents(op.fee ?? 0);
        }
        break;
    }
  }
  const delta = after.purchases + after.fees + after.interest + after.loanDisbursements - after.principal - after.refunds;
  const estimated = Math.max(0, kopecks(debt.balance + rubles(delta) + estimatedInterest));
  const toRubles = (row: ReturnType<typeof amounts>) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, rubles(value)])) as ReturnType<typeof amounts>;
  const linked = new Set(book.operations.filter(op => op.status === 'confirmed' && op.type === 'loan_disbursement').map(op => op.eventKey));
  const archivedLoans = (book.historicalLoans ?? []).filter(row => row.date <= now && row.debtId === debt.id && !linked.has(row.eventKey));
  return { confirmed: debt.bankBalance?.amount ?? null, anchor, estimated, estimatedInterest, delta: rubles(delta),
    basis: debt.balance, basisKind: debt.bankBalance ? 'bank' as const : anchor ? 'recorded' as const : 'undated' as const,
    added: toRubles(after), alreadyCovered: toRubles(inBase), missingTime: toRubles(unverified),
    classifiedLoanHistory: rubles(archivedLoans.reduce((sum, row) => sum + cents(row.amount), 0)),
    unknownPrincipal: rubles(unknown), unallocatedPayments: rubles(unallocated), difference: debt.bankBalance ? kopecks(estimated - debt.bankBalance.amount) : null };
}

export function debtActivity(book: AccountBook, expenses: Expense[], from: string, to: string) {
  const totals = { borrowed: 0, loanDisbursements: 0, creditPurchases: 0, principal: 0, interest: 0, fees: 0, interestAndFees: 0, unknownPrincipal: 0 };
  const linked = new Set(book.operations.filter(op => op.type === 'loan_disbursement' && op.status === 'confirmed').map(op => op.eventKey));
  for (const op of journalOperations(book, expenses)) {
    if (op.status !== 'confirmed' || op.date < from || op.date > to) continue;
    if (op.type === 'loan_disbursement') {
      totals.loanDisbursements += cents(op.amount);
    }
    if (op.type === 'credit_purchase') totals.creditPurchases += cents(op.amount);
    if (op.type === 'debt_payment') {
      totals.principal += cents(op.principal ?? 0);
      totals.interest += cents(op.interest ?? 0);
      totals.fees += cents(op.fee ?? 0);
      if (op.principal == null) totals.unknownPrincipal += cents(op.amount);
    }
    if (op.type === 'interest' && (op.debtId || op.legacyExpense)) totals.interest += cents(op.amount);
    if (op.type === 'fee' && (op.debtId || op.legacyExpense)) totals.fees += cents(op.amount);
  }
  for (const loan of book.historicalLoans ?? []) {
    if (!linked.has(loan.eventKey) && loan.date >= from && loan.date <= to) totals.loanDisbursements += cents(loan.amount);
  }
  totals.borrowed = totals.loanDisbursements + totals.creditPurchases;
  totals.interestAndFees = totals.interest + totals.fees;
  return { borrowed: rubles(totals.borrowed), loanDisbursements: rubles(totals.loanDisbursements), creditPurchases: rubles(totals.creditPurchases),
    creditOperations: rubles(totals.creditPurchases + totals.fees + totals.interest),
    principal: rubles(totals.principal), interest: rubles(totals.interest), fees: rubles(totals.fees),
    interestAndFees: rubles(totals.interestAndFees), unknownPrincipal: rubles(totals.unknownPrincipal) };
}

export const monthDebtActivity = (book: AccountBook, expenses: Expense[], now: string) =>
  debtActivity(book, expenses, `${monthKey(now)}-01`, now);

export function bookOperationAllowed(op: AccountOperation, book: AccountBook, debts: Debt[], expenses: Expense[]): boolean {
  if (!validOperation(op)) return false;
  const accounts = accountOptions(book);
  const credit = op.type === 'credit_purchase' && (op.debtId ? op.debtId === op.accountId : op.accountId === 'credit-unclassified');
  if (!accounts.some(a => a.id === op.accountId) && !credit && !(op.type === 'refund' && op.debtId === op.accountId)) return false;
  if (op.type === 'transfer' && !accounts.some(a => a.id === op.toAccountId)) return false;
  if ('debtId' in op && op.debtId && !debts.some(d => d.id === op.debtId)) return false;
  const linkedId = linkedExpenseId(op);
  if (linkedId) {
    const expense = expenses.find(e => e.id === linkedId);
    const authorization = book.operations.some(row => row.id === op.id && 'authorization' in row && row.authorization);
    if (!expense || !authorization && (expense.date !== op.date || cents(expense.amount) !== cents(op.amount))) return false;
  }
  if (op.type === 'loan_disbursement' && op.splitPlanId && !book.splitPlans.some(p => p.id === op.splitPlanId && p.debtId === op.debtId)) return false;
  if (op.type === 'loan_disbursement' && op.eventKey) {
    const historical = book.historicalLoans?.find(loan => loan.eventKey === op.eventKey);
    if (historical && (historical.debtId !== op.debtId || historical.date !== op.date || cents(historical.amount) !== cents(op.amount))) return false;
  }
  if (op.type === 'loan_disbursement' && op.auditId) {
    const review = book.loanReviews?.find(r => r.id === op.auditId);
    if (!review || op.date < review.from || op.date > review.to || cents(op.amount) !== cents(review.amount)) return false;
  }
  if (op.type !== 'refund') return true;
  const expense = expenses.find(e => e.id === op.expenseId);
  if (!expense || expense.date > op.date) return false;
  if (expense.source === 'credit' ? !expense.creditCard || expense.creditCard !== op.debtId || op.accountId !== op.debtId
    : cashAccount(expense) !== op.accountId || op.debtId != null) return false;
  const refunded = book.operations.reduce((sum, entry) =>
    sum + (entry.type === 'refund' && entry.expenseId === expense.id && entry.status === 'confirmed' ? cents(entry.amount) : 0), 0);
  return refunded + cents(op.amount) <= cents(expense.amount);
}


/** Возврат приглашает пересчитать потребительскую покупку, банковское движение остаётся отдельным. */
export function budgetExpenses(expenses: Expense[], book: AccountBook): Expense[] {
  const spending = journalOperations(book, expenses).filter(op => op.type === 'expense' || op.type === 'credit_purchase' || op.type === 'debt_payment');
  const linked = new Map(spending.filter(op => linkedExpenseId(op)).map(op => [linkedExpenseId(op), op]));
  const refunds = new Map<string, number>();
  for (const op of book.operations) if (op.type === 'refund' && op.status === 'confirmed') {
    refunds.set(op.expenseId, (refunds.get(op.expenseId) ?? 0) + cents(op.amount));
  }
  const project = (e: Expense, op?: AccountOperation) => {
    const refunded = refunds.get(e.id) ?? 0;
    const amount = cents(op?.amount ?? e.amount);
    const budget = op && 'budget' in op ? op.budget : undefined;
    const weekly = budget ? cents(budget.weekly) : weeklyExpenseCents(e);
    const actual = op && !op.legacyExpense ? op : undefined;
    const source = actual?.type === 'credit_purchase' ? 'credit' : actual ? actual.accountId === RESERVE_ACCOUNT ? 'reserve' : 'life' : e.source;
    return { ...e, source, accountId: actual?.accountId ?? e.accountId, date: op?.date ?? e.date, amount: rubles(Math.max(0, amount - refunded)),
      weeklyAmount: rubles(Math.max(0, weekly - (amount > 0 ? Math.round(refunded * (weekly / amount)) : 0))) };
  };
  const rows = expenses.filter(e => !linked.has(e.id) || linked.get(e.id)?.status === 'confirmed')
    .map(e => project(e, linked.get(e.id)));
  const history = new Set(expenses.map(e => e.id));
  for (const op of spending) {
    if (op.status !== 'confirmed' || history.has(linkedExpenseId(op) ?? '') || !('budget' in op) || !op.budget?.weekly) continue;
    rows.push(project({ id: linkedExpenseId(op) ?? op.id, date: op.date, amount: op.amount, source: op.type === 'credit_purchase' ? 'credit' :
      op.accountId === RESERVE_ACCOUNT ? 'reserve' : 'life', accountId: op.accountId, note: op.note,
      category: 'category' in op ? op.category ?? 'fixed' : 'fixed', createdAt: op.createdAt ?? '' }, op));
  }
  return rows;
}


export function validBankBalance(b?: BankBalance): boolean {
  return b == null || (validDate(b.date) && validAmount(b.amount)
    && (b.at == null || (typeof b.at === 'string' && Number.isFinite(Date.parse(b.at))))
    && (b.kind == null || b.kind === 'available' || b.kind === 'posted')
    && (b.reason == null || typeof b.reason === 'string')
    && (b.includedIds == null || stringList(b.includedIds)));
}

const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string' && !!item);

export function validSplitPlan(plan: SplitPlan, debts: Debt[]): boolean {
  return !!plan && typeof plan.id === 'string' && !!plan.id && typeof plan.name === 'string' && !!plan.name
    && debts.some(d => d.id === plan.debtId && d.kind === 'split')
    && Array.isArray(plan.schedule) && plan.schedule.every(s => s && validDate(s.date) && validAmount(s.amount) && s.amount > 0)
    && validBankBalance(plan.payoff) && (plan.replacesKeys == null || stringList(plan.replacesKeys));
}

export function validSplitDebit(debit: SplitDebit, book: AccountBook, debts: Debt[]): boolean {
  return !!debit && typeof debit.id === 'string' && !!debit.id && validDate(debit.date)
    && validAmount(debit.amount) && debit.amount > 0 && accountOptions(book).some(a => a.id === debit.accountId)
    && stringList(debit.debtIds) && debit.debtIds.length > 0 && debit.debtIds.every(id => debts.some(d => d.id === id && d.kind === 'split'))
    && stringList(debit.replacesKeys) && debit.replacesKeys.length > 0
    && !book.splitDebits.some(d => d.id !== debit.id && d.replacesKeys.some(key => debit.replacesKeys.includes(key)));
}


export function validLoanReview(item: LoanReview): boolean {
  return !!item && typeof item.id === 'string' && !!item.id && typeof item.label === 'string' && !!item.label.trim()
    && validDate(item.from) && validDate(item.to) && item.from <= item.to && validAmount(item.amount) && item.amount > 0;
}

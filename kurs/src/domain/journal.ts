import { payrollReceiptParts } from './payrollReceipts';
import { accountMovement, canonicalBook, cents, EMPTY_BOOK, LIFE_ACCOUNT, linkedExpenseId, recordedAfter, RESERVE_ACCOUNT, rubles, type AccountBook, type AccountOperation, type BankBalance } from './accounts';
import { today } from './dates';
import type { CalEvent, EventMark, Expense, ReserveMove } from './types';

const BONUS = new Set(['bonusQuarter', 'bonusYear', 'vacation', 'thirteenth']);

interface JournalInput {
  accountBook?: AccountBook;
  expenses: Expense[];
  oneOff: CalEvent[];
  marks: Record<string, EventMark>;
  reserveLog: ReserveMove[];
}

type JournalEntry = AccountOperation & { legacy?: 'mark' | 'reserve'; reserveIncluded?: true };

export interface JournalReview {
  kind: 'possible_duplicate' | 'snapshot_order' | 'unknown_funding' | 'unknown_route';
  operationId: string;
  accountId: string;
  date: string;
  amount: number;
  relatedId?: string;
}

/** Older marks and reserve logs are read in one place. New commands write explicit book operations. */
export function financialJournal(s: JournalInput) {
  const book = canonicalBook(s.accountBook ?? EMPTY_BOOK, s.expenses);
  const entries: JournalEntry[] = [...book.operations];
  const linked = new Set([...entries.flatMap(op => op.eventKey ? [op.eventKey] : []), ...payrollReceiptParts(entries).keys()]);
  for (const [key, mark] of Object.entries(s.marks)) {
    if (!mark.done || linked.has(key) || !(mark.amount && mark.amount > 0)) continue;
    const one = s.oneOff.find(e => e.key === key);
    const date = mark.paidDate ?? (mark.at && Number.isFinite(Date.parse(mark.at)) ? today(new Date(mark.at)) : undefined);
    if (!date) continue;
    const base = { id: `mark:${key}`, eventKey: key, amount: mark.amount, date, at: mark.at, origin: 'exchange' as const,
      legacy: 'mark' as const, status: 'confirmed' as const, fundingSource: 'unknown' as const };
    if (key.startsWith('wk:')) {
      entries.push({ ...base, type: 'transfer', accountId: RESERVE_ACCOUNT, toAccountId: LIFE_ACCOUNT, reserveIncluded: true });
    } else if (key.startsWith('pay:') || key.startsWith('fix:') || one?.kind === 'payment') {
      entries.push({ ...base, type: 'expense', accountId: mark.paidFrom === 'card' ? LIFE_ACCOUNT : RESERVE_ACCOUNT });
    } else if (!key.startsWith('work:') && (key.startsWith('inc:') || one?.kind === 'income') &&
        !BONUS.has(one?.incomeKind ?? key.split(':')[1])) {
      entries.push({ ...base, type: 'income', accountId: LIFE_ACCOUNT });
    }
  }
  for (const move of s.reserveLog) {
    if (!move.card || !move.at) continue;
    entries.push({ id: `reserve:${move.id}`, legacy: 'reserve', reserveIncluded: true, type: 'transfer',
      accountId: move.card > 0 ? RESERVE_ACCOUNT : LIFE_ACCOUNT, toAccountId: move.card > 0 ? LIFE_ACCOUNT : RESERVE_ACCOUNT,
      amount: Math.abs(move.card), date: move.date, at: move.at, origin: 'exchange', status: 'confirmed', fundingSource: 'own' });
  }
  return { book, entries };
}

export interface JournalAnchor extends BankBalance {
  includedExpenseIds?: string[];
  excludedIds?: string[];
  /** Historical checks retained different same-day policies for the two accounts. */
  legacyManualOnly?: boolean;
}

export function journalEntryAfter(op: JournalEntry, anchor: JournalAnchor) {
  const id = linkedExpenseId(op);
  if (op.date === anchor.date && (anchor.excludedIds?.includes(op.id) || id && anchor.excludedIds?.includes(id))) return true;
  if (anchor.includedIds?.includes(op.id) || id && anchor.includedExpenseIds?.includes(id)) return false;
  if (op.legacy) return op.date !== anchor.date ? op.date > anchor.date
    : !!op.at && !!anchor.at && Date.parse(op.at) > Date.parse(anchor.at);
  if (op.legacyExpense) {
    const at = op.at ?? (!anchor.legacyManualOnly || op.origin === 'manual' ? op.createdAt : undefined);
    return recordedAfter({ ...op, id: id ?? op.id, at }, { ...anchor, includedIds: anchor.includedIds ?? anchor.includedExpenseIds });
  }
  return recordedAfter(op, anchor);
}

export function journalAccount(entries: JournalEntry[], account: string, anchor: JournalAnchor | null, asOf: string) {
  const issues: JournalReview[] = [];
  let posted = cents(anchor?.amount ?? 0);
  let authorization = 0;
  let postedKnown = anchor?.kind !== 'available';
  for (const op of entries) {
    const included = anchor?.includedIds?.includes(op.id);
    if (anchor && anchor.kind !== 'posted' && included && op.accountId === account &&
        (op.type === 'expense' || op.type === 'credit_purchase') && !op.cashBooked) {
      if (op.authorization && op.status === 'voided') {
        posted += cents(op.amount);
        continue;
      }
      if (op.authorization && op.status === 'confirmed') postedKnown = false;
      if (op.authorizationBase && op.status === 'confirmed' && op.date <= asOf &&
          recordedAfter(op, { ...anchor, includedIds: undefined })) {
        posted += cents(op.authorizationBase.amount) - cents(op.amount);
        continue;
      }
    }
    if (op.status !== 'confirmed' || op.date > asOf || (account === RESERVE_ACCOUNT && op.reserveIncluded)) continue;
    const effect = accountMovement(op, account);
    if (!effect) continue;
    const expenseId = linkedExpenseId(op) ?? '';
    if (anchor && op.date === anchor.date && !op.legacy && (!op.at || !anchor.at) &&
        !anchor.includedIds?.includes(op.id) && !anchor.includedExpenseIds?.includes(expenseId) &&
        !anchor.excludedIds?.includes(op.id) && !anchor.excludedIds?.includes(expenseId)) {
      issues.push({ kind: 'snapshot_order', operationId: op.id, accountId: account, date: op.date, amount: op.amount });
    }
    const hold = 'authorization' in op && op.authorization;
    if (anchor?.kind === 'posted' && hold) { authorization += effect; continue; }
    if (!anchor && (op.legacy || op.legacyExpense) || anchor && !journalEntryAfter(op, anchor)) continue;
    if (hold) authorization += effect;
    else posted += effect;
  }
  return { expected: rubles(posted + authorization), posted: postedKnown ? rubles(posted) : null, issues };
}

const words = (value?: string) => value?.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** A same-day amount can only suggest an issue. Require calendar/merchant evidence as well, and preserve both rows. */
export function journalReview(s: JournalInput & { fixed?: { id: string; name: string }[] }, entries: JournalEntry[], now: string): JournalReview[] {
  const names = new Map(s.fixed?.map(row => [row.id, words(row.name)]));
  return entries.flatMap(op => {
    if (op.status !== 'confirmed' || op.date > now) return [];
    const findings: JournalReview[] = [];
    if (op.legacyExpense && op.cashBooked) findings.push({ kind: 'unknown_route', operationId: op.id,
      accountId: op.accountId, date: op.date, amount: op.amount, relatedId: linkedExpenseId(op) });
    if ('budget' in op && op.budget?.unknown) findings.push({ kind: 'unknown_funding', operationId: op.id,
      accountId: op.accountId, date: op.date, amount: op.budget.unknown });
    if (op.type !== 'expense' || op.expenseId || !op.eventKey?.startsWith('fix:')) return findings;
    const label = names.get(op.eventKey.split(':')[1]);
    for (const e of s.expenses) {
      const merchant = words(e.note);
      if (label && merchant && merchant.length >= 3 && e.date === op.date && cents(e.amount) === cents(op.amount) &&
          e.category === 'fixed' && (label === merchant || label.startsWith(merchant + ' '))) {
        findings.push({ kind: 'possible_duplicate', operationId: op.id, relatedId: e.id, accountId: op.accountId, date: op.date, amount: op.amount });
      }
    }
    return findings;
  });
}

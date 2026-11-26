import { cents, validOperation, type AccountOperation, type PaymentShare } from './accounts';
import { daysBetween } from './dates';
import type { PayrollProfile } from './payroll';

export function payrollReceiptParts(operations: AccountOperation[]) {
  const matched = new Map<string, { receiptId: string; date: string; amount: number }>();
  for (const op of operations) {
    if (op.status !== 'confirmed' || op.type !== 'income' || !op.payrollParts || !validOperation(op)) continue;
    for (const part of op.payrollParts) matched.set(part.key, { receiptId: op.id, date: op.date, amount: part.amount });
  }
  return matched;
}

/** Связывает уже проведённое зачисление с документами. Ни одно новое движение не создаётся. */
export function allocatePayrollReceipt(operations: AccountOperation[], actual: PayrollProfile['actual'],
  receiptId: string, parts: PaymentShare[]): AccountOperation[] | null {
  const receipt = operations.find(op => op.id === receiptId);
  if (receipt?.type !== 'income' || receipt.status !== 'confirmed' || receipt.origin !== 'bank' || receipt.eventKey || receipt.payrollParts) return null;
  const known = payrollReceiptParts(operations);
  const regular = new Set(operations.filter(op => op.status === 'confirmed' && !op.legacy && op.eventKey).map(op => op.eventKey));
  if (!parts.length || parts.some(part => {
    const source = actual?.[part.key];
    return known.has(part.key) || regular.has(part.key) || !source?.payDate || Math.abs(daysBetween(source.payDate, receipt.date)) > 1 ||
      source.net == null || cents(source.net) !== cents(part.amount);
  })) return null;
  const linked = { ...receipt, payrollParts: parts };
  if (!validOperation(linked)) return null;
  return operations.map(op => op.id === receiptId ? linked : op);
}

/** Match whole net amounts from documents. A unique adjacent-date match is shown for review. */
export function matchPayrollReceipt(actual: PayrollProfile['actual'], date: string, amount: number, occupied: ReadonlySet<string> = new Set()) {
  const eligible = Object.entries(actual ?? {}).flatMap(([key, row]) => row.payDate && row.net != null &&
    cents(row.net) > 0 && !occupied.has(key) ? [{ key, amount: row.net, date: row.payDate }] : []);
  const sameDate = eligible.filter(row => row.date === date);
  if (sameDate.length > 12) return null;
  const target = cents(amount);
  const matches: PaymentShare[][] = [];
  function search(start: number, remaining: number, parts: PaymentShare[]) {
    if (!remaining) { matches.push(parts); return; }
    for (let index = start; index < sameDate.length && matches.length < 2; index++) {
      const { key, amount } = sameDate[index];
      if (cents(amount) <= remaining) search(index + 1, remaining - cents(amount), [...parts, { key, amount }]);
    }
  }
  if (target <= 0) return null;
  search(0, target, []);
  if (matches.length) return matches.length === 1 ? { parts: matches[0], adjacent: false } : null;
  const adjacent = eligible.filter(row => Math.abs(daysBetween(row.date, date)) === 1 && cents(row.amount) === target);
  if (adjacent.length !== 1) return null;
  const { key, amount: net } = adjacent[0];
  return { parts: [{ key, amount: net }], adjacent: true };
}

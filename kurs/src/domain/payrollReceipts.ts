import { cents, validOperation, type AccountOperation, type PaymentShare } from './accounts';
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
  const regular = new Set(operations.filter(op => op.status === 'confirmed' && op.eventKey).map(op => op.eventKey));
  if (!parts.length || parts.some(part => {
    const source = actual?.[part.key];
    return known.has(part.key) || regular.has(part.key) || !source?.payDate || source.payDate !== receipt.date ||
      source.net == null || cents(source.net) !== cents(part.amount);
  })) return null;
  const linked = { ...receipt, payrollParts: parts };
  if (!validOperation(linked)) return null;
  return operations.map(op => op.id === receiptId ? linked : op);
}

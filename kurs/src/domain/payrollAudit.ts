import { cents, rubles, type AccountOperation } from './accounts';
import { workPayments, type PayrollProfile } from './payroll';
import { payrollReceiptParts } from './payrollReceipts';
import type { EventMark } from './types';

export function auditPayroll(profile: PayrollProfile, operations: AccountOperation[], marks: Record<string, EventMark>, year: number) {
  const modeled = new Map(workPayments({ ...profile, actual: {} }, `${year}-01-01`, `${year}-12-31`).map(pay => [pay.key, pay]));
  const parts = payrollReceiptParts(operations);
  const booked = new Map(operations.flatMap(op => op.type === 'income' && op.status === 'confirmed' && op.fundingSource !== 'borrowed' && op.eventKey
    ? [[op.eventKey, op] as const] : []));
  const rows = Object.entries(profile.actual ?? {}).flatMap(([key, doc]) => {
    if (doc.net == null || !(doc.payDate ?? doc.payMonth ?? doc.asOf).startsWith(String(year))) return [];
    const alternate = profile.aliases?.[key] ?? key;
    const part = parts.get(key) ?? parts.get(alternate);
    const op = booked.get(key) ?? booked.get(alternate);
    const mark = marks[alternate] ?? marks[key];
    const bank = part ? { date: part.date, amount: part.amount, evidence: 'bank' as const } :
      op ? { date: op.date, amount: op.amount, evidence: op.origin === 'bank' ? 'bank' as const : 'marked' as const } :
        mark?.done && mark.amount != null ? { date: mark.paidDate ?? null, amount: mark.amount, evidence: 'marked' as const } : null;
    const estimate = modeled.get(key);
    const plannedNet = doc.expectedNet ?? estimate?.net ?? null;
    return [{ key, title: doc.title ?? estimate?.title ?? 'Начисление', date: doc.payDate ?? doc.payMonth ?? null,
      net: doc.net, gross: doc.gross ?? null, tax: doc.tax ?? null, otherWithheld: doc.otherWithheld ?? null,
      plannedNet, plannedBasis: doc.expectedNet != null ? 'recorded' as const : estimate ? 'reconstructed' as const : null,
      plannedDelta: plannedNet == null ? null : rubles(cents(doc.net) - cents(plannedNet)),
      bank, bankDelta: bank ? rubles(cents(bank.amount) - cents(doc.net)) : null }];
  }).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.key.localeCompare(b.key));
  return { rows,
    withBank: rows.filter(row => row.bank?.evidence === 'bank').length,
    withMark: rows.filter(row => row.bank?.evidence === 'marked').length,
    undocumentedBank: rows.filter(row => !row.bank).length };
}

import { payrollReceiptParts } from './payrollReceipts';
import { cashIncomeEvent, eventsBetween, incomeStatus, type CalendarInput } from './calendar';
import { addDays, addMonths, dayIn, today } from './dates';
import { workdayOnOrBefore } from './workdays';
import type { IncomeKind } from './types';

const DAYS = { salary: 10, bonusMonthly: 15, advance: 25 } as const;

export function payrollRegister(input: CalendarInput, first: number, last: number, now = today()) {
  const events = eventsBetween(input, addDays(`${first}-01-01`, -25), addDays(`${last}-12-31`, 25)).filter(cashIncomeEvent);
  const byNominal = new Map(events.filter(e => e.nominalDate).map(e => [`${e.incomeKind}/${e.nominalDate}`, e]));
  const regular = new Set<string>();
  const parts = payrollReceiptParts(input.accountBook?.operations ?? []);
  return {
    first, last,
    regular: Array.from({ length: (last - first + 1) * 12 }, (_, index) => {
      const month = addMonths(`${first}-01`, index);
      return Object.entries(DAYS).map(([kind, day]) => {
        const nominalDate = dayIn(month, day);
        const accrualPeriod = kind === 'advance' ? month : addMonths(month, -1);
        const key = `inc:${kind}:${month}`;
        const regularEvent = byNominal.get(`${kind}/${nominalDate}`) ?? events.find(e => e.key === key && input.marks?.[key]?.done);
        if (regularEvent) {
          regular.add(regularEvent.key);
          return row(regularEvent, nominalDate, accrualPeriod);
        }
        return { key, kind: kind as IncomeKind, nominalDate, accrualPeriod, expectedPayDate: workdayOnOrBefore(nominalDate, input.work?.workingHours),
          actualPayDate: null, gross: null, tax: null, net: null, status: 'missing' as const, source: 'Нет действующей ставки или документа' };
      });
    }).flat(),
    other: events.filter(e => !regular.has(e.key) && (!e.payroll || !['salary', 'advance', 'bonusMonthly'].includes(e.incomeKind ?? '')) && (e.payroll || e.incomeKind === 'vacation')).map(e => row(e, e.nominalDate ?? e.date, e.accrualPeriod ?? e.date.slice(0, 7))),
  };

  function row(e: (typeof events)[number], nominalDate: string, accrualPeriod: string) {
    const marked = input.marks?.[e.key];
    const pay = e.payroll;
    const booked = input.accountBook?.operations.find(op => op.status === 'confirmed' && op.type === 'income' && op.eventKey === e.key);
    const part = parts.get(e.key);
    const actualPayDate = part?.date ?? booked?.date ?? (marked?.done ? marked.paidDate ?? e.date : pay?.actualPayDate ?? null);
    const date = actualPayDate ?? e.date;
    const entryStatus = booked || part ? 'recorded' : incomeStatus(e, marked) ?? 'forecast';
    const missingDocument = entryStatus === 'forecast' && date < now;
    return { key: e.key, kind: e.incomeKind, title: e.title, nominalDate, accrualPeriod,
      expectedPayDate: pay?.expectedPayDate ?? e.date, actualPayDate, cashYear: Number(date.slice(0, 4)),
      gross: pay && (!pay.documented || pay.actualGrossKnown || pay.gross > 0) ? pay.gross : null,
      tax: pay && (!pay.documented || pay.actualTaxKnown || pay.gross > 0) ? pay.tax : null,
      net: part?.amount ?? booked?.amount ?? (marked?.done ? marked.amount : undefined) ?? e.amount,
      workDays: pay?.workDays, firstWorkDays: pay?.firstWorkDays, paidDays: pay?.paidDays, firstPaidDays: pay?.firstPaidDays,
      status: missingDocument ? 'missingDocument' as const : entryStatus,
      receiptId: part?.receiptId ?? booked?.id,
      source: booked || part ? 'Банковская операция' : pay?.documentarySource ?? (missingDocument ? 'Расчёт · документ не найден' : pay?.source ?? 'Календарь'),
      alternatePayDate: pay?.alternatePayDate, grossDocumented: !!pay?.actualGrossKnown, taxDocumented: !!pay?.actualTaxKnown };
  }
}

import { payrollReceiptParts } from './payrollReceipts';
import { cents, rubles } from './accounts';
import { cashIncomeEvent, eventsBetween, incomeStatus, paidOn, type CalendarInput } from './calendar';
import { projectedEvent, type Scenario } from './coverage';
import type { CalEvent, IncomeKind } from './types';

export type IncomeGroup = 'salary' | 'bonusMonthly' | 'vacation' | 'thirteenth' | 'bonusQuarter' | 'bonusYear' | 'other';
export const INCOME_GROUPS: Record<IncomeGroup, string> = {
  salary: 'Зарплата и аванс', bonusMonthly: 'Ежемесячное поощрение', vacation: 'Отпускные и выплата к отпуску',
  thirteenth: 'Материальная помощь', bonusQuarter: 'Квартальные премии', bonusYear: 'Годовая премия', other: 'Прочие доходы',
};

const groupOf = (kind: IncomeKind | undefined): IncomeGroup => kind === 'advance' ? 'salary' : kind ?? 'other';

export function annualIncome(input: CalendarInput, year: number, now: string, scenario: Scenario) {
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const all = eventsBetween(input, from, to);
  const byKey = new Map(all.map(event => [event.key, event]));
  const journal = input.accountBook?.operations ?? [];
  const parts = payrollReceiptParts(journal);
  const paidByKey = new Map(journal.filter(op => op.status === 'confirmed' && op.eventKey).map(op => [op.eventKey!, op]));
  const entries: { date: string; amount: number; actual: boolean; documentary: boolean; conditional: boolean; group: IncomeGroup }[] = [];
  const record = (date: string, amount: number, actual: boolean, kind?: IncomeKind, conditional = false, documentary = false) => {
    if (date >= from && date <= to && (actual || documentary ? date <= now : date >= now)) entries.push({ date, amount: cents(amount), actual, documentary, conditional, group: groupOf(kind) });
  };
  const next: CalEvent[] = [];
  let missingEstimate = 0;
  for (const event of all.filter(cashIncomeEvent)) {
    const link = paidByKey.get(event.key);
    if (link && (link.type !== 'income' || link.fundingSource === 'borrowed')) continue;
    const mark = input.marks?.[event.key];
    const part = parts.get(event.key);
    if (part) record(part.date, part.amount, true, event.incomeKind);
    else if (link?.type === 'income') record(link.date, link.amount, true, event.incomeKind);
    else if (mark?.done && event.projection !== 'review') record(paidOn(event, mark), mark.amount ?? event.amount, true, event.incomeKind);
    else if (event.payroll?.documented && event.payroll.actualNet != null) record(event.payroll.actualPayDate ?? event.date, event.payroll.actualNet, false, event.incomeKind, false, true);
    else {
      if (event.date < now && (event.incomeKind === 'salary' || event.incomeKind === 'advance' || event.incomeKind === 'bonusMonthly') && event.payroll) {
        missingEstimate += cents(event.amount);
      }
      const plan = projectedEvent(event, scenario);
      if (plan && event.date >= now && plan.date <= to) {
        record(plan.date, plan.amount, false, plan.incomeKind, incomeStatus(plan) === 'conditional');
        next.push(plan);
      }
    }
  }
  for (const op of journal) {
    if (op.type === 'income' && op.status === 'confirmed' && op.fundingSource !== 'borrowed' && (!op.eventKey || !byKey.has(op.eventKey))) {
      if (op.payrollParts) {
        for (const part of op.payrollParts) if (!byKey.has(part.key)) record(op.date, part.amount, true);
      } else record(op.date, op.amount, true);
    }
  }
  const sum = (rows: typeof entries) => {
    const actual = rows.filter(row => row.actual);
    const planned = rows.filter(row => !row.actual && !row.documentary);
    const documented = rows.filter(row => row.documentary);
    const actualTotal = rubles(actual.reduce((total, row) => total + row.amount, 0));
    const expected = rubles(planned.reduce((total, row) => total + row.amount, 0));
    const conditional = rubles(planned.reduce((total, row) => total + (row.conditional ? row.amount : 0), 0));
    const documentary = rubles(documented.reduce((total, row) => total + row.amount, 0));
    return { actual: actual.length ? actualTotal : null, documentary, expected, conditional,
      total: rows.length ? rubles(cents(actualTotal) + cents(documentary) + cents(expected)) : null };
  };
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return { month, ...sum(entries.filter(row => row.date.startsWith(month))) };
  });
  return { ...sum(entries), missingEstimate: rubles(missingEstimate), months, next: next.sort((a, b) => a.date.localeCompare(b.date)),
    breakdown: (Object.keys(INCOME_GROUPS) as IncomeGroup[]).map(group => ({ group, ...sum(entries.filter(row => row.group === group)) })) };
}

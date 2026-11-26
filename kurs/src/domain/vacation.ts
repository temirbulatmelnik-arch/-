import { cents, rubles } from './accounts';
import { addDays } from './dates';
import type { PayRate, Vacation } from './payroll';
import { federalHoliday, workHours } from './workdays';

/** Параметры существующего расчёта госслужащего Санкт-Петербурга. */
export const VACATION_RULE_SPB = {
  id: 'ru-spb-public-service-2026',
  minimumNoticeDays: 10,
  allowanceSalaries: 3,
} as const;

export function vacationDays(v: Pick<Vacation, 'from' | 'to'>, hours?: Record<string, number>) {
  let calendar = 0, work = 0;
  for (let date = v.from; date <= v.to; date = addDays(date, 1)) {
    if (!federalHoliday(date)) calendar++;
    if (workHours(date, hours) > 0) work++;
  }
  return { calendar, work };
}

export function explainVacation(v: Vacation, rate?: PayRate, hours?: Record<string, number>) {
  const { calendar } = vacationDays(v, hours);
  const sources = [VACATION_RULE_SPB.id, ...(v.basis ? [v.basis] : [])];
  if (v.gross != null) return { value: cents(v.gross), formula: 'documentedGross', inputs: { calendar }, sources };
  if (v.dailyGross != null) {
    const multiplier = v.estimateUnit && rate ? rate.unit / v.estimateUnit : 1;
    return { value: cents(v.dailyGross * calendar * multiplier), formula: 'dailyGross * days * multiplier',
      inputs: { dailyGross: cents(v.dailyGross), calendar, multiplier }, sources };
  }
  if (!rate || !v.formula) return null;
  const additions = v.formula.additions.reduce((sum, entry) => sum + cents(entry.amount * (entry.index ?? 1)), 0);
  const salary = cents(rate.unit * (rate.positionUnits + rate.rankUnits));
  return { value: Math.round((salary + additions / 12) * calendar / v.formula.divisor),
    formula: '(salary + annualAdditions / 12) * days / divisor',
    inputs: { salary, additions, calendar, divisor: v.formula.divisor }, sources };
}

export function vacationAllowance(rate: PayRate) {
  return rubles(cents(VACATION_RULE_SPB.allowanceSalaries * rate.unit * (rate.positionUnits + rate.rankUnits)));
}

import { addDays, addMonths, dayIn, lastDay, monthKey } from './dates';
import { cents, kopecks, rubles, validAmount, validDate } from './accounts';
import { calendarApproved, federalHoliday, workdayOnOrBefore, workHours } from './workdays';
import type { CalEvent, EventMark, IncomeKind } from './types';

export interface PayRate {
  from: string;
  unit: number;
  positionUnits: number;
  rankUnits: number;
  seniority: number;
  conditions: number;
  monthlyBonus: number;
  confidence: 'confirmed' | 'estimate';
  source?: string;
}

export interface Vacation {
  id: string;
  from: string;
  to: string;
  status: 'planned' | 'approved' | 'taken';
  allowance?: boolean;
  payDate?: string;
  /** Основание расчёта по кадровому документу, уже приведённое к дневной сумме. */
  dailyGross?: number;
  basis?: string;
  formula?: { divisor: number; additions: { amount: number; index?: number }[] };
}

export interface PayrollProfile {
  from: string;
  rates: PayRate[];
  accountId?: string;
  advancesBy?: 'days' | 'hours';
  workingHours?: Record<string, number>;
  absenceHours?: Record<string, number>;
  vacations?: Vacation[];
  vacationDaysRemaining?: number;
  taxBase?: Record<string, { asOf: string; base: number }>;
  deductions?: Record<string, number>;
  actual?: Record<string, { gross?: number; tax?: number; otherWithheld?: number; verifiedBy?: string; asOf: string }>;
}

export interface WorkPay {
  key: string;
  title: string;
  kind: IncomeKind;
  accrualPeriod: string;
  nominalDate: string;
  expectedPayDate: string;
  actualPayDate?: string;
  actualNet?: number;
  gross: number;
  tax: number;
  net: number;
  netRange?: [number, number];
  confidence: NonNullable<CalEvent['confidence']>;
  source: string;
  provisionalCalendar: boolean;
  vacationId?: string;
}

export const UNIT_REFERENCE: Record<number, number> = { 2026: 2071, 2027: 2157, 2028: 2245 };
const PAYMENTS = {
  advance: { day: 25, title: 'Аванс' }, salary: { day: 10, title: 'Зарплата' },
  bonusMonthly: { day: 15, title: 'Ежемесячная премия' },
} as const;
export const isRegularWork = (kind?: IncomeKind) => kind === 'advance' || kind === 'salary' || kind === 'bonusMonthly';

export function payComponents(r: PayRate) {
  const position = cents(r.unit * r.positionUnits);
  const rank = cents(r.unit * r.rankUnits);
  const seniority = Math.round(position * r.seniority);
  const conditions = Math.round(position * r.conditions);
  const bonus = Math.round(position * r.monthlyBonus);
  const base = position + rank + seniority + conditions;
  return { position: rubles(position), rank: rubles(rank), seniority: rubles(seniority),
    conditions: rubles(conditions), base: rubles(base), bonus: rubles(bonus), total: rubles(base + bonus) };
}

const dateRange = (from: string, to: string): string[] => {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
};

export function vacationDays(v: Pick<Vacation, 'from' | 'to'>, hours?: Record<string, number>) {
  const days = dateRange(v.from, v.to);
  return { calendar: days.filter(date => !federalHoliday(date)).length,
    work: days.filter(date => workHours(date, hours) > 0).length };
}

export function vacationGross(v: Vacation, profile: PayrollProfile): number | null {
  const days = vacationDays(v, profile.workingHours).calendar;
  if (v.dailyGross != null) return kopecks(v.dailyGross * days);
  const rate = effectiveRate(profile.rates, v.from);
  if (!rate || !v.formula) return null;
  const additions = v.formula.additions.reduce((total, entry) => total + cents(entry.amount * (entry.index ?? 1)), 0);
  return rubles(Math.round((cents(rate.unit * (rate.positionUnits + rate.rankUnits)) + additions / 12) * days / v.formula.divisor));
}

export function validPayroll(profile: PayrollProfile): boolean {
  if (!profile || !validDate(profile.from) || !Array.isArray(profile.rates) || !profile.rates.length) return false;
  if (!profile.rates.every(r => r && validDate(r.from) && validAmount(r.unit) && r.unit > 0 &&
      [r.positionUnits, r.rankUnits, r.seniority, r.conditions, r.monthlyBonus].every(amount => validAmount(amount) && amount >= 0) &&
      (r.confidence === 'confirmed' || r.confidence === 'estimate'))) return false;
  if (new Set(profile.rates.map(r => r.from)).size !== profile.rates.length || !profile.rates.some(r => r.from <= profile.from)) return false;
  for (const data of [profile.workingHours, profile.absenceHours]) {
    if (data == null) continue;
    if (typeof data !== 'object' || !Object.entries(data).every(([date, h]) => validDate(date) && validAmount(h) && h >= 0 && h <= 24)) return false;
  }
  const vacations = profile.vacations ?? [];
  if (!Array.isArray(vacations) || new Set(vacations.map(v => v?.id)).size !== vacations.length) return false;
  const sorted = [...vacations].sort((a, b) => (a?.from ?? '').localeCompare(b?.from ?? ''));
  if (!sorted.every((v, i) => v && typeof v.id === 'string' && !!v.id && validDate(v.from) && validDate(v.to) &&
      v.from <= v.to && v.to <= addMonths(v.from.slice(0, 7), 3) + '-01' && ['planned', 'approved', 'taken'].includes(v.status)
      && (v.payDate == null || validDate(v.payDate)) && (v.dailyGross == null || (validAmount(v.dailyGross) && v.dailyGross >= 0))
      && (v.formula == null || (validAmount(v.formula.divisor) && v.formula.divisor > 0
        && Array.isArray(v.formula.additions) && v.formula.additions.every(a => a && validAmount(a.amount) && a.amount >= 0
          && (a.index == null || (validAmount(a.index) && a.index > 0)))))
      && (!i || sorted[i - 1].to < v.from))) return false;
  const taxBases = profile.taxBase ?? {};
  if (!Object.entries(taxBases).every(([y, t]) => t && validDate(t.asOf) && t.asOf.startsWith(y + '-') && validAmount(t.base) && t.base >= 0)) return false;
  return Object.values(profile.deductions ?? {}).every(d => validAmount(d) && d >= 0)
    && Object.values(profile.actual ?? {}).every(a => a && validDate(a.asOf)
      && [a.gross, a.tax, a.otherWithheld].every(x => x == null || (validAmount(x) && x >= 0)));
}

const effectiveRate = (rates: PayRate[], date: string) => rates.filter(r => r.from <= date).reduce<PayRate | undefined>(
  (latest, rate) => !latest || latest.from < rate.from ? rate : latest, undefined,
);

export function accrual(profile: PayrollProfile, month: string) {
  const days = dateRange(`${month}-01`, dayIn(month, lastDay(month)));
  const schedule = days.map(date => ({
    date, norm: workHours(date, profile.workingHours), rate: effectiveRate(profile.rates, date),
    vacation: profile.vacations?.some(v => date >= v.from && date <= v.to),
  }));
  const byHours = profile.advancesBy === 'hours';
  const norm = schedule.reduce((sum, d) => sum + (byHours ? d.norm : Number(d.norm > 0)), 0);
  const workDays = schedule.filter(d => d.norm > 0);
  let base = 0, advance = 0, monthly = 0;
  for (const day of workDays) {
    if (!day.rate || day.vacation) continue;
    const allowed = Math.max(0, day.norm - Math.max(0, profile.absenceHours?.[day.date] ?? 0));
    const units = byHours ? allowed : allowed / day.norm;
    const c = payComponents(day.rate);
    base += cents(c.base) * units / norm;
    monthly += cents(c.bonus) * units / norm;
    if (Number(day.date.slice(8)) <= 15) advance += cents(c.base) * units / norm;
  }
  const gross = Math.round(base);
  const first = Math.round(advance);
  return { base: rubles(gross), advance: rubles(first), salary: rubles(gross - first), bonusMonthly: rubles(Math.round(monthly)),
    days: workDays.length, firstDays: workDays.filter(d => Number(d.date.slice(8)) <= 15).length };
}

const TAX = [[2_400_000, 13], [5_000_000, 15], [20_000_000, 18], [50_000_000, 20], [Infinity, 22]] as const;

export function progressiveTax(base: number): number {
  let total = 0, previous = 0;
  const taxable = cents(base);
  for (const [limit, rate] of TAX) {
    total += Math.max(0, Math.min(cents(limit), taxable) - cents(previous)) * rate;
    if (taxable <= cents(limit)) break;
    previous = limit;
  }
  return Math.round(total / 10000);
}

type GrossPay = Omit<WorkPay, 'tax' | 'net' | 'netRange' | 'actualPayDate' | 'actualNet'>;
export function workPayments(profile: PayrollProfile, from: string, to: string, marks: Record<string, EventMark> = {}): WorkPay[] {
  if (!validPayroll(profile) || to < profile.from) return [];
  const firstMonth = `${from.slice(0, 4)}-01`;
  const off = profile.workingHours;
  const lines: GrossPay[] = [];
  for (let m = addMonths(firstMonth, -1); m <= monthKey(to); m = addMonths(m, 1)) {
    if (m < addMonths(monthKey(profile.from), -1)) continue;
    const calc = accrual(profile, m);
    const rate = effectiveRate(profile.rates, dayIn(m, 'last'));
    if (!rate) continue;
    for (const [kind, item] of Object.entries(PAYMENTS) as [keyof typeof PAYMENTS, typeof PAYMENTS[keyof typeof PAYMENTS]][]) {
      const nominalMonth = kind === 'advance' ? m : addMonths(m, 1);
      const nominalDate = dayIn(nominalMonth, item.day);
      const expectedPayDate = workdayOnOrBefore(nominalDate, off);
      if (nominalDate < profile.from) continue;
      const provisionalCalendar = !calendarApproved(Number(nominalDate.slice(0, 4)));
      const confidence = provisionalCalendar ? 'estimate' : 'regular';
      lines.push({ key: `inc:${kind}:${nominalMonth}`, kind, title: item.title, accrualPeriod: m, nominalDate, expectedPayDate,
        gross: calc[kind], source: rate.source ?? 'Параметры работодателя', confidence, provisionalCalendar });
    }
  }

  const allowanceYears = new Set<string>();
  for (const v of [...(profile.vacations ?? [])].sort((a, b) => a.from.localeCompare(b.from))) {
    const year = v.from.slice(0, 4);
    if (v.to < profile.from) continue;
    const rate = effectiveRate(profile.rates, v.from);
    if (!rate) continue;
    const nominalDate = addDays(v.from, -3);
    const payDate = v.payDate ?? workdayOnOrBefore(nominalDate, off);
    const common = {
      kind: 'vacation' as const, accrualPeriod: monthKey(v.from), nominalDate, expectedPayDate: payDate, vacationId: v.id,
      confidence: 'tentative' as const, provisionalCalendar: !calendarApproved(Number(year)),
    };
    const vacationEstimatedGross = vacationGross(v, profile);
    if (vacationEstimatedGross != null || marks[`work:vacation:${v.id}`]?.done) lines.push({
      ...common, key: `work:vacation:${v.id}`, title: 'Денежное содержание на отпуск',
      gross: vacationEstimatedGross ?? 0,
      source: v.basis ?? 'Расчётная дневная сумма',
      confidence: v.status !== 'planned' && vacationEstimatedGross != null && v.basis && v.payDate ? 'confirmed' : 'tentative',
    });
    if (v.allowance && !allowanceYears.has(year)) {
      allowanceYears.add(year);
      lines.push({ ...common, key: `work:allowance:${year}`, title: 'Единовременная выплата к отпуску',
        gross: kopecks(3 * rate.unit * (rate.positionUnits + rate.rankUnits)), source: rate.source ?? 'Параметры работодателя' });
    }
  }
  const payDay = (line: GrossPay) => marks[line.key]?.done ? marks[line.key].paidDate ?? marks[line.key].at.slice(0, 10) : line.expectedPayDate;
  lines.sort((a, b) => payDay(a).localeCompare(payDay(b)) || a.key.localeCompare(b.key));
  const bases = new Map<string, number>();
  return lines.flatMap(p => {
    const paid = marks[p.key];
    const actualPayDate = paid?.done ? paid.paidDate ?? paid.at.slice(0, 10) : undefined;
    const date = actualPayDate ?? p.expectedPayDate;
    const year = date.slice(0, 4);
    const known = profile.taxBase?.[year];
    const actual = paid?.done ? profile.actual?.[p.key] : undefined;
    const gross = actual?.gross ?? p.gross;
    const before = bases.get(year) ?? (known?.base ?? 0);
    const taxable = Math.max(0, gross - (profile.deductions?.[p.key] ?? 0));
    const within = !known || date > known.asOf;
    const tax = actual?.tax ?? (within ? progressiveTax(before + taxable) - progressiveTax(before) : progressiveTax(taxable));
    if (within) bases.set(year, before + taxable);
    if (date < from || date > to) return [];
    const net = Math.max(0, kopecks(gross - tax - (actual?.otherWithheld ?? 0)));
    return [{ ...p, gross, tax, net, actualPayDate, actualNet: paid?.done ? paid.amount : undefined,
      ...(known ? {} : { netRange: [kopecks(gross * 0.78), kopecks(gross * 0.87)] as [number, number] }) }];
  });
}

export function workEvents(profile: PayrollProfile, from: string, to: string, marks?: Record<string, EventMark>): CalEvent[] {
  return workPayments(profile, from, to, marks).map(p => ({
    key: p.key, date: p.actualPayDate ?? p.expectedPayDate, dateMode: p.actualPayDate ? 'exact' : 'approx', kind: 'income',
    title: p.title, amount: p.net, approx: true, incomeKind: p.kind, economicType: 'income',
    planned: p.nominalDate, nominalDate: p.nominalDate, expectedPayDate: p.expectedPayDate, accrualPeriod: p.accrualPeriod,
    confidence: p.confidence, accountId: profile.accountId,
  }));
}

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
  /** Расчётная единица, к которой относится предварительная дневная сумма. */
  estimateUnit?: number;
  gross?: number;
  basis?: string;
  formula?: { divisor: number; additions: { amount: number; index?: number }[] };
}

export interface PayrollProfile {
  from: string;
  rates: PayRate[];
  accountId?: string;
  advancesBy?: 'days' | 'hours';
  cautiousUnit2027?: number;
  workingHours?: Record<string, number>;
  absenceHours?: Record<string, number>;
  attendance?: Record<string, { paidDays: number; firstPaidDays: number }>;
  vacations?: Vacation[];
  vacationDaysRemaining?: number;
  taxBase?: Record<string, { asOf: string; base: number }>;
  deductions?: Record<string, number>;
  actual?: Record<string, PayrollActual>;
  extras?: Record<string, PayrollExtra>;
  payDates?: Record<string, string>;
  aliases?: Record<string, string>;
}

export interface PayrollActual {
  expectedNet?: number;
  net?: number;
  gross?: number;
  tax?: number;
  otherWithheld?: number;
  verifiedBy?: string;
  asOf: string;
  payDate?: string;
  payMonth?: string;
  kind?: IncomeKind;
  title?: string;
  accrualPeriod?: string;
}

export interface PayrollExtra {
  date: string;
  title: string;
  kind: IncomeKind;
  gross: number;
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
  actualMonth?: string;
  documented?: boolean;
  documentarySource?: string;
  actualGrossKnown?: boolean;
  actualTaxKnown?: boolean;
  alternatePayDate?: string;
  recordedForecast?: number;
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
export const UNIT_2027 = [
  { id: 'law', unit: UNIT_REFERENCE[2027], label: 'Закон № 659-124' },
  { id: 'proposal', unit: 2167, label: 'Проект бюджета' },
] as const;

export function with2027Unit(profile: PayrollProfile, unit: number): PayrollProfile {
  const from = '2027-01-01';
  const end = '2028-01-01';
  const startRate = effectiveRate(profile.rates, from);
  if (!startRate) return profile;
  const rates = profile.rates.map(rate => rate.from >= from && rate.from < end ? { ...rate, unit, confidence: 'estimate' as const } : rate);
  if (!rates.some(rate => rate.from === from)) rates.push({ ...startRate, from, unit, confidence: 'estimate' });
  if (!rates.some(rate => rate.from === end)) {
    const original = effectiveRate(profile.rates, end);
    if (original) rates.push({ ...original, from: end });
  }
  return { ...profile, rates: rates.sort((a, b) => a.from.localeCompare(b.from)) };
}
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
  const bonus = position * r.monthlyBonus;
  const base = position + rank + seniority + conditions;
  return { position: rubles(position), rank: rubles(rank), seniority: rubles(seniority),
    conditions: rubles(conditions), base: rubles(base), bonus: Math.round(bonus / 100), total: rubles(base) + Math.round(bonus / 100) };
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
  const rate = effectiveRate(profile.rates, v.from);
  if (v.gross != null) return v.gross;
  if (v.dailyGross != null) return kopecks(v.dailyGross * days * (v.estimateUnit && rate ? rate.unit / v.estimateUnit : 1));
  if (!rate || !v.formula) return null;
  const additions = v.formula.additions.reduce((total, entry) => total + cents(entry.amount * (entry.index ?? 1)), 0);
  return rubles(Math.round((cents(rate.unit * (rate.positionUnits + rate.rankUnits)) + additions / 12) * days / v.formula.divisor));
}

const validMonth = (value: unknown): value is string => typeof value === 'string' && validDate(value + '-01');
const payKinds = new Set<IncomeKind>(['salary', 'advance', 'bonusMonthly', 'bonusQuarter', 'bonusYear', 'vacation', 'thirteenth', 'other']);

export function validPayroll(profile: PayrollProfile): boolean {
  if (!profile || !validDate(profile.from) || !Array.isArray(profile.rates) || !profile.rates.length) return false;
  if (profile.cautiousUnit2027 != null && (!validAmount(profile.cautiousUnit2027) || profile.cautiousUnit2027 <= 0)) return false;
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
      && (v.payDate == null || validDate(v.payDate))
      && [v.dailyGross, v.gross].every(n => n == null || (validAmount(n) && n >= 0))
      && (v.estimateUnit == null || (validAmount(v.estimateUnit) && v.estimateUnit > 0))
      && (v.formula == null || (validAmount(v.formula.divisor) && v.formula.divisor > 0
        && Array.isArray(v.formula.additions) && v.formula.additions.every(a => a && validAmount(a.amount) && a.amount >= 0
          && (a.index == null || (validAmount(a.index) && a.index > 0)))))
      && (!i || sorted[i - 1].to < v.from))) return false;
  const taxBases = profile.taxBase ?? {};
  if (!Object.entries(taxBases).every(([y, t]) => t && validDate(t.asOf) && t.asOf.startsWith(y + '-') && validAmount(t.base) && t.base >= 0)) return false;
  return Object.values(profile.deductions ?? {}).every(d => validAmount(d) && d >= 0)
    && Object.entries(profile.attendance ?? {}).every(([month, a]) => validMonth(month) && a &&
      Number.isFinite(a.paidDays) && a.paidDays >= 0 && a.paidDays <= 31 &&
      Number.isFinite(a.firstPaidDays) && a.firstPaidDays >= 0 && a.firstPaidDays <= Math.min(15, a.paidDays))
    && Object.values(profile.payDates ?? {}).every(validDate)
    && Object.values(profile.aliases ?? {}).every(key => typeof key === 'string' && !!key)
    && new Set(Object.values(profile.aliases ?? {})).size === Object.keys(profile.aliases ?? {}).length
    && Object.values(profile.extras ?? {}).every(e => e && validDate(e.date) && payKinds.has(e.kind) &&
      typeof e.title === 'string' && !!e.title && validAmount(e.gross) && e.gross > 0)
    && Object.values(profile.actual ?? {}).every(a => a && validDate(a.asOf)
      && (a.payDate == null || validDate(a.payDate)) && (a.payMonth == null || validMonth(a.payMonth))
      && (a.accrualPeriod == null || validMonth(a.accrualPeriod)) && (a.kind == null || payKinds.has(a.kind))
      && (a.title == null || typeof a.title === 'string')
      && [a.expectedNet, a.net, a.gross, a.tax, a.otherWithheld].every(x => x == null || (validAmount(x) && x >= 0)));
}

const effectiveRate = (rates: PayRate[], date: string) => rates.filter(r => r.from <= date).reduce<PayRate | undefined>(
  (latest, rate) => !latest || latest.from < rate.from ? rate : latest, undefined,
);
export const payRateOn = (profile: PayrollProfile, date: string) => effectiveRate(profile.rates, date);

export function accrual(profile: PayrollProfile, month: string) {
  const days = dateRange(`${month}-01`, dayIn(month, lastDay(month)));
  const schedule = days.map(date => ({
    date, norm: workHours(date, profile.workingHours), rate: effectiveRate(profile.rates, date),
    vacation: profile.vacations?.some(v => date >= v.from && date <= v.to),
  }));
  const byHours = profile.advancesBy === 'hours';
  const norm = schedule.reduce((sum, d) => sum + (byHours ? d.norm : Number(d.norm > 0)), 0);
  const workDays = schedule.filter(d => d.norm > 0);
  const firstDays = workDays.filter(d => Number(d.date.slice(8)) <= 15).length;
  const monthRate = workDays[0]?.rate;
  const attendance = profile.attendance?.[month];
  let base = 0, advance = 0, monthly = 0;
  for (const day of workDays) {
    if (!day.rate || day.vacation) continue;
    const allowed = Math.max(0, day.norm - Math.max(0, profile.absenceHours?.[day.date] ?? 0));
    const units = byHours ? allowed : allowed / day.norm;
    const c = payComponents(day.rate);
    base += cents(c.base) * units / norm;
    monthly += day.rate.unit * day.rate.positionUnits * day.rate.monthlyBonus * units / norm;
    if (Number(day.date.slice(8)) <= 15) advance += cents(c.base) * units / norm;
  }
  if (attendance && !byHours && monthRate && workDays.every(d => d.rate === monthRate)) {
    base = cents(payComponents(monthRate).base) * Math.min(attendance.paidDays, norm) / norm;
    advance = cents(payComponents(monthRate).base) * Math.min(attendance.firstPaidDays, firstDays) / norm;
    monthly = monthRate.unit * monthRate.positionUnits * monthRate.monthlyBonus * Math.min(attendance.paidDays, norm) / norm;
  }
  const gross = Math.round(base);
  const first = Math.round(advance);
  return { base: rubles(gross), advance: rubles(first), salary: rubles(gross - first), bonusMonthly: Math.round(kopecks(monthly)),
    days: workDays.length, firstDays };
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
      const key = `inc:${kind}:${nominalMonth}`;
      const normalDate = workdayOnOrBefore(nominalDate, off);
      const expectedPayDate = profile.payDates?.[key] ?? normalDate;
      if (nominalDate < profile.from) continue;
      const provisionalCalendar = !calendarApproved(Number(nominalDate.slice(0, 4)));
      const confidence = provisionalCalendar ? 'estimate' : 'regular';
      lines.push({ key, kind, title: item.title, accrualPeriod: m, nominalDate, expectedPayDate,
        ...(normalDate !== expectedPayDate ? { alternatePayDate: normalDate } : {}),
        gross: calc[kind], source: rate.source ?? 'Параметры работодателя', confidence, provisionalCalendar });
    }
  }

  const allowanceYears = new Set<string>();
  for (const v of [...(profile.vacations ?? [])].sort((a, b) => a.from.localeCompare(b.from))) {
    const year = v.from.slice(0, 4);
    if (v.to < profile.from) continue;
    const rate = effectiveRate(profile.rates, v.from);
    if (!rate) continue;
    const nominalDate = addDays(v.from, -10); // ст. 46 (ч. 10) № 79-ФЗ
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
  for (const [key, extra] of Object.entries(profile.extras ?? {})) {
    if (lines.some(p => p.key === key)) continue;
    lines.push({ key, kind: extra.kind, title: extra.title, accrualPeriod: monthKey(extra.date), nominalDate: extra.date,
      expectedPayDate: profile.payDates?.[key] ?? workdayOnOrBefore(extra.date, off), gross: extra.gross,
      source: 'Сценарная оценка', confidence: 'estimate', provisionalCalendar: !calendarApproved(Number(extra.date.slice(0, 4))) });
  }
  for (const [key, actual] of Object.entries(profile.actual ?? {})) {
    if (actual.net == null || !actual.kind || lines.some(p => p.key === key)) continue;
    const date = actual.payDate ?? (actual.payMonth && dayIn(actual.payMonth, 'last'));
    if (!date) continue;
    lines.push({ key, kind: actual.kind, title: actual.title ?? 'Выплата по документам', accrualPeriod: actual.accrualPeriod ?? monthKey(date),
      nominalDate: date, expectedPayDate: date, gross: actual.gross ?? 0,
      source: actual.verifiedBy ?? 'Расчётный листок', confidence: 'confirmed', provisionalCalendar: false });
  }
  const actualDate = (line: GrossPay) => {
    const mark = marks[line.key];
    const actual = profile.actual?.[line.key];
    return mark?.done ? mark.paidDate ?? actual?.payDate ?? mark.at.slice(0, 10) : actual?.payDate;
  };
  const payDay = (line: GrossPay) => actualDate(line) ?? (profile.actual?.[line.key]?.payMonth
    && monthKey(line.expectedPayDate) !== profile.actual[line.key].payMonth
    ? dayIn(profile.actual[line.key].payMonth!, 'last') : line.expectedPayDate);
  lines.sort((a, b) => payDay(a).localeCompare(payDay(b)) || a.key.localeCompare(b.key));
  const bases = new Map<string, number>();
  return lines.flatMap(p => {
    const paid = marks[p.key];
    const actual = profile.actual?.[p.key];
    const actualPayDate = actualDate(p);
    const actualNet = (paid?.done ? paid.amount : undefined) ?? actual?.net;
    const date = payDay(p);
    const year = date.slice(0, 4);
    const known = profile.taxBase?.[year];
    const gross = actual?.gross ?? p.gross;
    const before = bases.get(year) ?? (known?.base ?? 0);
    const taxable = Math.max(0, gross - (profile.deductions?.[p.key] ?? 0));
    const within = !known || date > known.asOf;
    const tax = actual?.tax ?? (within ? progressiveTax(before + taxable) - progressiveTax(before) : progressiveTax(taxable));
    if (within) bases.set(year, before + taxable);
    if (date < from || date > to) return [];
    const net = Math.max(0, kopecks(gross - tax - (actual?.otherWithheld ?? 0)));
    return [{ ...p, gross, tax, net, actualPayDate, actualNet, actualMonth: actualNet != null ? monthKey(date) : undefined,
      documented: actual?.net != null, documentarySource: actual?.verifiedBy,
      actualGrossKnown: actual?.gross != null, actualTaxKnown: actual?.tax != null, recordedForecast: actual?.expectedNet,
      ...(known || actualNet != null ? {} : { netRange: [kopecks(gross * 0.78), kopecks(gross * 0.87)] as [number, number] }) }];
  });
}

export function workEvents(profile: PayrollProfile, from: string, to: string, marks?: Record<string, EventMark>): CalEvent[] {
  return workPayments(profile, from, to, marks).map(p => ({
    key: p.key, date: p.actualPayDate ?? (p.actualMonth && !p.expectedPayDate.startsWith(p.actualMonth) ? dayIn(p.actualMonth, 'last') : p.expectedPayDate),
    dateMode: p.actualPayDate ? 'exact' : p.documented ? 'month' : 'approx', kind: 'income',
    title: p.title, amount: p.actualNet ?? p.net, approx: p.actualNet == null, incomeKind: p.kind, economicType: 'income',
    planned: p.nominalDate, nominalDate: p.nominalDate, expectedPayDate: p.expectedPayDate, accrualPeriod: p.accrualPeriod,
    confidence: p.confidence, accountId: profile.accountId, payroll: p,
  }));
}

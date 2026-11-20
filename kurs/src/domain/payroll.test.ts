import { describe, expect, it } from 'vitest';
import { eventsBetween } from './calendar';
import { accrual, payComponents, progressiveTax, vacationDays, workPayments, type PayrollProfile, type PayRate } from './payroll';
import { isWorkday, workHours, workdayOnOrBefore } from './workdays';

const rate: PayRate = { from: '2026-01-01', unit: 2071, positionUnits: 25, rankUnits: 9, seniority: 0.15, conditions: 0.65,
  monthlyBonus: 0.5, confidence: 'estimate' };
const model: PayrollProfile = { from: '2026-01-01', rates: [rate, { ...rate, from: '2027-01-01', unit: 2167 }] };

describe('трудовые выплаты и календарь', () => {
  it('расходится только разбивка аванса, а полный месяц сохраняет начисление', () => {
    expect(payComponents(rate)).toMatchObject({ base: 111834, total: 137722 });
    expect(accrual(model, '2026-11')).toEqual({ days: 20, firstDays: 9, base: 111834, advance: 50325.30, salary: 61508.70, bonusMonthly: 25888 });
    expect(accrual(model, '2026-12').base).toBe(111834);
    expect(payComponents({ ...rate, unit: 2167 }).total).toBe(144106);
    expect(payComponents({ ...rate, unit: 2157 }).total).toBe(143441);
  });

  it('учитывает переносы и сохраняет один ключ выплаты при переносе в другой год', () => {
    expect([isWorkday('2027-02-20'), workHours('2027-02-20'), isWorkday('2027-02-22'), isWorkday('2027-11-05'), isWorkday('2027-12-31')])
      .toEqual([true, 7, false, false, false]);
    expect(workdayOnOrBefore('2027-01-10')).toBe('2026-12-30');
    const payments = workPayments(model, '2026-12-29', '2027-01-31');
    expect(payments.filter(p => p.kind === 'salary')).toMatchObject([{ accrualPeriod: '2026-12', nominalDate: '2027-01-10', expectedPayDate: '2026-12-30' }]);
    expect(payments.find(p => p.kind === 'bonusMonthly')).toMatchObject({ nominalDate: '2027-01-15', accrualPeriod: '2026-12' });
    expect(payments.find(p => p.kind === 'advance')).toMatchObject({ nominalDate: '2027-01-25', accrualPeriod: '2027-01' });
  });

  it('оставляет фактическую дату, сумму и ключ после включения расчёта', () => {
    const legacy = { key: 'legacy-wage', date: '2027-01-10', dateMode: 'approx', kind: 'income', incomeKind: 'salary', title: 'Зарплата', amount: 59000 } as const;
    const marks = { [legacy.key]: { done: true, amount: 58200, at: '2026-12-30T09:00:00Z', paidDate: '2026-12-30' } };
    const c = { work: model, marks, debts: [], incomes: [], fixed: [], oneOff: [legacy], weeklyOverrides: [], templateFrom: '2026-01' };
    const salary = eventsBetween(c, '2026-12-28', '2027-01-21').filter(e => e.incomeKind === 'salary');
    expect(salary).toMatchObject([{ key: legacy.key, date: '2026-12-30', accrualPeriod: '2026-12' }]);
    expect(marks[salary[0].key].amount).toBe(58200);
  });

  it('выплата трёх окладов назначается один раз, рабочий расчёт исключает отпуск в двух месяцах', () => {
    const a = { id: 'spring', from: '2027-04-20', to: '2027-05-05', status: 'planned', allowance: true, dailyGross: 2100 } as const;
    const b = { ...a, id: 'summer', from: '2027-07-03', to: '2027-07-08' };
    const work = { ...model, vacations: [a, b] };
    expect(vacationDays(a)).toEqual({ calendar: 15, work: 11 });
    const pays = workPayments(work, '2027-04-01', '2027-08-01');
    expect(pays.filter(p => p.key.startsWith('work:allowance'))).toMatchObject([{ gross: 221034, vacationId: 'spring', confidence: 'tentative' }]);
    expect(pays.find(p => p.key === 'work:vacation:spring')).toMatchObject({ gross: 31500 });
    expect(accrual(work, '2027-04').base).toBeLessThan(accrual(model, '2027-04').base);
    expect(accrual(work, '2027-05').base).toBeLessThan(accrual(model, '2027-05').base);
  });

  it('разделяет смену ставки, укороченный день и отсутствие, применяет ставку НДФЛ к превышению порога', () => {
    const off = { ...model, advancesBy: 'hours' as const, absenceHours: { '2027-02-20': 3 },
      rates: [...model.rates, { ...rate, unit: 2350, from: '2027-02-15' }] };
    expect(accrual(off, '2027-02').days).toBe(19);
    expect(accrual(off, '2027-02').base).toBeGreaterThan(accrual(model, '2027-02').base);
    expect(progressiveTax(2_410_000) - progressiveTax(2_390_000)).toBe(2800);
    const mark = { 'inc:advance:2026-11': { done: true, amount: 43650, paidDate: '2026-11-26', at: '2026-11-26T09:00:00Z' } };
    expect(workPayments(model, '2026-11-25', '2026-11-27', mark)).toMatchObject([{ actualPayDate: '2026-11-26', actualNet: 43650 }]);
  });
});

it('моделирует отпускные раньше начала отпуска по сроку гражданской службы и не меняет дату факта', () => {
  const vacation = { id: 'annual', from: '2027-04-11', to: '2027-04-18', status: 'planned' as const, dailyGross: 2600, allowance: true };
  const employment = { ...model, vacations: [vacation] };
  const expected = workPayments(employment, '2027-04-01', '2027-04-11');
  expect(expected.find(p => p.key === 'work:vacation:annual')).toMatchObject({ nominalDate: '2027-04-01', gross: 20800, confidence: 'tentative' });
  const key = 'work:vacation:annual';
  const fact = workPayments({ ...employment, actual: { [key]: { expectedNet: 18096, asOf: '2027-03-31' } } },
    '2027-03-31', '2027-04-11', { [key]: { done: true, amount: 17900, paidDate: '2027-03-31', at: '2027-03-31T15:00:00Z' } });
  expect(fact.find(p => p.key === key)).toMatchObject({ actualPayDate: '2027-03-31', actualNet: 17900, recordedForecast: 18096 });
});

it('uses one payment and the new tax year when the employer pays after the holidays', () => {
  const key = 'inc:salary:2027-01';
  const profile = { ...model, payDates: { [key]: '2027-01-11' }, taxBase: { 2026: { asOf: '2026-12-25', base: 3000000 } } };
  const payments = workPayments(profile, '2026-12-27', '2027-01-20');
  const january = payments.filter(p => p.key === key);
  expect(january).toMatchObject([{ expectedPayDate: '2027-01-11', alternatePayDate: '2026-12-30' }]);
  expect(january[0].tax).toBe(Math.round(january[0].gross * 0.13));
  const confirmed = { [key]: { done: true, amount: 48195, paidDate: '2026-12-30', at: '2026-12-30T10:00:00Z' } };
  const paid = workPayments(profile, '2026-12-29', '2027-01-20', confirmed).filter(p => p.key === key);
  expect(paid).toMatchObject([{ actualNet: 48195, actualPayDate: '2026-12-30' }]);
  expect(paid[0].tax).toBe(Math.round(paid[0].gross * 0.15));
});

it('rounds the earned bonus only after applying the fraction of paid days', () => {
  const example = { ...model, attendance: { '2026-10': { paidDays: 12, firstPaidDays: 7 } } };
  const earned = accrual(example, '2026-10');
  expect(earned.bonusMonthly).toBe(Math.round(rate.unit * rate.positionUnits * rate.monthlyBonus * 12 / 22));
  expect(earned.advance).toBeCloseTo(payComponents(rate).base * 7 / 22, 2);
  const count = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2027, 0, i + 1)).toISOString().slice(0, 10)).filter(isWorkday);
  expect(count).toHaveLength(247);
});

it('counts a documented historical income once and retains both holiday payments instead of a template', async () => {
  const { annualIncome } = await import('./annualIncome');
  const vacations = [{ id: 'fixture-spring', from: '2027-04-08', to: '2027-04-18', status: 'planned' as const, dailyGross: 2100, allowance: true }];
  const key = 'inc:salary:2026-11';
  const bankNet = 8899;
  const work = { ...model, vacations, actual: { [key]: { net: 8900, payDate: '2026-11-10', asOf: '2026-11-12' } } };
  const marks = { [key]: { done: true, paidDate: '2026-11-10', at: '2026-11-10T10:00:00Z', amount: bankNet } };
  const oneOff = [
    { key, kind: 'income', date: '2026-11-10', title: 'Оплата труда', dateMode: 'exact', amount: 8900 },
    { key: 'credit-line', kind: 'income', date: '2026-11-10', title: 'Заём', dateMode: 'exact', amount: 111, economicType: 'loan_disbursement' },
  ] as const;
  const cal = { work, marks: { ...marks, 'credit-line': { ...marks[key], amount: 111 } }, debts: [], fixed: [],
    incomes: [{ kind: 'vacation' as const, day: 31, months: [3], name: 'Отпуск (старый шаблон)', amount: 25000 }],
    oneOff: [...oneOff], weeklyOverrides: [], templateFrom: '2026-01' };
  const actual = annualIncome(cal, 2026, '2026-11-20', 'base');
  expect(actual.actual).toBe(bankNet);
  const spring = eventsBetween(cal, '2027-03-01', '2027-04-01').filter(e => e.incomeKind === 'vacation');
  expect(spring.map(e => e.key).sort()).toEqual(['work:allowance:2027', 'work:vacation:fixture-spring']);
  const base = annualIncome(cal, 2027, '2026-11-20', 'base');
  const cautious = annualIncome(cal, 2027, '2026-11-20', 'cautious');
  expect(base.months[2].total).toBeGreaterThan(cautious.months[2].total!);
});

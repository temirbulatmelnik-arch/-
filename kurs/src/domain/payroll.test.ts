import { describe, expect, it } from 'vitest';
import { eventsBetween } from './calendar';
import { accrual, payComponents, progressiveTax, vacationDays, workPayments, type PayrollProfile, type PayRate } from './payroll';
import { isWorkday, workHours, workdayOnOrBefore } from './workdays';

const rate: PayRate = { from: '2026-01-01', unit: 2071, positionUnits: 25, rankUnits: 9, seniority: 0.15, conditions: 0.65,
  monthlyBonus: 0.5, confidence: 'estimate' };
const model: PayrollProfile = { from: '2026-01-01', rates: [rate, { ...rate, from: '2027-01-01', unit: 2167 }] };

describe('трудовые выплаты и календарь', () => {
  it('расходится только разбивка аванса, а полный месяц сохраняет начисление', () => {
    expect(payComponents(rate)).toMatchObject({ base: 111834, total: 137721.50 });
    expect(accrual(model, '2026-11')).toEqual({ days: 20, firstDays: 9, base: 111834, advance: 50325.30, salary: 61508.70, bonusMonthly: 25887.50 });
    expect(accrual(model, '2026-12').base).toBe(111834);
    expect(payComponents({ ...rate, unit: 2167 }).total).toBe(144105.50);
    expect(payComponents({ ...rate, unit: 2157 }).total).toBe(143440.50);
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

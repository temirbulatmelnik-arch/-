import { describe, expect, it } from 'vitest';
import { EMPTY_BOOK } from './accounts';
import { coverage, safePrepayment, type CoverageInput } from './coverage';
import type { CalEvent } from './types';

const date = '2026-11-23';
const payment: CalEvent = { key: 'bill', title: 'Автоплатёж', kind: 'payment', date: '2026-11-24', dateMode: 'exact', amount: 8000, accountId: 'debit' };
const salary: CalEvent = { key: 'salary', title: 'Оплата труда', kind: 'income', incomeKind: 'salary', date: payment.date,
  dateMode: 'exact', amount: 10000, confidence: 'regular', accountId: 'debit' };
const bonus: CalEvent = { ...salary, key: 'year', incomeKind: 'bonusYear', date: '2026-12-01', amount: 120000, confidence: 'estimate' };
function input(events: CalEvent[], cash: CoverageInput['cash']): CoverageInput {
  return { marks: {}, reserve: 0, debts: [], expenses: [], cash, cal: { debts: [], incomes: [], fixed: [],
    templateFrom: date.slice(0, 7), weeklyOverrides: [], oneOff: events, accountBook: EMPTY_BOOK } };
}

describe('платёжеспособность по счетам', () => {
  it('показывает кассовый риск на карте при достаточной сумме всех счетов и зарплате в тот же день', () => {
    const cov = coverage(input([payment, salary], { debit: 2000, reserve: 380000, life: 1000 }), date, 'cautious');
    expect(cov.shortage).toBeNull();
    expect(cov.accountRisk).toMatchObject({ date: payment.date, accountId: 'debit', amount: 6000 });
    expect(cov.accountByDay?.[payment.date].debit).toBe(4000);
    expect(cov.to >= '2027-04-22').toBe(true);
  });

  it('повторно прогоняет все дни после досрочки; реальный лимит ограничен конкретным счётом', () => {
    expect(safePrepayment(input([payment, salary], { debit: 9000, reserve: 380000, life: 1000 }), date, 'debit')).toBe(1000);
    expect(safePrepayment(input([payment, salary], { debit: 2000, reserve: 380000, life: 1000 }), date, 'debit')).toBe(0);
    expect(safePrepayment(input([{ ...payment, accountId: undefined }], { debit: 60000, reserve: 380000, life: 1000 }), date, 'debit')).toBe(0);
  });

  it('учитывает ежемесячную премию в осторожном режиме, годовую только в базовом, стресс как расход', () => {
    const regular = { ...salary, incomeKind: 'bonusMonthly' as const };
    const state = input([regular, bonus], { debit: 0, reserve: 380000, life: 0 });
    state.cal.accountBook = { ...EMPTY_BOOK, stress: { date, amount: 1800, accountId: 'reserve' } };
    expect(coverage(state, date).steps.map(s => s.key)).toContain(bonus.key);
    const cautious = coverage(state, date, 'cautious');
    expect(cautious.steps.map(s => s.key)).not.toContain(bonus.key);
    expect(cautious.steps.map(s => s.key)).toContain(regular.key);
    expect(coverage(state, date, 'stress').byDay[date]).toBe(cautious.byDay[date] - 1800);
  });
});

it('строит два независимых кассовых прогноза на весь 2027 год с одной и той же истории', async () => {
  const { compare2027Coverage } = await import('./coverage');
  const s = input([], { life: 200000, reserve: 350000, debit: 0 });
  s.cal.work = { from: '2026-10-01', rates: [{ from: '2026-10-01', unit: 2071, positionUnits: 23, rankUnits: 6,
    seniority: 0.25, conditions: 0.45, monthlyBonus: 0.45, confidence: 'estimate' }] };
  const ranges = compare2027Coverage(s, date);
  expect(ranges).toMatchObject([{ id: 'law', unit: 2157 }, { id: 'proposal', unit: 2167 }]);
  expect(ranges.every(r => r.to >= '2027-12-31')).toBe(true);
  const advance2026 = 'inc:advance:2026-12';
  const advance2027 = 'inc:advance:2027-01';
  expect(ranges[0].steps.find(e => e.key === advance2026)?.delta).toBe(ranges[1].steps.find(e => e.key === advance2026)?.delta);
  expect(ranges[1].steps.find(e => e.key === advance2027)!.delta).toBeGreaterThan(ranges[0].steps.find(e => e.key === advance2027)!.delta);
  expect(s.cal.work.rates).toMatchObject([{ from: '2026-10-01', unit: 2071 }]);
});

it('checks each obligation and funds the following morning only from a feasible planned transfer', () => {
  const state = input([payment, { ...payment, key: 'unassigned', accountId: undefined }], { debit: 2500, reserve: 100000, life: 5000 });
  state.cal.accountBook = { ...EMPTY_BOOK, operations: [{
    id: 'move-for-bill', date, type: 'transfer', accountId: 'reserve', toAccountId: 'debit',
    amount: 5500, origin: 'manual', status: 'planned', fundingSource: 'own',
  }] };
  const actual = coverage(state, date);
  expect(actual.paymentFunding?.find(row => row.key === 'bill')).toMatchObject({
    available: 8000, shortfall: 0, prepareBy: date,
  });
  expect(actual.paymentFunding?.find(row => row.key === 'unassigned')).toMatchObject({ available: null, shortfall: null });
  expect(actual.transferFunding).toMatchObject([{ status: 'projected' }]);
  state.cash!.reserve = 5400;
  const rejected = coverage(state, date);
  expect(rejected.transferFunding).toMatchObject([{ status: 'insufficient' }]);
  expect(rejected.paymentFunding?.find(row => row.key === 'bill')).toMatchObject({ available: 2500, shortfall: 5500 });
  state.cash!.reserve = 100000;
  state.cal.accountBook.operations[0].date = payment.date;
  expect(coverage(state, date).paymentFunding?.find(row => row.key === 'bill')?.shortfall).toBe(5500);
});

it('compares scenarios on identical exact dates, separating conditional receipts from ordinary estimates', async () => {
  const { compareCoverage } = await import('./coverage');
  const until = '2026-12-02';
  const seasonal = { ...bonus, date: '2026-11-30', key: 'conditional', amount: 1800 };
  const later = { ...bonus, date: '2026-12-23', key: 'outside' };
  const state = input([payment, salary, seasonal, later], { debit: 5000, reserve: 8000, life: 5000 });
  const rows = compareCoverage(state, date, until);
  expect(rows).toHaveLength(3);
  expect(rows.every(row => row.to === until && row.comparisonDate === rows[0].comparisonDate)).toBe(true);
  expect(coverage(state, date, 'base', until).steps.some(step => step.key === 'outside')).toBe(false);
  expect(rows[1].flowsOnComparisonDate.conditionalIncome).toBe(0);
  expect(rows[0].closingOnComparisonDate).toBeGreaterThanOrEqual(rows[1].closingOnComparisonDate);
});

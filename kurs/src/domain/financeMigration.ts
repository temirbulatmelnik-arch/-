import { budgetExpenses, canonicalBook, cents, EMPTY_BOOK, postings } from './accounts';
import type { ExchangeState } from './exchange';
import { coverage, coverageInput, COVERAGE_SCENARIOS, discretionaryLiquidityCap } from './coverage';
import { availableToday, dayBudget, weekSummary } from './summary';
import { ledger } from './ledger';
import { withPlan } from './plan';

export function migrationProjection(state: ExchangeState, date: string) {
  return withPlan(state.plan, () => {
    const led = ledger({ ...state, now: date, checkups: state.checkups ?? [], reserveLog: state.reserveLog ?? [], bridge: state.bridge ?? null });
    const expenses = budgetExpenses(state.expenses, state.accountBook ?? EMPTY_BOOK);
    const input = coverageInput(state, led);
    const week = weekSummary(expenses, state.debts, state.weeklyOverrides, date);
    const day = dayBudget(expenses, state.debts, state.weeklyOverrides, date);
    return {
      cash: [led.card, led.reserve, led.totalCash, led.lifeAvailable, led.heldOnCard].map(amount => amount == null ? null : cents(amount)),
      debt: Object.fromEntries(Object.entries(led.debtBalances).map(([id, row]) => [id, cents(row.estimated)])),
      week: { limit: cents(week.limit), spent: cents(week.spent), left: cents(week.left) },
      today: [cents(day.day), cents(availableToday(day, led.lifeAvailable, discretionaryLiquidityCap(input, date)))],
      reviews: led.reconciliation,
      scenarios: COVERAGE_SCENARIOS.map(scenario => {
        const forecast = coverage(input, date, scenario);
        return { until: forecast.to, min: cents(Math.min(forecast.start, forecast.min?.balance ?? forecast.start)),
          shortage: forecast.shortage, accountRisk: forecast.accountRisk };
      }),
    };
  });
}

/** Изолированная репетиция переноса. Не выполняет запись в хранилище. */
export function dryRunFinanceMigration<T extends ExchangeState>(source: T, date: string, candidate?: T) {
  const snapshot = structuredClone(source);
  const book = snapshot.accountBook ?? EMPTY_BOOK;
  const state = { ...(candidate ?? snapshot), accountBook: candidate?.accountBook ?? canonicalBook(book, snapshot.expenses) };
  const existing = new Set(state.accountBook.operations.map(row => row.id));
  const duplicateIds = state.accountBook.operations.length - existing.size;
  const lostOperations = book.operations.filter(row => !existing.has(row.id)).length;
  const unbalanced = state.accountBook.operations.filter(row => postings(row).reduce((sum, leg) => sum + leg.amount, 0) !== 0).length;
  const before = migrationProjection(snapshot, date);
  const after = migrationProjection(state, date);
  const sameMoney = JSON.stringify(before) === JSON.stringify(after);
  return { state, before, after, sameMoney, duplicateIds, lostOperations, unbalanced,
    expenses: state.expenses.length, operations: state.accountBook.operations.length,
    debts: state.debts.length, snapshots: state.checkups?.length ?? 0, reviews: after.reviews.length,
    canCommit: sameMoney && !duplicateIds && !lostOperations && !unbalanced };
}

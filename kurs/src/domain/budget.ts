import { cashAccount, LIFE_ACCOUNT, RESERVE_ACCOUNT, weeklyExpenseCents } from './accounts';
import { addDays } from './dates';
import type { CategoryId, Expense } from './types';

/** Суммы бюджетной проекции в копейках. Счёт и категория группируют уже рассчитанную бюджетную часть. */
export function budgetTotals(expenses: Expense[]) {
  let spent = 0, credit = 0, reserve = 0, lifeAccount = 0;
  const byCategory: Partial<Record<CategoryId, number>> = {};
  for (const expense of expenses) {
    const amount = weeklyExpenseCents(expense);
    const account = cashAccount(expense);
    spent += amount;
    if (expense.source === 'credit') credit += amount;
    if (account === RESERVE_ACCOUNT) reserve += amount;
    if (account === LIFE_ACCOUNT) lifeAccount += amount;
    byCategory[expense.category] = (byCategory[expense.category] ?? 0) + amount;
  }
  return { spent, credit, reserve, life: spent - credit - reserve, lifeAccount, byCategory };
}

export function budgetWeek(expenses: Expense[], monday: string) {
  const sunday = addDays(monday, 6);
  const list = expenses.filter(expense => expense.date >= monday && expense.date <= sunday);
  return { sunday, list, ...budgetTotals(list) };
}

/** Округление вниз до десятков рублей. Вход и результат в копейках. */
export const roundDailyGuide = (remaining: number, days: number) =>
  Math.max(0, Math.floor(remaining / (days * 1000)) * 1000);

// Итог недели: сколько потрачено из лимита, по категориям, и сколько долить на карту жизни из резерва в воскресенье.
// Остаток недели остаётся на карте и уменьшает пополнение: долить = лимит следующей недели − остаток.
import { addDays, fromKey, weekStart } from './dates';
import { CATEGORIES, weeklyLimit } from './plan';
import { countsWeekly } from './summary';
import type { CategoryId, Debt, Expense, WeekClosure, WeeklyOverride } from './types';

/** Какую неделю закрывать: в выходные — текущую, в пн–вт — прошлую (если ещё не закрыта), иначе текущую */
export function weekToClose(now: string, closures: Record<string, WeekClosure>): string {
  const dow = fromKey(now).getDay(); // 0 — вс
  const cur = weekStart(now);
  const prev = addDays(cur, -7);
  if ((dow === 1 || dow === 2) && !closures[prev]) return prev;
  return cur;
}

export interface WeekReport {
  monday: string;
  sunday: string;
  limit: number;
  spent: number;
  left: number;
  byCategory: { id: CategoryId; spent: number }[];
  count: number;
  /** траты с кредиток за неделю — нарушения */
  credit: number;
  /** лимит следующей недели */
  nextLimit: number;
  /** сколько осталось на карте жизни (перерасход — 0: его покрыли другими деньгами) */
  leftover: number;
  /** сколько долить из резерва в воскресенье */
  topUp: number;
}

export function weekReport(expenses: Expense[], debts: Debt[], overrides: WeeklyOverride[], monday: string): WeekReport {
  const sunday = addDays(monday, 6);
  const list = expenses.filter(e => e.date >= monday && e.date <= sunday);
  const counted = list.filter(countsWeekly);
  const spent = counted.reduce((s, e) => s + e.amount, 0);
  const limit = weeklyLimit(debts, monday, overrides);
  const nextLimit = weeklyLimit(debts, addDays(monday, 7), overrides);
  const leftover = Math.max(0, limit - spent);
  return {
    monday, sunday, limit, spent, left: limit - spent, count: list.length, nextLimit, leftover, topUp: Math.max(0, nextLimit - leftover),
    credit: list.filter(e => e.source === 'credit').reduce((s, e) => s + e.amount, 0),
    byCategory: CATEGORIES.map(c => ({ id: c.id, spent: counted.filter(e => e.category === c.id).reduce((s, e) => s + e.amount, 0) }))
      .filter(r => r.spent > 0).sort((a, b) => b.spent - a.spent),
  };
}

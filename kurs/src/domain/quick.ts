// Быстрые траты на «Сегодня»: то, что человек записывает чаще всего, — одной кнопкой. И «как вчера»: вчерашний
// набор трат одним касанием (метро туда-обратно, обед).
import { addDays } from './dates';
import type { CategoryId, Expense } from './types';

export interface QuickSpend { key: string; category: CategoryId; note?: string; amount: number; count: number }

/** Частые траты за 35 дней: одинаковые категория, название и сумма не меньше двух раз; не больше max, частые — первыми */
export function quickSpends(expenses: Expense[], now: string, max = 4): QuickSpend[] {
  const from = addDays(now, -35);
  const map = new Map<string, QuickSpend & { last: string }>();
  for (const e of expenses) {
    if (e.date < from || e.date > now || e.source === 'reserve') continue;
    const key = `${e.category}|${(e.note ?? '').trim().toLowerCase()}|${e.amount}`;
    const q = map.get(key);
    if (q) { q.count++; if (e.date > q.last) q.last = e.date; }
    else map.set(key, { key, category: e.category, note: e.note?.trim() || undefined, amount: e.amount, count: 1, last: e.date });
  }
  return [...map.values()].filter(q => q.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, max).map(({ last: _last, ...q }) => q);
}

/** Вчерашние траты недельных денег — чтобы повторить их сегодня; пусто, если вчера ничего или слишком много */
export function yesterdaySet(expenses: Expense[], now: string): Expense[] {
  const y = addDays(now, -1);
  const list = expenses.filter(e => e.date === y && e.source !== 'reserve');
  return list.length > 0 && list.length <= 6 ? list : [];
}

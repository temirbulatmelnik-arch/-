import { eventsBetween, type CalendarInput } from './calendar';
import { addDays, daysBetween } from './dates';
import type { CalEvent, Expense } from './types';

export const paymentRouteKey = (e: CalEvent) => e.debtId ?? (e.key.startsWith('fix:') ? e.key.slice(0, e.key.lastIndexOf(':')) : e.key);

export function AccountablePayments(cal: CalendarInput, now: string) {
  const routes = new Map<string, CalEvent>();
  for (const event of eventsBetween(cal, addDays(now, -7), addDays(now, 45))) {
    if (event.kind !== 'payment' || event.projection || cal.marks?.[event.key]?.done || event.amount <= 0) continue;
    const key = paymentRouteKey(event);
    if (!routes.has(key)) routes.set(key, event);
  }
  return [...routes.values()].sort((a, b) => Number(!!a.accountId) - Number(!!b.accountId) || a.date.localeCompare(b.date));
}

function subscriptionKey(text: string) {
  return text.toLowerCase().normalize('NFKC').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');
}

export function possibleSubscriptionDuplicate(event: CalEvent, expenses: Expense[]): Expense | undefined {
  if (!event.key.startsWith('fix:') || event.kind !== 'payment') return;
  const name = subscriptionKey(event.title.split(/[,·]/)[0]);
  return expenses.filter(e => e.note && daysBetween(e.date, event.date) >= 0 && daysBetween(e.date, event.date) <= 20 &&
    name.length >= 3 && subscriptionKey(e.note).includes(name)).sort((a, b) => b.date.localeCompare(a.date))[0];
}

// Сводки для экранов: неделя, месяц по категориям, что требует внимания сегодня.
import { addDays, daysBetween, ddmm, monthKey, weekStart } from './dates';
import { eventsBetween, urgency, type CalendarInput } from './calendar';
import { baselineOf, BIG_PURCHASE_HOURS, CATEGORIES, categoryLimit, currentPhase, weeklyLimit } from './plan';
import { checklistDue } from './planUpdate';
import type { CalEvent, CategoryId, ChecklistItem, Debt, EventMark, Expense, WeeklyOverride, WishItem } from './types';

/** Трата идёт из недельного лимита: с карты жизни и не фиксированный платёж */
export const countsWeekly = (e: Expense) => e.source !== 'reserve' && e.category !== 'fixed';

export interface WeekSummary {
  monday: string;
  sunday: string;
  limit: number;
  spent: number;
  left: number;
  /** дней до конца недели, включая сегодня */
  daysLeft: number;
  /** можно тратить в день до понедельника */
  perDay: number;
  /** доля дней недели, которая уже прошла */
  timeShare: number;
  expenses: Expense[];
}

export function weekSummary(expenses: Expense[], debts: Debt[], overrides: WeeklyOverride[], now: string): WeekSummary {
  const monday = weekStart(now), sunday = addDays(monday, 6);
  const list = expenses.filter(e => e.date >= monday && e.date <= sunday);
  const spent = list.filter(countsWeekly).reduce((s, e) => s + e.amount, 0);
  const limit = weeklyLimit(debts, now, overrides);
  const left = limit - spent;
  const daysLeft = daysBetween(now, sunday) + 1;
  return {
    monday, sunday, limit, spent, left, daysLeft,
    perDay: Math.max(0, Math.floor(left / daysLeft / 10) * 10),
    timeShare: (7 - daysLeft) / 7,
    expenses: list,
  };
}

export interface DayBudget {
  /** можно потратить сегодня: остаток недели на утро, делённый на дни до воскресенья */
  day: number;
  spentToday: number;
  /** осталось на сегодня; меньше нуля — перерасход */
  left: number;
  /** лимит на день с завтра; в воскресенье — на новой неделе */
  tomorrow: number;
  /** сегодня воскресенье: «завтра» — уже новая неделя со своим лимитом */
  nextWeek: boolean;
  /** недельный лимит кончился ещё до сегодняшнего дня */
  exhausted: boolean;
}

const floor10 = (n: number) => Math.max(0, Math.floor(n / 10) * 10);

/** Кольцо дня: сколько можно потратить сегодня и каким станет лимит на день после сегодняшних трат */
export function dayBudget(expenses: Expense[], debts: Debt[], overrides: WeeklyOverride[], now: string): DayBudget {
  const monday = weekStart(now), sunday = addDays(monday, 6);
  const counted = expenses.filter(e => e.date >= monday && e.date <= now && countsWeekly(e));
  const before = counted.filter(e => e.date < now).reduce((s, e) => s + e.amount, 0);
  const spentToday = counted.filter(e => e.date === now).reduce((s, e) => s + e.amount, 0);
  const morning = weeklyLimit(debts, now, overrides) - before;
  const daysLeft = daysBetween(now, sunday) + 1;
  const day = morning > 0 ? floor10(morning / daysLeft) : 0;
  const nextWeek = daysLeft === 1;
  const tomorrow = nextWeek
    ? floor10(weeklyLimit(debts, addDays(sunday, 1), overrides) / 7)
    : floor10((morning - spentToday) / (daysLeft - 1));
  return { day, spentToday, left: day - spentToday, tomorrow, nextWeek, exhausted: morning <= 0 };
}

export interface CategoryRow {
  id: CategoryId;
  spent: number;
  limit: number;
  baseline: number;
}

export function monthByCategory(expenses: Expense[], debts: Debt[], month: string): CategoryRow[] {
  const phase = currentPhase(debts, `${month}-15`);
  return CATEGORIES.map(c => ({
    id: c.id,
    spent: expenses.filter(e => monthKey(e.date) === month && e.category === c.id && e.source !== 'reserve').reduce((s, e) => s + e.amount, 0),
    limit: categoryLimit(c.id, phase),
    baseline: baselineOf(c.id),
  }));
}

export interface Alert {
  id: string;
  tone: 'danger' | 'warn' | 'info' | 'good';
  title: string;
  text?: string;
  event?: CalEvent;
  action?: 'pay' | 'income' | 'weekly' | 'wish' | 'backup' | 'calendar' | 'check';
}

export function alerts(opts: {
  cal: CalendarInput; marks: Record<string, EventMark>; expenses: Expense[]; wishes: WishItem[];
  now: string; nowMs: number; lastBackupAt?: string; lastIcsAt?: string;
  checklist?: ChecklistItem[]; checks?: Record<string, { done: boolean }>;
}): Alert[] {
  const out: Alert[] = [];
  const events = eventsBetween(opts.cal, addDays(opts.now, -45), addDays(opts.now, 3));
  for (const e of events) {
    const u = urgency(e, opts.marks[e.key], opts.now);
    if (e.kind === 'payment' && (u === 'overdue' || u === 'soon')) {
      out.push({
        id: e.key, tone: u === 'overdue' ? 'danger' : 'warn', event: e, action: 'pay',
        title: u === 'overdue' ? `Не отмечен платёж: ${e.title}` : `${e.title}`,
        text: u === 'overdue' ? 'Если уже оплатили — отметьте. Если нет — оплатите сегодня: просрочка недопустима.' : undefined,
      });
    }
    if (e.kind === 'income' && e.date <= opts.now && e.date >= addDays(opts.now, -10) && !opts.marks[e.key]?.done && (e.incomeKind === 'bonusQuarter' || e.incomeKind === 'bonusYear' || e.incomeKind === 'vacation' || e.incomeKind === 'thirteenth')) {
      out.push({ id: e.key, tone: 'good', event: e, action: 'income', title: `Ожидается: ${e.title}`, text: 'Пришла? В тот же день распределите: резерв по формуле, остальное — досрочно в долг.' });
    }
  }
  const credit = opts.expenses.filter(e => e.source === 'credit' && daysBetween(e.date, opts.now) <= 30);
  if (credit.length) {
    out.push({ id: 'credit', tone: 'danger', title: `Траты с кредитки за 30 дней: ${credit.length}`, text: 'Кредитки только гасим. Каждая трата с них отодвигает свободу и стоит 40–60% годовых.' });
  }
  for (const w of opts.wishes.filter(w => !w.resolved)) {
    if (opts.nowMs - Date.parse(w.createdAt) >= BIG_PURCHASE_HOURS * 3600_000) {
      out.push({ id: `wish:${w.id}`, tone: 'info', action: 'wish', title: `48 часов прошло: «${w.title}»`, text: 'Всё ещё нужно? Купить можно только из недельного лимита.' });
    }
  }
  for (const c of opts.checklist ?? []) {
    if (opts.checks?.[c.id]?.done ?? c.done) continue;
    const due = checklistDue(c, opts.now);
    if (due === 'overdue' || due === 'soon') out.push({ id: `check:${c.id}`, tone: due === 'overdue' ? 'warn' : 'info', action: 'check', title: c.title, text: c.due ? `Срок — ${c.due.length === 7 ? c.due : ddmm(c.due)}${c.note ? `. ${c.note}` : ''}` : c.note });
  }
  if (!opts.lastBackupAt || daysBetween(opts.lastBackupAt.slice(0, 10), opts.now) >= 14) {
    out.push({ id: 'backup', tone: 'info', action: 'backup', title: opts.lastBackupAt ? 'Пора сохранить резервную копию' : 'Сохраните резервную копию', text: 'Данные живут только на этом телефоне. Копия — файл в «Файлах» или iCloud.' });
  }
  if (!opts.lastIcsAt) {
    out.push({ id: 'ics', tone: 'info', action: 'calendar', title: 'Включите напоминания о платежах', text: 'Один файл — и календарь iPhone сам напомнит за 3 дня, за день и в день платежа.' });
  }
  const order = { danger: 0, warn: 1, good: 2, info: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

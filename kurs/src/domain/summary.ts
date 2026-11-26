import { budgetTotals, budgetWeek, roundDailyGuide } from './budget';
// Сводки для экранов: неделя, месяц по категориям, что требует внимания сегодня.
import { cents, rubles } from './accounts';
import { bridgeWeek, onBridgeCard, type Bridge } from './bridge';
import { addDays, daysBetween, ddmm, monthKey, weekStart } from './dates';
import { actionableEvent, eventsBetween, urgency, type CalendarInput } from './calendar';
import { baselineOf, BIG_PURCHASE_HOURS, CATEGORIES, categoryLimit, currentPhase, weeklyLimit } from './plan';
import { checklistDue } from './planUpdate';
import type { CalEvent, CategoryId, ChecklistItem, Debt, EventMark, Expense, WeeklyOverride, WishItem } from './types';

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
  const monday = weekStart(now);
  const { sunday, list, spent: spentCents } = budgetWeek(expenses, monday);
  const spent = rubles(spentCents);
  const limit = weeklyLimit(debts, now, overrides);
  const left = rubles(cents(limit) - spentCents);
  const daysLeft = daysBetween(now, sunday) + 1;
  return {
    monday, sunday, limit, spent, left, daysLeft,
    perDay: rubles(roundDailyGuide(cents(limit) - spentCents, daysLeft)),
    timeShare: (7 - daysLeft) / 7,
    expenses: list,
  };
}

export interface DayBudget {
  /** можно потратить сегодня: остаток недели на утро, делённый на дни до воскресенья */
  day: number;
  spentToday: number;
  /** норма дня минус траты сегодня; меньше нуля — сверх нормы. Для экрана — canSpend и mode */
  left: number;
  /** лимит на день с завтра; в воскресенье — на новой неделе */
  tomorrow: number;
  /** сегодня воскресенье: «завтра» — уже новая неделя со своим лимитом */
  nextWeek: boolean;
  /** недельный лимит кончился ещё до сегодняшнего дня */
  exhausted: boolean;
  /** остаток недели на утро и сколько дней до воскресенья, включая сегодня — из них считается day */
  morning: number;
  daysLeft: number;
  /** итог недели после сегодняшних трат в рамках лимита; меньше нуля — перерасход недели */
  weekLeft: number;
  /** сколько ещё можно сегодня — число в кольце; меньше нуля не бывает: второго «минуса» рядом с итогом недели нет */
  canSpend: number;
  /** ok — в пределах нормы дня; day — сегодня сверх нормы, но неделя в плюсе; week — лимит недели исчерпан */
  mode: 'ok' | 'day' | 'week';
  /** на сколько сегодня сверх нормы дня (mode = day) */
  overDay: number;
  /** сегодняшние траты по источникам: с карты жизни и с кредитки */
  spentLife: number;
  spentCredit: number;
  spentReserve: number;
}

/** Кольцо дня: сколько можно потратить сегодня и каким станет лимит на день после сегодняшних трат */
export function dayBudget(expenses: Expense[], debts: Debt[], overrides: WeeklyOverride[], now: string): DayBudget {
  const monday = weekStart(now);
  const { list, sunday } = budgetWeek(expenses, monday);
  const before = budgetTotals(list.filter(e => e.date < now)).spent;
  const totals = budgetTotals(list.filter(e => e.date === now));
  const spentToday = rubles(totals.spent);
  const morningCents = cents(weeklyLimit(debts, now, overrides)) - before;
  const morning = rubles(morningCents);
  const daysLeft = daysBetween(now, sunday) + 1;
  const day = rubles(roundDailyGuide(morningCents, daysLeft));
  const nextWeek = daysLeft === 1;
  const tomorrow = nextWeek
    ? rubles(roundDailyGuide(cents(weeklyLimit(debts, addDays(sunday, 1), overrides)), 7))
    : rubles(roundDailyGuide(morningCents - totals.spent, daysLeft - 1));
  // день — часть недели: если неделя ушла в минус, дневная норма теряет смысл — сегодня можно 0, а не «минус сверх нормы»
  const weekLeft = rubles(morningCents - totals.spent);
  const remaining = rubles(cents(day) - totals.spent);
  const mode = weekLeft < 0 || morning <= 0 ? 'week' : spentToday > day ? 'day' : 'ok';
  return {
    day, spentToday, left: remaining, tomorrow, nextWeek, exhausted: morning <= 0, morning, daysLeft,
    weekLeft, mode, canSpend: mode === 'ok' ? remaining : 0, overDay: mode === 'day' ? -remaining : 0,
    spentLife: rubles(totals.life), spentCredit: rubles(totals.credit), spentReserve: rubles(totals.reserve),
  };
}

/** Каноническое объяснение доступной суммы. Денежные входы и результат в копейках. */
export function explainDailySpending(day: DayBudget, lifeAvailable: number | null, liquidityCap: number | null = null) {
  const inputs = {
    guide: cents(day.day), spent: cents(day.spentToday), weekRemaining: cents(day.weekLeft),
    lifeAvailable: lifeAvailable == null ? null : cents(lifeAvailable), liquidityCap: liquidityCap == null ? null : cents(liquidityCap), daysRemaining: day.daysLeft,
  };
  return {
    value: Math.max(0, Math.min(inputs.guide - inputs.spent, inputs.weekRemaining, inputs.lifeAvailable ?? 0, inputs.liquidityCap ?? Infinity)),
    formula: 'max(0, min(guide - spent, weekRemaining, lifeAvailable, liquidityCap))',
    inputs, sources: ['weeklyBudget', 'lifeAccountProjection'] as const,
  };
}

export function availableToday(day: DayBudget, lifeAvailable: number | null, liquidityCap: number | null = null) {
  return rubles(explainDailySpending(day, lifeAvailable, liquidityCap).value);
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
  bridge?: Bridge | null;
  cal: CalendarInput; marks: Record<string, EventMark>; expenses: Expense[]; wishes: WishItem[];
  now: string; nowMs: number; lastBackupAt?: string; lastIcsAt?: string;
  checklist?: ChecklistItem[]; checks?: Record<string, { done: boolean }>;
}): Alert[] {
  const out: Alert[] = [];
  const events = eventsBetween(opts.cal, addDays(opts.now, -45), addDays(opts.now, 3));
  for (const e of events) {
    if (!actionableEvent(e)) continue;
    const u = urgency(e, opts.marks[e.key], opts.now);
    if (e.kind === 'payment' && (u === 'overdue' || u === 'soon')) {
      out.push({
        id: e.key, tone: u === 'overdue' ? 'danger' : 'warn', event: e, action: 'pay',
        title: u === 'overdue' ? `Не отмечен платёж: ${e.title}` : `${e.title}`,
        text: u === 'overdue' ? 'Если уже оплатили — отметьте. Если нет — оплатите сегодня: просрочка недопустима.' : undefined,
      });
    }
    if (e.kind === 'income' && e.date <= opts.now && e.date >= addDays(opts.now, -10) && !opts.marks[e.key]?.done && (e.incomeKind === 'bonusQuarter' || e.incomeKind === 'bonusYear' || e.incomeKind === 'vacation' || e.incomeKind === 'thirteenth')) {
      out.push({ id: e.key, tone: 'good', event: e, action: 'income', title: `Ожидается: ${e.title}`, text: 'Проверьте зачисление в банке. После прихода сверяйте обязательные платежи, резерв и безопасную сумму досрочки.' });
    }
  }
  // траты моста на кредитке — по плану, не нарушение
  const credit = opts.expenses.filter(e => e.source === 'credit' && daysBetween(e.date, opts.now) <= 30 && !(opts.bridge && bridgeWeek(opts.bridge, weekStart(e.date)) && onBridgeCard(e, opts.bridge)));
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
    if (c.afterReceiptKey) {
      if (opts.marks[c.afterReceiptKey]?.done) out.push({ id: `check:${c.id}`, tone: 'info', action: 'check', title: c.title, text: c.note });
      continue;
    }
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

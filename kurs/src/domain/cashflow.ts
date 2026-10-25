// Прогноз денег на зарплатной карте по дням: баланс из выписки + поступления − платежи − недельные лимиты.
// Показывает, где будет тонкое место (минимум) и не уходит ли баланс в минус до следующего поступления.
import { addDays } from './dates';
import { eventsBetween, type CalendarInput } from './calendar';
import type { CalEvent, CardBalance, EventMark } from './types';

export interface FlowPoint {
  event: CalEvent;
  delta: number;
  /** баланс после события */
  balance: number;
  /** платёж просрочен и ещё не оплачен — учтён в начале */
  overdue?: boolean;
}

export interface CashFlow {
  start: CardBalance;
  points: FlowPoint[];
  /** самая низкая точка */
  min: FlowPoint | null;
  /** баланс на конец дня для каждой даты, где были события */
  byDay: Record<string, number>;
}

const amountOf = (e: CalEvent, mark?: EventMark) => mark?.done && mark.amount != null ? mark.amount : e.amount;

export function cashFlow(cal: CalendarInput, marks: Record<string, EventMark>, start: CardBalance, until: string): CashFlow {
  // всё, что до даты баланса включительно, уже отражено в нём — кроме неоплаченных платежей: их ещё платить
  const overdue = eventsBetween(cal, addDays(start.date, -45), start.date).filter(e => e.kind === 'payment' && !marks[e.key]?.done);
  const ahead = eventsBetween(cal, addDays(start.date, 1), until);
  let balance = start.amount;
  const points: FlowPoint[] = [];
  const byDay: Record<string, number> = {};
  for (const e of overdue) {
    balance -= amountOf(e, marks[e.key]);
    points.push({ event: e, delta: -amountOf(e, marks[e.key]), balance, overdue: true });
  }
  for (const e of ahead) {
    const sign = e.kind === 'income' ? 1 : -1;
    // пополнение карты жизни отмечено — деньги уже ушли из резерва (его остаток уменьшен), с карты не вычитаем
    const delta = e.kind === 'weekly' && marks[e.key]?.done ? 0 : sign * amountOf(e, marks[e.key]);
    balance += delta;
    points.push({ event: e, delta, balance });
    byDay[e.date] = balance;
  }
  const min = points.reduce<FlowPoint | null>((m, p) => (!m || p.balance < m.balance ? p : m), null);
  return { start, points, min, byDay };
}

/** Ниже этого запаса (карта + резерв) день в календаре считается «мелким»: вода оранжевая */
export const LOW_WATER = 30_000;

/**
 * Деньги на карте и в резерве на конец каждого дня [from, to] от известного остатка карты (anchor).
 * Вперёд — по прогнозу (неоплаченные прошлые платежи вычитаются сразу); назад — восстановлено по календарю:
 * накануне было столько же, сколько в этот день, минус то, что в этот день пришло, плюс то, что ушло.
 */
export function dailyLevels(cal: CalendarInput, marks: Record<string, EventMark>, anchor: CardBalance, reserve: number, from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  const flow = cashFlow(cal, marks, anchor, to > anchor.date ? to : anchor.date);
  let balance = flow.points.filter(p => p.overdue).reduce((b, p) => b + p.delta, anchor.amount);
  for (let d = anchor.date; d <= to; d = addDays(d, 1)) {
    if (flow.byDay[d] != null) balance = flow.byDay[d];
    if (d >= from) out[d] = balance + reserve;
  }
  if (from < anchor.date) {
    const delta: Record<string, number> = {};
    for (const e of eventsBetween(cal, from, anchor.date)) {
      const a = amountOf(e, marks[e.key]);
      delta[e.date] = (delta[e.date] ?? 0) + (e.kind === 'income' ? a : -a);
    }
    let b = anchor.amount;
    for (let d = anchor.date; d > from;) {
      b -= delta[d] ?? 0;
      d = addDays(d, -1);
      if (d <= to) out[d] = b + reserve;
    }
  }
  return out;
}

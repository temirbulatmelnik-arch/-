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
    const delta = sign * amountOf(e, marks[e.key]);
    balance += delta;
    points.push({ event: e, delta, balance });
    byDay[e.date] = balance;
  }
  const min = points.reduce<FlowPoint | null>((m, p) => (!m || p.balance < m.balance ? p : m), null);
  return { start, points, min, byDay };
}

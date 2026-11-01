// Мост на кредитке: пока резерву не хватает до премии, часть недельных денег берётся с кредитки (только покупки).
// Недельный лимит не меняется — меняется источник: карта жизни (пополнение из резерва + остаток прошлой недели)
// и кредитка до лимита моста на эту неделю. Сначала тратится карта, кредитка — когда карта пуста.
import { addDays } from './dates';
import { weeklyLimit } from './plan';
import { countsWeekly } from './summary';
import type { Debt, Expense, WeeklyOverride } from './types';

export interface BridgeWeek {
  /** понедельник недели */
  monday: string;
  /** сколько долить на карту из резерва в воскресенье перед этой неделей */
  fromReserve: number;
  /** сколько можно взять с кредитки за неделю, не больше */
  fromCredit: number;
}

export interface Bridge {
  /** id долга-кредитки, на которой мост */
  card: string;
  /** весь мост, не больше */
  cap: number;
  repayBy?: string;
  repayNote?: string;
  weeks: BridgeWeek[];
  closed?: boolean;
}

export const activeBridge = (b: Bridge | null | undefined): Bridge | null => (b && !b.closed && b.weeks.length ? b : null);
export const bridgeWeek = (b: Bridge | null | undefined, monday: string) => activeBridge(b)?.weeks.find(w => w.monday === monday) ?? null;

/** Трата моста: с кредитки моста (без указанной карты — тоже она) */
export const onBridgeCard = (e: Expense, b: Bridge) => e.source === 'credit' && (e.creditCard ?? b.card) === b.card;

export interface WeekMoney {
  monday: string;
  limit: number;
  spentLife: number;
  spentCredit: number;
  /** всё в лимите недели: карта и кредитка */
  spent: number;
  /** итог на неделю: лимит − все траты; меньше нуля — перерасход */
  left: number;
  /** сколько недельных денег на карте жизни по учёту (не сырой баланс мастер-счёта) */
  cardBudget: number;
  cardLeft: number;
  /** сколько можно взять с кредитки на этой неделе; 0 — моста нет */
  creditCap: number;
  creditLeft: number;
}

/** Деньги недели по источникам. Остаток прошлой недели на карте уменьшает траты с кредитки, а не пополнение. */
export function weekMoney(expenses: Expense[], debts: Debt[], overrides: WeeklyOverride[], bridge: Bridge | null | undefined, monday: string): WeekMoney {
  const sunday = addDays(monday, 6);
  const list = expenses.filter(e => e.date >= monday && e.date <= sunday && countsWeekly(e));
  const spentCredit = list.filter(e => e.source === 'credit').reduce((s, e) => s + e.amount, 0);
  const spent = list.reduce((s, e) => s + e.amount, 0);
  const spentLife = spent - spentCredit;
  const limit = weeklyLimit(debts, monday, overrides);
  const plan = bridgeWeek(bridge, monday);
  const carry = plan ? Math.max(0, weekMoney(expenses, debts, overrides, bridge, addDays(monday, -7)).cardLeft) : 0;
  const creditCap = plan ? Math.max(0, Math.min(plan.fromCredit - carry, limit)) : 0;
  const cardBudget = limit - creditCap;
  return {
    monday, limit, spentLife, spentCredit, spent, left: limit - spent,
    cardBudget, cardLeft: cardBudget - spentLife, creditCap, creditLeft: creditCap - spentCredit,
  };
}

export interface BridgeState {
  bridge: Bridge;
  used: number;
  left: number;
  /** траты моста по неделям плана */
  weeks: (BridgeWeek & { used: number })[];
}

/** Сколько моста уже взято: траты с кредитки моста от первой недели плана */
export function bridgeState(expenses: Expense[], bridge: Bridge | null | undefined): BridgeState | null {
  if (!bridge || !bridge.weeks.length) return null;
  const start = [...bridge.weeks].sort((a, b) => a.monday.localeCompare(b.monday))[0].monday;
  const credit = expenses.filter(e => e.date >= start && onBridgeCard(e, bridge));
  const used = credit.reduce((s, e) => s + e.amount, 0);
  return {
    bridge, used, left: bridge.cap - used,
    weeks: bridge.weeks.map(w => ({ ...w, used: credit.filter(e => e.date >= w.monday && e.date <= addDays(w.monday, 6)).reduce((s, e) => s + e.amount, 0) })),
  };
}

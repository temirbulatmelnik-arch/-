// Откуда деньги на трату: свои (карта жизни), в долг (кредитка) или резерв. Одна логика для листа траты, меток в
// списках и раскладки месяца: что предложить и что будет после записи.
import { cashAccount, cents, countsWeekly, LIFE_ACCOUNT, RESERVE_ACCOUNT, rubles } from './accounts';
import { bridgeState, weekMoney, type Bridge } from './bridge';
import { weekStart } from './dates';
import { num } from './money';
import { availableToday, dayBudget } from './summary';
import type { Debt, Expense, Source, WeeklyOverride } from './types';

export const SOURCE_LABEL: Record<Source, string> = { life: 'Свои', credit: 'В долг', reserve: 'Резерв' };
/** порядок на экране: от своего к чужому */
export const SOURCES: Source[] = ['life', 'credit', 'reserve'];

export interface SpendState {
  expenses: Expense[];
  debts: Debt[];
  weeklyOverrides: WeeklyOverride[];
  bridge?: Bridge | null;
}

/** Новый расход по умолчанию использует собственные деньги; кредитка выбирается вручную. */
export const DEFAULT_SPEND_SOURCE: Source = 'life';

export interface SpendEffect {
  text: string;
  /** ok — в пределах; warn — сверх нормы дня или плана моста; neg — сверх лимита недели; loan и rsv — заёмные и резерв */
  tone: 'ok' | 'warn' | 'neg' | 'loan' | 'rsv';
}

const r = (n: number) => `${num(Math.abs(n))} ₽`;

/**
 * Что будет после записи траты — одной строкой под суммой. amount = 0 — что сейчас. skipId — правим эту трату:
 * её прежняя сумма не считается. reserve — резерв по учёту.
 */
export function spendEffect(s: SpendState, x: { amount: number; source: Source; date: string; now: string; reserve: number; lifeAvailable?: number | null; liquidityCap?: number | null; skipId?: string; creditCard?: string; category?: Expense['category']; budgetScope?: Expense['budgetScope']; accountId?: string }): SpendEffect {
  const draft: Expense = { id: '~', date: x.date, amount: x.amount, category: x.category ?? 'fun', budgetScope: x.budgetScope, source: x.source, accountId: x.accountId, creditCard: x.creditCard ?? s.bridge?.card, createdAt: '' };
  if (cashAccount(draft) === RESERVE_ACCOUNT) {
    const budget = countsWeekly(draft) ? 'Трата входит в недельный бюджет' : 'Вне недельного лимита';
    return { text: `Из резерва: останется ${r(x.reserve - x.amount)}. ${budget}`, tone: 'rsv' };
  }
  const base = x.skipId ? s.expenses.filter(e => e.id !== x.skipId) : s.expenses;
  const expenses = x.amount > 0 ? [...base, draft] : base;
  const monday = weekStart(x.date);
  const week = weekMoney(expenses, s.debts, s.weeklyOverrides, s.bridge, monday);
  const thisWeek = monday === weekStart(x.now);

  if (week.left < 0) {
    const text = x.source === 'credit'
      ? `Сверх лимита недели на ${r(week.left)} — это уже новый долг`
      : `Сверх лимита недели на ${r(week.left)}`;
    return { text, tone: 'neg' };
  }
  if (x.source === 'credit') {
    if (x.creditCard && x.creditCard !== s.bridge?.card) return { text: 'Трата увеличит долг по выбранной карте', tone: 'loan' };
    if (week.creditCap <= 0) return { text: 'Кредитки заморожены: это новый долг, запишу как нарушение плана', tone: 'neg' };
    const st = bridgeState(expenses, s.bridge);
    if (week.creditLeft < 0) return { text: `В долг сверх плана моста на неделю на ${r(week.creditLeft)}`, tone: 'warn' };
    return { text: st ? `В долг по мосту: ${x.amount > 0 ? 'станет' : 'взято'} ${r(st.used)} из ${r(st.bridge.cap)}` : `В долг: на неделе ещё ${r(week.creditLeft)}`, tone: 'loan' };
  }
  if (thisWeek && x.date === x.now) {
    const day = dayBudget(expenses, s.debts, s.weeklyOverrides, x.now);
    if (day.mode === 'day') return { text: `Сегодня сверх нормы на ${r(day.overDay)}, на неделю останется ${r(week.left)}`, tone: 'warn' };
    const existing = x.skipId ? s.expenses.find(expense => expense.id === x.skipId && expense.date === x.now && expense.source === 'life') : undefined;
    const cashDelta = cents(x.amount) - cents(existing?.amount ?? 0);
    const cardDelta = (cashAccount(draft) === LIFE_ACCOUNT ? cents(x.amount) : 0) -
      (existing && cashAccount(existing) === LIFE_ACCOUNT ? cents(existing.amount) : 0);
    const remaining = x.lifeAvailable === undefined ? day.canSpend : availableToday(day,
      x.lifeAvailable === null ? null : rubles(Math.max(0, cents(x.lifeAvailable) - cardDelta)),
      x.liquidityCap == null ? null : rubles(Math.max(0, cents(x.liquidityCap) - cashDelta)));
    return { text: `На сегодня ${x.amount > 0 ? 'останется' : 'можно ещё'} ${r(remaining)}`, tone: 'ok' };
  }
  return { text: `На неделю ${x.amount > 0 ? 'останется' : 'осталось'} ${r(week.left)}`, tone: 'ok' };
}

/** Раскладка трат по источнику: свои, в долг, из резерва */
export function bySource(list: Expense[]): Record<Source, number> {
  const out: Record<Source, number> = { life: 0, credit: 0, reserve: 0 };
  for (const e of list) out[e.source] += e.amount;
  return out;
}

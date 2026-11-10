// Откуда деньги на трату: свои (карта жизни), в долг (кредитка) или резерв. Одна логика для листа траты, меток в
// списках и раскладки месяца: что предложить и что будет после записи.
import { bridgeState, weekMoney, type Bridge } from './bridge';
import { weekStart } from './dates';
import { num } from './money';
import { dayBudget } from './summary';
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

/** Что предложить: карта, пока на ней есть недельные деньги; карта пуста, а на неделе есть мост — кредитка моста */
export function suggestSource(s: SpendState, date: string): Source {
  const m = weekMoney(s.expenses, s.debts, s.weeklyOverrides, s.bridge, weekStart(date));
  return m.creditCap > 0 && m.cardLeft <= 0 && m.creditLeft > 0 ? 'credit' : 'life';
}

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
export function spendEffect(s: SpendState, x: { amount: number; source: Source; date: string; now: string; reserve: number; skipId?: string }): SpendEffect {
  const base = x.skipId ? s.expenses.filter(e => e.id !== x.skipId) : s.expenses;
  const expenses: Expense[] = x.amount > 0
    ? [...base, { id: '~', date: x.date, amount: x.amount, category: 'fun', source: x.source, createdAt: '' }]
    : base;
  const monday = weekStart(x.date);
  const week = weekMoney(expenses, s.debts, s.weeklyOverrides, s.bridge, monday);
  const thisWeek = monday === weekStart(x.now);

  if (x.source === 'reserve') {
    return { text: `Из резерва: останется ${r(x.reserve - x.amount)}. В лимит недели не входит`, tone: 'rsv' };
  }
  if (week.left < 0) {
    const text = x.source === 'credit'
      ? `Сверх лимита недели на ${r(week.left)} — это уже новый долг`
      : `Сверх лимита недели на ${r(week.left)}`;
    return { text, tone: 'neg' };
  }
  if (x.source === 'credit') {
    if (week.creditCap <= 0) return { text: 'Кредитки заморожены: это новый долг, запишу как нарушение плана', tone: 'neg' };
    const st = bridgeState(expenses, s.bridge);
    if (week.creditLeft < 0) return { text: `В долг сверх плана моста на неделю на ${r(week.creditLeft)}`, tone: 'warn' };
    return { text: st ? `В долг по мосту: ${x.amount > 0 ? 'станет' : 'взято'} ${r(st.used)} из ${r(st.bridge.cap)}` : `В долг: на неделе ещё ${r(week.creditLeft)}`, tone: 'loan' };
  }
  if (thisWeek && x.date === x.now) {
    const day = dayBudget(expenses, s.debts, s.weeklyOverrides, x.now);
    if (day.mode === 'day') return { text: `Сегодня сверх нормы на ${r(day.overDay)}, на неделю останется ${r(week.left)}`, tone: 'warn' };
    return { text: `На сегодня ${x.amount > 0 ? 'останется' : 'можно ещё'} ${r(day.canSpend)}`, tone: 'ok' };
  }
  return { text: `На неделю ${x.amount > 0 ? 'останется' : 'осталось'} ${r(week.left)}`, tone: 'ok' };
}

/** Раскладка трат по источнику: свои, в долг, из резерва */
export function bySource(list: Expense[]): Record<Source, number> {
  const out: Record<Source, number> = { life: 0, credit: 0, reserve: 0 };
  for (const e of list) out[e.source] += e.amount;
  return out;
}

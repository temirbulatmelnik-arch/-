// Этапы плана, недельный лимит, лимиты категорий, целевой долг и распределение премии.
import { addMonths, monthKey, monthsBetween, weekStart } from './dates';
import type { CategoryId, Debt, Phase, WeeklyOverride } from './types';

// Цифры плана (этапы, лимиты категорий, особые месяцы) приходят из зашифрованного плана пользователя
// (PlanSeed.plan). В открытом коде — только нейтральные значения для старта с нуля.
export interface PlanConfig {
  phases: Phase[];
  /** лимит категории в месяц на первом этапе и как было до плана */
  categories: Record<CategoryId, { limit: number; baseline: number }>;
  /** особая нехватка зарплаты по месяцам YYYY-MM */
  shortfallOverrides?: Record<string, number>;
  /** месяцы крупных премий (1–12) */
  bonusMonths?: number[];
  /** свои шаблоны продавцов: категория → подстроки названия */
  merchantRules?: [CategoryId, string[]][];
  /** подсказки для разбора скриншотов: свои банки, счета, продавцы */
  aiHints?: string;
}

const NEUTRAL_PHASE: Phase = { id: 1, title: 'План', monthly: 50_000, weekly: 10_000, shortfall: 0, closes: [], premiums: 'Сверх резерва — в самый дорогой долг', from: '2000-01', to: '2099-12' };

export const DEFAULT_PLAN: PlanConfig = {
  phases: [NEUTRAL_PHASE],
  categories: {
    groceries: { limit: 15_000, baseline: 0 }, work: { limit: 6_000, baseline: 0 }, taxi: { limit: 2_000, baseline: 0 },
    transport: { limit: 4_000, baseline: 0 }, health: { limit: 4_000, baseline: 0 }, shopping: { limit: 4_000, baseline: 0 },
    beauty: { limit: 2_000, baseline: 0 }, tobacco: { limit: 1_500, baseline: 0 }, fun: { limit: 6_000, baseline: 0 }, fixed: { limit: 5_000, baseline: 0 },
  },
  bonusMonths: [3, 6, 9, 12],
};

let source: () => PlanConfig | null | undefined = () => null;
/** Хранилище сообщает, откуда брать цифры плана */
export const setPlanSource = (fn: () => PlanConfig | null | undefined) => { source = fn; };
export const planConfig = (): PlanConfig => source() ?? DEFAULT_PLAN;
const phases = () => planConfig().phases;
const firstPhase = () => phases().find(p => p.id >= 1) ?? phases()[0];

/** Без долгов: лимит не нужен, но показываем последний этап */
const freePhase = (): Phase => ({ ...phases()[phases().length - 1], title: 'Без долгов', shortfall: 0, closes: [], premiums: 'Подушка и цели', from: '2099-12', to: '2099-12' });

export const FIXED_MONTHLY = 6_400;
export const RESERVE_BUFFER = 20_000;
export const BIG_PURCHASE = 5_000;
export const BIG_PURCHASE_HOURS = 48;

export interface CategoryInfo {
  id: CategoryId;
  name: string;
  short: string;
  emoji: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'groceries', name: 'Продукты', short: 'Продукты', emoji: '🛒' },
  { id: 'work', name: 'Обеды и кофе на работе', short: 'Обеды', emoji: '🥪' },
  { id: 'taxi', name: 'Такси', short: 'Такси', emoji: '🚕' },
  { id: 'transport', name: 'Метро, автобусы, самокаты', short: 'Транспорт', emoji: '🚇' },
  { id: 'health', name: 'Аптеки и медицина', short: 'Здоровье', emoji: '💊' },
  { id: 'shopping', name: 'Одежда, маркетплейсы, быт', short: 'Покупки', emoji: '🛍️' },
  { id: 'beauty', name: 'Красота, уход, оптика', short: 'Уход', emoji: '💈' },
  { id: 'tobacco', name: 'Табак и алкоголь', short: 'Табак', emoji: '🚬' },
  { id: 'fun', name: 'Кафе, доставка, досуг, подарки, прочее', short: 'Кафе и досуг', emoji: '☕' },
  { id: 'fixed', name: 'Связь, спортзал, подписки', short: 'Фикс', emoji: '📱' },
];

export const CATEGORY = Object.fromEntries(CATEGORIES.map(c => [c.id, c])) as Record<CategoryId, CategoryInfo>;

const openDebts = (debts: Debt[]) => debts.filter(d => !d.closed && d.balance > 0.5);

/** Текущий этап: самый ранний этап, у которого остались открытые долги. Долг закрыт — лимиты растут сами. */
export function currentPhase(debts: Debt[], date: string): Phase {
  const open = openDebts(debts).filter(d => d.phase != null);
  if (!open.length) return debts.some(d => d.phase != null) ? freePhase() : phaseByDate(date);
  const id = Math.min(...open.map(d => d.phase!));
  return phases().find(p => p.id === Math.max(1, id)) ?? firstPhase();
}

/** Этап по календарю плана — для сравнения «идём по плану или отстаём» */
export function phaseByDate(date: string): Phase {
  const m = monthKey(date);
  const list = phases();
  return list.find(p => m >= p.from && m <= p.to) ?? (m < list[0].from ? list[0] : freePhase());
}

/** Недельный лимит на неделю, в которую входит дата */
export function weeklyLimit(debts: Debt[], date: string, overrides: WeeklyOverride[]): number {
  const monday = weekStart(date);
  const o = overrides.find(x => monday >= x.from && monday <= x.to);
  if (o) return o.amount;
  return currentPhase(debts, date).weekly;
}

export const baselineOf = (id: CategoryId) => planConfig().categories[id]?.baseline ?? 0;

/** Лимит категории в месяц на текущем этапе: лимиты первого этапа растут пропорционально бюджету этапа */
export function categoryLimit(id: CategoryId, phase: Phase): number {
  const limit = planConfig().categories[id]?.limit ?? 0;
  if (id === 'fixed') return limit;
  const first = firstPhase().monthly;
  const base = first - FIXED_MONTHLY;
  const cur = (phase.monthly || first) - FIXED_MONTHLY;
  return base > 0 ? Math.round((limit * cur) / base / 100) * 100 : limit;
}

/** Нехватка зарплаты в месяце, которую закрывает резерв (особые месяцы — из плана) */
export function shortfallFor(month: string, debts: Debt[]): number {
  const o = planConfig().shortfallOverrides?.[month];
  if (o != null) return o;
  const ph = currentPhase(debts, `${month}-15`);
  return ph.id === 0 ? firstPhase().shortfall : ph.shortfall;
}

/** Месяцы крупных премий (квартальные, годовая, отпускные) */
export function nextBonusMonth(month: string, bonusMonths = planConfig().bonusMonths ?? [3, 6, 9, 12]): string {
  for (let i = 1; i <= 12; i++) {
    const m = addMonths(month, i);
    if (bonusMonths.includes(Number(m.slice(5, 7)))) return m;
  }
  return addMonths(month, 3);
}

/** Целевой долг: самый дорогой из открытых, по порядку плана. Рассрочку по графику досрочно не гасим. */
export function targetDebt(debts: Debt[]): Debt | undefined {
  return openDebts(debts).filter(d => !d.noPrepay).sort((a, b) => a.order - b.order)[0];
}

export interface BonusSplit {
  /** сколько оставить в резерве */
  keep: number;
  /** месяцы между этой и следующей премией, которые закрывает резерв */
  months: string[];
  /** куда и сколько отправить досрочно */
  allocations: { debt: Debt; amount: number; closes: boolean }[];
  /** резерв после распределения */
  reserveAfter: number;
  /** что не поместилось в долги (все закрыты) */
  leftover: number;
}

/**
 * Правило премии: в день прихода оставить в резерве 20 000 + нехватку за месяцы до следующей премии,
 * всё остальное — досрочно в текущий целевой долг (и дальше по порядку, если он закрылся).
 */
export function splitBonus(opts: { amount: number; reserve: number; date: string; debts: Debt[]; monthsOverride?: number }): BonusSplit {
  const month = monthKey(opts.date);
  const next = nextBonusMonth(month);
  const count = opts.monthsOverride ?? Math.max(0, monthsBetween(month, next) - 1);
  const months = Array.from({ length: count }, (_, i) => addMonths(month, i + 1));
  const keep = RESERVE_BUFFER + months.reduce((s, m) => s + shortfallFor(m, opts.debts), 0);
  let free = Math.max(0, opts.reserve + opts.amount - keep);
  const allocations: BonusSplit['allocations'] = [];
  const queue = openDebts(opts.debts).filter(d => !d.noPrepay).sort((a, b) => a.order - b.order);
  for (const debt of queue) {
    if (free <= 0) break;
    const amount = Math.min(free, Math.ceil(debt.balance));
    allocations.push({ debt, amount, closes: amount >= debt.balance - 0.5 });
    free -= amount;
  }
  const sent = allocations.reduce((s, a) => s + a.amount, 0);
  return { keep, months, allocations, reserveAfter: opts.reserve + opts.amount - sent, leftover: free };
}

export const totalDebt = (debts: Debt[]) => openDebts(debts).reduce((s, d) => s + d.balance, 0);
export const monthlyInterest = (debts: Debt[]) => openDebts(debts).reduce((s, d) => s + (d.balance * d.rate) / 12, 0);
export { openDebts };

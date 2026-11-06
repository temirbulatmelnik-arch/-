// Учёт по счетам банка: сколько должно быть на карте жизни (мастер-счёт), в резерве (накопительный) и долга на
// кредитке моста — от последней сверки. В воскресенье вечером человек вводит, что видит в банке, приложение сравнивает
// и считает, сколько перевести между картой и резервом.
import { activeBridge, bridgeWeek, weekMoney, type Bridge } from './bridge';
import { addDays, daysBetween, today } from './dates';
import { weeklyLimit } from './plan';
import type { CalEvent, CardBalance, Debt, EventMark, Expense, ReserveMove, WeeklyOverride } from './types';

/** разница в пределах рубля — сошлось */
export const MATCH = 1;

const BONUS = new Set(['bonusQuarter', 'bonusYear', 'vacation', 'thirteenth']);

export interface Checkup {
  id: string;
  /** когда сверено (ISO) и за какой день */
  at: string;
  date: string;
  /** закрываемая неделя */
  monday: string;
  /** что ждало приложение; null — не с чем сравнить (первая сверка) */
  expected: { card: number | null; reserve: number; credit: number | null };
  /** что было в банке до перевода */
  actual: { card: number; reserve: number; credit: number | null };
  /** из резерва на карту на следующую неделю */
  topUp: number;
  /** с карты в резерв: поступления, пришедшие на карту */
  toReserve: number;
  /** остатки после перевода — точка отсчёта следующей сверки */
  after: { card: number; reserve: number };
  creditCard?: string;
  /** остальные кредитки, кроме кредитки моста: долг по учёту и в банке; после сверки остаток долга берётся из банка */
  cards?: { id: string; expected: number | null; actual: number }[];
}

export interface LedgerInput {
  checkups: Checkup[];
  cardBalance: CardBalance | null;
  reserve: number;
  reserveLog: ReserveMove[];
  marks: Record<string, EventMark>;
  expenses: Expense[];
  oneOff: CalEvent[];
  debts: Debt[];
  bridge: Bridge | null;
  /** на какой день считать (по умолчанию — сегодня): проценты по кредиткам набегают по дням */
  now?: string;
}

/** кредитка в сверке: expected — долг по учёту с процентами на сегодня, accrued — из них проценты с последнего
 *  обновления остатка */
export interface CardLedger { debt: Debt; expected: number; accrued: number; bridge: boolean }

/**
 * Проценты по кредитке, набежавшие с последнего обновления остатка до дня until — по дням, как считает банк.
 * Остаток кредитки вносят из банка «всей задолженностью», то есть уже с процентами на тот день: поэтому проценты
 * считаются от дня обновления, а не за целый месяц (иначе часть месяца посчиталась бы дважды).
 */
export function accruedOnCard(d: Debt, until: string): number {
  if (d.kind !== 'card' || d.rule.type === 'schedule' || !d.updatedAt || d.balance <= 0) return 0;
  const days = Math.max(0, Math.min(62, daysBetween(d.updatedAt.slice(0, 10), until)));
  return Math.round(((d.balance * d.rate * days) / 365) * 100) / 100;
}

export interface Ledger {
  /** ожидаемый остаток карты; null — нет точки отсчёта */
  card: number | null;
  cardFrom: { at: string; date: string } | null;
  /** ожидаемый резерв: резерв приложения минус то, что оплачено из него после последнего остатка из банка */
  reserve: number;
  /** ожидаемый долг на кредитке моста */
  credit: number | null;
  creditCard: Debt | null;
  /** все кредитки для сверки: первой — кредитка моста, затем открытые по порядку закрытия.
   *  expected — долг по учёту: остаток, проценты по дням с его обновления и покупки с этой карты после него */
  cards: CardLedger[];
  /** обычные поступления, пришедшие на карту после сверки и ещё не переведённые в резерв */
  incomeOnCard: number;
  /** из долга на кредитке моста — проценты по дням с последнего обновления остатка (сверки): банк начисляет их каждый
   *  день, поэтому credit больше, чем «сверка + траты с кредитки» */
  creditInterest: number;
}

const endOfDay = (date: string) => `${date}T23:59:59.999`;

/** трата после точки: позже дня отсчёта; в сам день — только внесённая руками после сверки */
const after = (e: Expense, at: string, date: string) => e.date > date || (e.date === date && e.origin === 'manual' && e.createdAt > at);

/** резерв, введённый из банка целиком (сверка, чат, премия), а не сдвинутый на сумму */
export const isAbsolute = (m: ReserveMove) => m.abs ?? /^Сверка/.test(m.note);

/** последний момент, когда резерв пришёл из банка целиком */
export function reserveAnchor(log: ReserveMove[]): { at: string; date: string } | null {
  for (let i = log.length - 1; i >= 0; i--) if (isAbsolute(log[i])) return { at: log[i].at ?? endOfDay(log[i].date), date: log[i].date };
  return null;
}

type MarkKind = 'weekly' | 'payment' | 'income' | 'bonus' | null;

/** что за отметка: пополнение, платёж, обычное поступление (приходит на карту) или премия (распределяется сразу) */
function kindOf(key: string, oneOff: CalEvent[]): MarkKind {
  if (key.startsWith('wk:')) return 'weekly';
  if (key.startsWith('pay:') || key.startsWith('fix:')) return 'payment';
  if (key.startsWith('inc:')) return BONUS.has(key.split(':')[1]) ? 'bonus' : 'income';
  const e = oneOff.find(o => o.key === key);
  if (!e) return null;
  if (e.kind === 'income') return e.incomeKind && BONUS.has(e.incomeKind) ? 'bonus' : 'income';
  return e.kind;
}

export function ledger(s: LedgerInput): Ledger {
  const last = s.checkups.at(-1);
  // точка отсчёта карты: последняя сверка или остаток карты из выписки/вручную — что позже
  const cb = s.cardBalance ? { at: s.cardBalance.at ?? endOfDay(s.cardBalance.date), date: s.cardBalance.date, amount: s.cardBalance.amount } : null;
  const lc = last ? { at: last.at, date: last.date, amount: last.after.card } : null;
  const ref = cb && (!lc || cb.at > lc.at) ? cb : lc;

  let card: number | null = null;
  let incomeOnCard = 0;
  if (ref) {
    card = ref.amount;
    for (const [key, m] of Object.entries(s.marks)) {
      if (!m.done || m.at <= ref.at) continue;
      const amount = m.amount ?? 0;
      const kind = kindOf(key, s.oneOff);
      if (kind === 'weekly') card += amount;
      else if (kind === 'payment' && m.paidFrom === 'card') card -= amount;
      else if (kind === 'income') { card += amount; incomeOnCard += amount; }
    }
    for (const e of s.expenses) if (e.source === 'life' && after(e, ref.at, ref.date)) card -= e.amount;
    for (const r of s.reserveLog) if (r.card && r.at && r.at > ref.at) { card += r.card; if (r.card < 0) incomeOnCard += r.card; }
  }

  // резерв: отметки «оплачено из резерва» и траты из резерва после последнего остатка из банка
  const anchor = [reserveAnchor(s.reserveLog), last ? { at: last.at, date: last.date } : null].filter(Boolean).sort((a, b) => b!.at.localeCompare(a!.at))[0] ?? null;
  let reserve = s.reserve;
  if (anchor) {
    for (const [key, m] of Object.entries(s.marks)) {
      if (m.done && m.at > anchor.at && kindOf(key, s.oneOff) === 'payment' && (m.paidFrom ?? 'reserve') === 'reserve') reserve -= m.amount ?? 0;
    }
    for (const e of s.expenses) if (e.source === 'reserve' && after(e, anchor.at, anchor.date)) reserve -= e.amount;
  }

  // кредитки: остаток долга плюс покупки с карты после его последнего обновления
  // (трата с кредитки без указанной карты — с кредитки моста)
  const b = s.bridge && s.bridge.weeks.length ? s.bridge : null;
  const now = s.now ?? today();
  const owed = (d: Debt) => {
    const at = d.updatedAt ?? '';
    const date = at.slice(0, 10);
    let x = d.balance + accruedOnCard(d, now);
    if (at) for (const e of s.expenses) if (e.source === 'credit' && (e.creditCard ?? b?.card) === d.id && (e.date > date || (e.date === date && e.createdAt > at))) x += e.amount;
    return Math.round(x * 100) / 100;
  };
  const creditCard = b ? s.debts.find(d => d.id === b.card) ?? null : null;
  const credit = creditCard ? owed(creditCard) : null;
  const cards = s.debts
    .filter(d => d.id === creditCard?.id || (d.kind === 'card' && !d.closed))
    .sort((x, y) => Number(y.id === creditCard?.id) - Number(x.id === creditCard?.id) || x.order - y.order)
    .map(d => ({ debt: d, expected: owed(d), accrued: accruedOnCard(d, now), bridge: d.id === creditCard?.id }));

  return {
    card, cardFrom: ref ? { at: ref.at, date: ref.date } : null, reserve, credit, creditCard, cards,
    incomeOnCard: Math.max(0, Math.round(incomeOnCard * 100) / 100), creditInterest: creditCard ? accruedOnCard(creditCard, now) : 0,
  };
}

/**
 * Остаток карты по учёту на вечер дня date — до воскресного пополнения следующей недели (для итогов прошедших недель).
 * Точка отсчёта — сверка (после перевода) или остаток из банка: ближайшая не позже date — считаем вперёд, иначе
 * ближайшая после — назад от неё. null — точек отсчёта нет.
 */
export function cardOn(s: LedgerInput, date: string): number | null {
  const end = endOfDay(date);
  const topUp = `wk:${addDays(date, 1)}`;
  const refs = [
    ...s.checkups.map(c => ({ at: c.at, date: c.date, amount: c.after.card })),
    ...(s.cardBalance ? [{ at: s.cardBalance.at ?? endOfDay(s.cardBalance.date), date: s.cardBalance.date, amount: s.cardBalance.amount }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const before = refs.filter(r => r.at <= end).at(-1);
  const ref = before ?? refs.find(r => r.at > end);
  if (!ref) return null;
  const fwd = ref === before;
  // движение карты от отметки: пополнение и поступление — плюс, платёж с карты — минус; пополнение к следующей неделе
  // считается после вечера date, даже если отмечено в тот же вечер
  const markMove = (key: string, m: EventMark) => {
    const kind = kindOf(key, s.oneOff), amount = m.amount ?? 0;
    return kind === 'weekly' || kind === 'income' ? amount : kind === 'payment' && m.paidFrom === 'card' ? -amount : 0;
  };
  const inRange = (t: string, key = '') => {
    const late = key === topUp ? '\uffff' : t;
    return fwd ? t > ref.at && late <= end : late > end && t <= ref.at;
  };
  let delta = 0;
  for (const [key, m] of Object.entries(s.marks)) if (m.done && inRange(m.at, key)) delta += markMove(key, m);
  for (const r of s.reserveLog) if (r.card && r.at && inRange(r.at)) delta += r.card;
  for (const e of s.expenses) {
    if (e.source !== 'life') continue;
    const afterRef = after(e, ref.at, ref.date);
    if (fwd ? afterRef && e.date <= date : !afterRef && e.date > date) delta -= e.amount;
  }
  return Math.round((fwd ? ref.amount + delta : ref.amount - delta) * 100) / 100;
}

export interface CheckupPlan {
  /** остаток недели на карте по учёту (не по банку) */
  leftover: number;
  /** лимит следующей недели */
  nextLimit: number;
  /** из резерва на карту */
  topUp: number;
  /** с кредитки моста на следующую неделю, до */
  credit: number;
  /** пополнение уже отмечено раньше — повторно не списывать */
  toppedBefore: number;
  /** с карты в резерв */
  toReserve: number;
  /** итог: + из резерва на карту, − с карты в резерв */
  net: number;
}

/**
 * Перевод в воскресенье. Без моста: пополнение = лимит следующей недели − остаток недели на карте.
 * С мостом: пополнение = план моста на следующую неделю, остаток уменьшает траты с кредитки.
 * Обычные поступления, которые пришли на карту, — в резерв. Всё по учёту, не по сырому остатку карты.
 */
export function checkupPlan(o: {
  expenses: Expense[]; debts: Debt[]; overrides: WeeklyOverride[]; bridge: Bridge | null; marks: Record<string, EventMark>;
  monday: string; leftover: number; incomeOnCard: number;
}): CheckupPlan {
  const nextMonday = addDays(o.monday, 7);
  const nextLimit = weeklyLimit(o.debts, nextMonday, o.overrides);
  const bw = bridgeWeek(o.bridge, nextMonday);
  const leftover = Math.max(0, Math.round(o.leftover * 100) / 100);
  const plain = bw ? bw.fromReserve : Math.max(0, nextLimit - leftover);
  const mark = o.marks[`wk:${nextMonday}`];
  const toppedBefore = mark?.done ? mark.amount ?? 0 : 0;
  const topUp = toppedBefore ? 0 : Math.round(plain);
  const credit = bw ? Math.max(0, bw.fromCredit - leftover) : 0;
  const toReserve = Math.round(o.incomeOnCard);
  return { leftover, nextLimit, topUp, credit, toppedBefore, toReserve, net: topUp - toReserve };
}

/** остаток недели на карте по учёту: в неделю моста — карта отдельно от кредитки */
export function weekLeftover(expenses: Expense[], debts: Debt[], overrides: WeeklyOverride[], bridge: Bridge | null, monday: string): number {
  const m = weekMoney(expenses, debts, overrides, activeBridge(bridge), monday);
  return bridgeWeek(bridge, monday) ? m.cardLeft : m.left;
}

/** резерв уже пришёл из банка в день пополнения или позже — пополнение в нём уже есть, второй раз не вычитать */
export const freshReserve = (log: ReserveMove[], topUpDate: string) => (reserveAnchor(log)?.date ?? '') >= topUpDate;

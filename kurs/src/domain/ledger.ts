// Учёт по счетам банка: сколько должно быть на карте жизни (мастер-счёт), в резерве (накопительный) и долга на
// кредитке моста — от последней сверки. В воскресенье вечером человек вводит, что видит в банке, приложение сравнивает
// и считает, сколько перевести между картой и резервом.
import { accountMovement, accountProjection, cashAccount, debtProjection, EMPTY_BOOK, LIFE_ACCOUNT, recordedAfter, RESERVE_ACCOUNT, rubles, type AccountBook, type BankBalance } from './accounts';
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
  operationIds?: string[];
  creditCard?: string;
  /** остальные кредитки, кроме кредитки моста: долг по учёту и в банке; после сверки остаток долга берётся из банка */
  cards?: { id: string; expected: number | null; actual: number }[];
}

export interface LedgerInput {
  checkups: Checkup[];
  accountBook?: AccountBook;
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
  /** обычные поступления, пришедшие на карту после сверки и ещё не переведённые в резерв; платёж, под который
   *  переводили деньги из резерва, тратит сначала перевод, потом их */
  incomeOnCard: number;
  /** переведено из резерва на карту под платежи, которые ещё не отмечены: деньги на карте, но всё ещё часть резерва */
  heldOnCard: number;
  /** из долга на кредитке моста — проценты по дням с последнего обновления остатка (сверки): банк начисляет их каждый
   *  день, поэтому credit больше, чем «сверка + траты с кредитки» */
  creditInterest: number;
  cashAccounts: ReturnType<typeof accountProjection>;
  reserveVerified: boolean;
  debtBalances: Record<string, ReturnType<typeof debtProjection>>;
  unclassifiedCredit: Expense[];
}

const endOfDay = (date: string) => `${date}T23:59:59.999`;

/** трата после точки: позже дня отсчёта; в сам день — только внесённая руками после сверки */
const after = (e: Expense, at: string, date: string) => e.date > date || (e.date === date && e.origin === 'manual' && e.createdAt > at);

type CardRef = { at: string; date: string; amount: number; dateOnly?: boolean; includedExpenseIds?: string[]; operationIds?: string[] };

const fromBalance = (b: CardBalance): CardRef => ({ ...b, at: b.at ?? endOfDay(b.date), dateOnly: !b.at });
const fromCheckup = (c: Checkup): CardRef => ({ at: c.at, date: c.date, amount: c.after.card, operationIds: c.operationIds });
const time = (at: string) => Date.parse(at);

function afterCard(e: Expense, ref: CardRef, included: Set<string>): boolean {
  if (included.has(e.id) || e.date < ref.date) return false;
  if (e.date > ref.date) return true;
  if (ref.dateOnly) return false;
  const elapsed = time(e.createdAt) - time(ref.at);
  return elapsed > 0 || (elapsed === 0 && ref.includedExpenseIds !== undefined);
}

/** резерв, введённый из банка целиком (сверка, чат, премия), а не сдвинутый на сумму */
export const isAbsolute = (m: ReserveMove) => m.abs ?? /^Сверка/.test(m.note);

/** последний момент, когда резерв пришёл из банка целиком */
export function reserveAnchor(log: ReserveMove[]): { at: string; date: string; operationIds?: string[] } | null {
  for (let i = log.length - 1; i >= 0; i--) if (isAbsolute(log[i])) return { at: log[i].at ?? endOfDay(log[i].date), date: log[i].date, operationIds: log[i].operationIds };
  return null;
}

type MarkKind = 'weekly' | 'payment' | 'income' | 'bonus' | null;

/** что за отметка: пополнение, платёж, обычное поступление (приходит на карту) или премия (распределяется сразу) */
function kindOf(key: string, oneOff: CalEvent[]): MarkKind {
  if (key.startsWith('wk:')) return 'weekly';
  if (key.startsWith('pay:') || key.startsWith('fix:')) return 'payment';
  if (key.startsWith('work:')) return 'bonus';
  if (key.startsWith('inc:')) return BONUS.has(key.split(':')[1]) ? 'bonus' : 'income';
  const e = oneOff.find(o => o.key === key);
  if (!e) return null;
  if (e.kind === 'income') return e.incomeKind && BONUS.has(e.incomeKind) ? 'bonus' : 'income';
  return e.kind;
}

/** платежи перевода, которые ещё не отмечены */
const openKeys = (r: ReserveMove, marks: Record<string, EventMark>) => (r.forKeys ?? []).filter(k => !marks[k]?.done);

/** Платежи, деньги под которые уже на карте (перевод из резерва сделан или не понадобился) и ещё не списаны */
export function heldKeys(log: ReserveMove[], marks: Record<string, EventMark>): Set<string> {
  const out = new Set<string>();
  for (const r of log) for (const k of openKeys(r, marks)) out.add(k);
  return out;
}

export interface TransferPlan {
  events: CalEvent[];
  keys: string[];
  /** сумма платежей */
  total: number;
  /** сколько из неё покрывают поступления, уже лежащие на карте */
  onCard: number;
  /** сколько перевести из резерва */
  amount: number;
  when: 'today' | 'tomorrow' | 'both';
}

/**
 * Перевод из резерва на карту под обязательные платежи: накануне вечером (с 18:00) и в день платежа. Платежи списываются
 * с карты, поэтому деньги переводят заранее — и резерв в приложении сразу совпадает с банком. Поступления, которые уже
 * лежат на карте, идут в счёт платежа первыми. null — переводить не под что: платежей нет, они отмечены или деньги
 * под них уже на карте.
 */
export function transferPlan(o: { events: CalEvent[]; marks: Record<string, EventMark>; log: ReserveMove[]; incomeOnCard: number; now: string; hour: number }): TransferPlan | null {
  const held = heldKeys(o.log, o.marks);
  const tomorrow = addDays(o.now, 1);
  const events = o.events.filter(e => e.kind === 'payment' && !e.projection && !o.marks[e.key]?.done && !held.has(e.key) && (e.date === o.now || (e.date === tomorrow && o.hour >= 18)));
  if (!events.length) return null;
  const total = Math.round(events.reduce((t, e) => t + e.amount, 0) * 100) / 100;
  const onCard = Math.min(total, Math.max(0, o.incomeOnCard));
  const days = new Set(events.map(e => e.date));
  return {
    events, keys: events.map(e => e.key), total, onCard, amount: Math.round((total - onCard) * 100) / 100,
    when: days.size > 1 ? 'both' : days.has(o.now) ? 'today' : 'tomorrow',
  };
}

export function ledger(s: LedgerInput): Ledger {
  const now = s.now ?? today();
  const book = s.accountBook ?? EMPTY_BOOK;
  const operations = book.operations.filter(op => op.status === 'confirmed' && op.date <= now);
  const linked = new Set(operations.flatMap(op => op.eventKey ? [op.eventKey] : []));
  const last = s.checkups.at(-1);
  // точка отсчёта карты: последняя сверка или остаток карты из выписки/вручную — что позже
  const cb = s.cardBalance ? fromBalance(s.cardBalance) : null;
  const lc = last ? fromCheckup(last) : null;
  const ref = cb && (!lc || time(cb.at) >= time(lc.at)) ? cb : lc;

  let card: number | null = null;
  // pool — деньги резерва, которые лежат на карте: поступления и переводы под платежи минус сами эти платежи и то,
  // что уже перевели в резерв. Из них held — под ещё не отмеченные платежи, остальное ждёт перевода в резерв.
  // Платёж с карты без перевода под него (мелочь из недельных денег) в этот счёт не входит — как и раньше
  let pool = 0;
  const earmarked = new Set(s.reserveLog.flatMap(r => r.forKeys ?? []));
  if (ref) {
    card = ref.amount;
    for (const [key, m] of Object.entries(s.marks)) {
      if (!m.done || linked.has(key) || !(time(m.at) > time(ref.at))) continue;
      const amount = m.amount ?? 0;
      const kind = kindOf(key, s.oneOff);
      if (kind === 'weekly') card += amount;
      else if (kind === 'payment' && m.paidFrom === 'card') { card -= amount; if (earmarked.has(key)) pool -= amount; }
      else if (kind === 'income') { card += amount; pool += amount; }
    }
    const included = new Set(ref.includedExpenseIds);
    for (const e of s.expenses) if (cashAccount(e) === LIFE_ACCOUNT && afterCard(e, ref, included)) card -= e.amount;
    const bankRef: BankBalance = { amount: ref.amount, date: ref.date, at: ref.dateOnly ? undefined : ref.at, includedIds: ref.operationIds };
    for (const op of operations) {
      if (!recordedAfter(op, bankRef)) continue;
      const amount = rubles(accountMovement(op, LIFE_ACCOUNT));
      card += amount;
      if (op.fundingSource !== 'borrowed' && (op.type === 'income' || (op.type === 'transfer' && op.toAccountId === RESERVE_ACCOUNT))) pool += amount;
      if (op.eventKey && earmarked.has(op.eventKey) && (op.type === 'debt_payment' || op.type === 'expense')) pool += amount;
    }
    for (const r of s.reserveLog) if (r.card && r.at && time(r.at) > time(ref.at)) { card += r.card; if (r.card < 0 || r.forKeys) pool += r.card; }
  }
  let held = 0;
  for (const r of s.reserveLog) {
    if (!r.card || r.card <= 0 || !openKeys(r, s.marks).length) continue;
    held += r.card;
    // перевод сделан до точки отсчёта (сверка прошла между переводом и платежом): в остатке карты он уже есть
    if (!ref || !r.at || time(r.at) <= time(ref.at)) pool += r.card;
  }
  pool = Math.max(0, Math.round(pool * 100) / 100);
  held = Math.min(Math.round(held * 100) / 100, pool);

  // резерв: отметки «оплачено из резерва» и траты из резерва после последнего остатка из банка
  const anchor = [reserveAnchor(s.reserveLog), last ? { at: last.at, date: last.date, operationIds: last.operationIds } : null].filter(Boolean).sort((a, b) => b!.at.localeCompare(a!.at))[0] ?? null;
  let reserve = s.reserve;
  if (anchor) {
    for (const [key, m] of Object.entries(s.marks)) {
      if (m.done && !linked.has(key) && m.at > anchor.at && kindOf(key, s.oneOff) === 'payment' && (m.paidFrom ?? 'reserve') === 'reserve') reserve -= m.amount ?? 0;
    }
    for (const e of s.expenses) if (cashAccount(e) === RESERVE_ACCOUNT && after(e, anchor.at, anchor.date)) reserve -= e.amount;
  }

  for (const op of operations) {
    if (!anchor || recordedAfter(op, { ...anchor, amount: s.reserve, includedIds: anchor.operationIds })) {
      reserve += rubles(accountMovement(op, RESERVE_ACCOUNT));
    }
  }

  // Кредитки: прогноз долга от банковской точки отсчёта и классифицированных операций.
  const b = s.bridge && s.bridge.weeks.length ? s.bridge : null;
  const debtBalances = Object.fromEntries(s.debts.map(d => [d.id, debtProjection(d, s.expenses, book, now, accruedOnCard(d, now))]));
  const owed = (d: Debt) => debtBalances[d.id].estimated;
  const creditCard = b ? s.debts.find(d => d.id === b.card) ?? null : null;
  const credit = creditCard ? owed(creditCard) : null;
  const cards = s.debts
    .filter(d => d.id === creditCard?.id || (d.kind === 'card' && !d.closed))
    .sort((x, y) => Number(y.id === creditCard?.id) - Number(x.id === creditCard?.id) || x.order - y.order)
    .map(d => ({ debt: d, expected: owed(d), accrued: accruedOnCard(d, now), bridge: d.id === creditCard?.id }));

  return {
    cashAccounts: accountProjection(book, s.expenses, now), reserveVerified: !!anchor, debtBalances,
    unclassifiedCredit: s.expenses.filter(e => e.source === 'credit' && !s.debts.some(d => d.kind === 'card' && d.id === e.creditCard)),
    card, cardFrom: ref ? { at: ref.at, date: ref.date } : null, reserve, credit, creditCard, cards,
    incomeOnCard: Math.round((pool - held) * 100) / 100, heldOnCard: held, creditInterest: creditCard ? accruedOnCard(creditCard, now) : 0,
  };
}

/**
 * Остаток карты по учёту на вечер дня date — до воскресного пополнения следующей недели (для итогов прошедших недель).
 * Точка отсчёта — сверка (после перевода) или остаток из банка: ближайшая не позже date — считаем вперёд, иначе
 * ближайшая после — назад от неё. null — точек отсчёта нет.
 */
export function cardOn(s: LedgerInput, date: string): number | null {
  const end = time(endOfDay(date));
  const topUp = `wk:${addDays(date, 1)}`;
  const refs = [
    ...s.checkups.map(fromCheckup),
    ...(s.cardBalance ? [fromBalance(s.cardBalance)] : []),
  ].sort((a, b) => time(a.at) - time(b.at));
  const before = refs.filter(r => time(r.at) <= end).at(-1);
  const ref = before ?? refs.find(r => time(r.at) > end);
  if (!ref) return null;
  const fwd = ref === before;
  // движение карты от отметки: пополнение и поступление — плюс, платёж с карты — минус; пополнение к следующей неделе
  // считается после вечера date, даже если отмечено в тот же вечер
  const markMove = (key: string, m: EventMark) => {
    const kind = kindOf(key, s.oneOff), amount = m.amount ?? 0;
    return kind === 'weekly' || kind === 'income' ? amount : kind === 'payment' && m.paidFrom === 'card' ? -amount : 0;
  };
  const inRange = (t: string, key = '') => {
    const at = time(t);
    const late = key === topUp ? Infinity : at;
    return fwd ? at > time(ref.at) && late <= end : late > end && at <= time(ref.at);
  };
  let delta = 0;
  const ops = (s.accountBook ?? EMPTY_BOOK).operations.filter(op => op.status === 'confirmed');
  const linked = new Set(ops.flatMap(op => op.eventKey ? [op.eventKey] : []));
  for (const [key, m] of Object.entries(s.marks)) if (m.done && !linked.has(key) && inRange(m.at, key)) delta += markMove(key, m);
  for (const r of s.reserveLog) if (r.card && r.at && inRange(r.at)) delta += r.card;
  const included = new Set(ref.includedExpenseIds);
  for (const e of s.expenses) {
    if (cashAccount(e) !== LIFE_ACCOUNT) continue;
    const afterRef = afterCard(e, ref, included);
    if (fwd ? afterRef && e.date <= date : !afterRef && e.date > date) delta -= e.amount;
  }
  for (const op of ops) {
    const afterRef = recordedAfter(op, { amount: ref.amount, date: ref.date, at: ref.dateOnly ? undefined : ref.at, includedIds: ref.operationIds });
    if (fwd ? afterRef && op.date <= date : !afterRef && op.date > date) delta += rubles(accountMovement(op, LIFE_ACCOUNT));
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

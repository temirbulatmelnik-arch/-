// Учёт по счетам банка: сколько должно быть на карте жизни (мастер-счёт), в резерве (накопительный) и долга на
// кредитке моста — от последней сверки. В воскресенье вечером человек вводит, что видит в банке, приложение сравнивает
// и считает, сколько перевести между картой и резервом.
import { accountMovement, accountProjection, cents, kopecks, debtProjection, EMPTY_BOOK, LIFE_ACCOUNT, recordedAfter, RESERVE_ACCOUNT, rubles, type AccountBook, type AccountOperation } from './accounts';
import { activeBridge, bridgeWeek, weekMoney, type Bridge } from './bridge';
import { addDays, daysBetween, today } from './dates';
import { earmarks, partialPayments, type HeldPayment } from './funds';
import { eventsBetween, type CalendarInput } from './calendar';
import { weeklyLimit } from './plan';
import { financialJournal, journalAccount, journalEntryAfter, journalReview, type JournalAnchor, type JournalReview } from './journal';
import type { CalEvent, CardBalance, Debt, EventMark, Expense, ReserveMove, WeeklyOverride } from './types';

/** разница в пределах рубля — сошлось */
export const MATCH = 1;

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
  unmatchedOnCard?: number;
  creditCard?: string;
  /** остальные кредитки, кроме кредитки моста: долг по учёту и в банке; после сверки остаток долга берётся из банка */
  cards?: { id: string; expected: number | null; actual: number }[];
}

export interface LedgerInput extends Partial<Pick<CalendarInput, 'incomes' | 'fixed' | 'templateFrom' | 'weeklyOverrides' | 'overrides' | 'work'>> {
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
  lifeAvailable: number | null;
  heldForPayments: HeldPayment[];
  pendingSweepToReserve: Record<string, number>;
  unassignedOnCard: number;
  unmatchedOnCard: number;
  allocationShortfall: number;
  /** из долга на кредитке моста — проценты по дням с последнего обновления остатка (сверки): банк начисляет их каждый
   *  день, поэтому credit больше, чем «сверка + траты с кредитки» */
  creditInterest: number;
  cashAccounts: (ReturnType<typeof accountProjection>[number] & { posted?: number | null; issues?: JournalReview[] })[];
  reserveVerified: boolean;
  debtBalances: Record<string, ReturnType<typeof debtProjection>>;
  unclassifiedCredit: Expense[];
  reconciliation: JournalReview[];
  cardPosted: number | null;
  reservePosted: number | null;
}

export function fundingBalanceKnown(led: Pick<Ledger, 'card' | 'reserveVerified' | 'cashAccounts'>, id: string) {
  return id === LIFE_ACCOUNT ? led.card != null : id === RESERVE_ACCOUNT ? led.reserveVerified
    : led.cashAccounts.some(account => account.id === id && account.expected != null);
}

const endOfDay = (date: string) => `${date}T23:59:59.999+03:00`;

type CardRef = JournalAnchor & { at: string; dateOnly?: boolean; unmatchedOnCard?: number };

const fromBalance = (b: CardBalance): CardRef => ({ ...b, at: b.at ?? endOfDay(b.date), dateOnly: !b.at, includedIds: b.operationIds });
const fromCheckup = (c: Checkup): CardRef => ({ at: c.at, date: c.date, amount: c.after.card, includedIds: c.operationIds, unmatchedOnCard: c.unmatchedOnCard });
const time = (at: string) => Date.parse(at);

/** резерв, введённый из банка целиком (сверка, чат, премия), а не сдвинутый на сумму */
export const isAbsolute = (m: ReserveMove) => m.abs ?? /^Сверка/.test(m.note);

/** последний момент, когда резерв пришёл из банка целиком */
export function reserveAnchor(log: ReserveMove[]): { at: string; date: string; operationIds?: string[]; kind?: 'available' | 'posted' } | null {
  for (let i = log.length - 1; i >= 0; i--) if (isAbsolute(log[i])) return { at: log[i].at ?? endOfDay(log[i].date), date: log[i].date, operationIds: log[i].operationIds, ...(log[i].kind ? { kind: log[i].kind } : {}) };
  return null;
}

export function canVoidOperation(s: LedgerInput, op: AccountOperation, now: string): boolean {
  if (op.status === 'confirmed' && 'authorization' in op && op.authorization) return true;
  if (op.cashBooked || op.origin === 'bank') return false;
  const last = s.checkups.at(-1);
  const accounts = op.type === 'transfer' ? [op.accountId, op.toAccountId] : [op.accountId];
  if (op.type !== 'allocation' && accounts.some(account => {
    const points = account === LIFE_ACCOUNT ? [s.cardBalance, last]
      : account === RESERVE_ACCOUNT ? [reserveAnchor(s.reserveLog), last]
        : [];
    const refs = points.map(ref => ref && { amount: 0, date: ref.date, at: ref.at, includedIds: ref.operationIds });
    const anchor = s.accountBook?.accounts.find(item => item.id === account)?.balance;
    return [...refs, anchor].some(ref => ref && !recordedAfter(op, ref));
  })) return false;
  if (op.type === 'debt_payment' && (op.debtBooked || s.debts.some(d => d.id === op.debtId && d.bankBalance &&
      !recordedAfter(op, d.bankBalance)))) return false;
  if (op.partialFor && s.marks[op.partialFor]?.done) return false;
  const book = s.accountBook ?? EMPTY_BOOK;
  const index = book.operations.findIndex(row => row.id === op.id);
  if ((op.type === 'allocation' || op.type === 'transfer' && op.purpose === 'prepare') && op.shares?.some(share =>
    s.marks[share.key]?.done || partialPayments(book.operations).has(share.key) ||
    book.operations.slice(index + 1).some(later => later.status === 'confirmed' &&
      later.type === 'transfer' && later.shares?.some(row => row.key === share.key)))) return false;
  const before = ledger({ ...s, now });
  const marks = { ...s.marks };
  if (op.eventKey) delete marks[op.eventKey];
  const after = ledger({ ...s, now, marks, accountBook: { ...book, operations: book.operations.filter(row => row.id !== op.id) } });
  return after.reserve >= Math.min(0, before.reserve) && after.allocationShortfall <= before.allocationShortfall &&
    (after.card == null || after.card >= Math.min(0, before.card ?? 0));
}

/** платежи перевода, которые ещё не отмечены */
const openKeys = (r: ReserveMove, marks: Record<string, EventMark>) => (r.forKeys ?? []).filter(k => !marks[k]?.done);

/** Платежи, деньги под которые уже на карте (перевод из резерва сделан или не понадобился) и ещё не списаны */
export function heldKeys(log: ReserveMove[], marks: Record<string, EventMark>): Set<string> {
  const out = new Set<string>();
  for (const r of log) for (const k of openKeys(r, marks)) out.add(k);
  return out;
}

export function ledger(s: LedgerInput): Ledger {
  const now = s.now ?? today();
  const { book, entries } = financialJournal(s);
  const operations = book.operations.filter(op => op.status === 'confirmed' && op.date <= now);
  const last = s.checkups.filter(row => row.date <= now).at(-1);
  const cb = s.cardBalance && s.cardBalance.date <= now ? fromBalance(s.cardBalance) : null;
  const lc = last ? fromCheckup(last) : null;
  const ref = cb && (!lc || time(cb.at) >= time(lc.at)) ? cb : lc;
  const cardAnchor = ref && { ...ref, at: ref.dateOnly ? undefined : ref.at };
  const cardProjection = journalAccount(entries, LIFE_ACCOUNT, cardAnchor, now);
  const card = ref ? cardProjection.expected : null;
  let pool = 0;
  let unclassified = cents(ref?.unmatchedOnCard ?? 0);
  const classified = new Set(book.historicalLoans?.map(loan => loan.eventKey));
  const earmarked = new Set(s.reserveLog.flatMap(r => r.forKeys ?? []));
  if (cardAnchor) for (const op of entries) {
    if (op.status !== 'confirmed' || op.date > now || !journalEntryAfter(op, cardAnchor)) continue;
    const amount = accountMovement(op, LIFE_ACCOUNT);
    if (!amount) continue;
    if (op.type === 'income' && (op.fundingSource === 'borrowed' || (op.eventKey && classified.has(op.eventKey))) ||
        op.type === 'loan_disbursement' || op.type === 'adjustment') unclassified += Math.max(0, amount);
    else if ((op.type === 'income' && !op.pendingSweep) ||
        (op.type === 'transfer' && !op.purpose && op.toAccountId === RESERVE_ACCOUNT) ||
        (op.eventKey && earmarked.has(op.eventKey) && (op.type === 'expense' || op.type === 'debt_payment'))) pool += amount;
    if (op.legacy === 'reserve' && amount > 0 && s.reserveLog.some(r => `reserve:${r.id}` === op.id && r.forKeys)) pool += amount;
  }
  let held = 0;
  for (const r of s.reserveLog) {
    if (r.date > now || !r.card || r.card <= 0 || !openKeys(r, s.marks).length) continue;
    held += cents(r.card);
    // перевод сделан до точки отсчёта (сверка прошла между переводом и платежом): в остатке карты он уже есть
    if (!ref || !r.at || time(r.at) <= time(ref.at)) pool += cents(r.card);
  }
  pool = Math.max(0, pool);
  held = Math.min(held, pool);

  const relevantMoves = s.reserveLog.filter(r => r.date <= now && r.card && r.card > 0 && r.forKeys?.length);
  const legacyEvents = relevantMoves.length && s.fixed && s.incomes && s.templateFrom
    ? eventsBetween({ ...s, incomes: s.incomes, fixed: s.fixed, templateFrom: s.templateFrom, weeklyOverrides: s.weeklyOverrides ?? [] },
      addDays(relevantMoves[0].date, -45), addDays(now, 45)) : s.oneOff;
  const funding = earmarks(operations, relevantMoves, s.marks, now, legacyEvents);
  const heldOnCard = kopecks(funding.held.filter(row => row.accountId === LIFE_ACCOUNT).reduce((sum, row) => sum + row.amount, 0) + funding.legacyUnmapped);
  const legacyIncome = Math.max(0, rubles(pool - held - cents(funding.legacyDraw[LIFE_ACCOUNT] ?? 0)));
  const incomeOnCard = kopecks((funding.pending[LIFE_ACCOUNT] ?? 0) + legacyIncome);
  const pendingSweepToReserve = { ...funding.pending, [LIFE_ACCOUNT]: incomeOnCard };
  const unmatchedOnCard = rubles(unclassified);
  const unassignedOnCard = rubles(unclassified + cents(funding.unassignedLife));
  const unavailable = heldOnCard + incomeOnCard + unassignedOnCard;
  const lifeAvailable = card == null ? null : Math.max(0, kopecks(card - unavailable));
  const allocationShortfall = card == null ? 0 : Math.max(0, kopecks(unavailable - card));

  const point = [reserveAnchor(s.reserveLog.filter(row => row.date <= now)), last].filter(Boolean)
    .sort((a, b) => time(b!.at) - time(a!.at))[0] ?? null;
  const reserveRef = point && { amount: s.reserve, date: point.date, at: point.at, includedIds: point.operationIds, kind: 'kind' in point ? point.kind : undefined, legacyManualOnly: true };
  const reserveProjection = journalAccount(entries, RESERVE_ACCOUNT, reserveRef, now);
  const reserve = reserveProjection.expected + (point ? 0 : s.reserve);
  const cashAccounts = book.accounts.map(account => {
    const balance = account.balance && account.balance.date <= now ? account.balance : null;
    const projection = journalAccount(entries, account.id, balance, now);
    return { ...account, expected: balance ? projection.expected : null, posted: balance ? projection.posted : null, issues: projection.issues };
  });
  const reconciliation = [...journalReview(s, entries, now), ...cardProjection.issues, ...reserveProjection.issues, ...cashAccounts.flatMap(row => row.issues)];

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
    cashAccounts, reserveVerified: !!point, debtBalances, reconciliation,
    cardPosted: ref ? cardProjection.posted : null, reservePosted: point ? reserveProjection.posted : null,
    unclassifiedCredit: s.expenses.filter(e => e.source === 'credit' && !s.debts.some(d => d.kind === 'card' && d.id === e.creditCard)),
    card, cardFrom: ref ? { at: ref.at, date: ref.date } : null, reserve: kopecks(reserve), credit, creditCard, cards,
    incomeOnCard, heldOnCard, lifeAvailable, pendingSweepToReserve, unassignedOnCard, unmatchedOnCard, allocationShortfall,
    heldForPayments: funding.held, creditInterest: creditCard ? accruedOnCard(creditCard, now) : 0,
  };
}

/**
 * Остаток карты по учёту на вечер дня date — до воскресного пополнения следующей недели (для итогов прошедших недель).
 * Точка отсчёта — сверка (после перевода) или остаток из банка: ближайшая не позже date — считаем вперёд, иначе
 * ближайшая после — назад от неё. null — точек отсчёта нет.
 */
export function cardOn(s: LedgerInput, date: string): number | null {
  const topUp = `wk:${addDays(date, 1)}`;
  const refs = [...s.checkups.map(fromCheckup), ...(s.cardBalance ? [fromBalance(s.cardBalance)] : [])]
    .sort((a, b) => time(a.at) - time(b.at));
  const before = refs.filter(r => r.date <= date).at(-1);
  const ref = before ?? refs.find(r => r.date > date);
  if (!ref) return null;
  const anchor = { ...ref, at: ref.dateOnly ? undefined : ref.at };
  const { entries } = financialJournal(s);
  let delta = 0;
  for (const op of entries) {
    const afterRef = journalEntryAfter(op, anchor);
    const throughDay = op.date <= date && op.eventKey !== topUp;
    if (before ? afterRef && throughDay : !afterRef && !throughDay) delta += accountMovement(op, LIFE_ACCOUNT);
  }
  return rubles(cents(ref.amount) + (before ? delta : -delta));
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

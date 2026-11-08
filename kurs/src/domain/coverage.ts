// Покрытие обязательных платежей: хватит ли резерва на кредиты, рассрочку, Сплит, минималки и обязательные платежи.
// Платежи по долгам гасятся только реальными деньгами (резерв и поступления), кредитка никогда не источник платежа.
// Регулировать можно только недельные деньги на жизнь: пополнение карты и мост на кредитке.
import { activeBridge, bridgeState, type Bridge } from './bridge';
import { eventsBetween, type CalendarInput } from './calendar';
import { addDays, daysBetween, ddmm, lastDay, monthKey } from './dates';
import type { Ledger } from './ledger';
import type { CalEvent, Debt, EventMark, Expense } from './types';

/** запас, ниже которого день считается узким местом */
export const NARROW = 3000;
/** горизонт прогноза, не короче */
export const HORIZON_DAYS = 150;

export interface CoverageStep {
  date: string;
  title: string;
  /** с плюсом — поступление, с минусом — платёж или пополнение карты */
  delta: number;
  /** остаток резерва после события */
  balance: number;
  kind: CalEvent['kind'] | 'bridge';
  approx?: boolean;
  key?: string;
}

export interface CoverageMonth {
  month: string;
  payments: number;
  incomes: number;
  /** на жизнь из резерва: пополнения карты */
  life: number;
  net: number;
  min: number;
  minDate: string;
  minTitle: string;
}

export interface Coverage {
  start: number;
  from: string;
  to: string;
  steps: CoverageStep[];
  /** остаток на конец каждого дня */
  byDay: Record<string, number>;
  min: CoverageStep | null;
  /** дни ниже запаса NARROW: последний платёж такого дня */
  narrow: CoverageStep[];
  months: CoverageMonth[];
  /** первая нехватка: день и сколько не хватает в самой глубокой точке после него */
  shortage: { date: string; title: string; amount: number } | null;
}

export interface CoverageInput {
  cal: CalendarInput;
  marks: Record<string, EventMark>;
  reserve: number;
  debts: Debt[];
  expenses: Expense[];
  bridge?: Bridge | null;
}

/**
 * Вход прогноза — один на всё приложение: календарь (остаток дня), «Хватит ли», «самая тонкая точка» и status.coverage
 * в файле для чата. Резерв — по учёту плюс поступления на карте, ждущие перевода в резерв. Недельные деньги считаются
 * потраченными до нуля: из резерва уходит только воскресное пополнение карты (в неделю моста — fromReserve), траты с
 * кредитки моста резерв не уменьшают — они растят долг по кредитке.
 */
export function coverageInput(s: CalendarInput & { marks: Record<string, EventMark>; expenses: Expense[] }, led: Pick<Ledger, 'reserve' | 'incomeOnCard'>): CoverageInput {
  return { cal: s, marks: s.marks, reserve: led.reserve + led.incomeOnCard, debts: s.debts, expenses: s.expenses, bridge: s.bridge ?? null };
}

/** Погашение моста и рост минималок по кредитке моста — как события прогноза */
function bridgeEvents(input: CoverageInput, from: string, to: string): { extra: CoverageStep[]; minUp: Record<string, number> } {
  const b = activeBridge(input.bridge);
  if (!b) return { extra: [], minUp: {} };
  const card = input.debts.find(d => d.id === b.card);
  const rate = card?.rate ?? 0.4;
  const weeks = [...b.weeks].sort((x, y) => x.monday.localeCompare(y.monday));
  const used = bridgeState(input.expenses, b)?.used ?? 0;
  // худший случай: весь план моста будет взят
  const planned = Math.min(b.cap, Math.max(used, weeks.reduce((s, w) => s + w.fromCredit, 0)));
  const takenBy = (d: string) => Math.min(planned, weeks.filter(w => w.monday <= d).reduce((s, w) => s + w.fromCredit, 0));
  const extra: CoverageStep[] = [];
  if (b.repayBy && b.repayBy > from && b.repayBy <= to) {
    const months = Math.max(0, daysBetween(weeks[0].monday, b.repayBy) / 30.4);
    const amount = Math.round(planned * (1 + (rate * months) / 12));
    extra.push({ date: b.repayBy, title: 'Погасить мост на кредитке', delta: -amount, balance: 0, kind: 'bridge' });
  }
  // минималка кредитки моста растёт на ~2% от взятого + проценты за месяц, пока мост не погашен
  const minUp: Record<string, number> = {};
  const until = b.repayBy ?? to;
  for (const e of eventsBetween(input.cal, from, to)) {
    if (e.kind !== 'payment' || e.debtId !== b.card || e.date > until) continue;
    const taken = takenBy(e.date);
    if (taken > 0) minUp[e.key] = Math.round(taken * (0.02 + rate / 12));
  }
  return { extra, minUp };
}

function run(input: CoverageInput, from: string, to: string, shift?: { key: string; date: string }): Omit<Coverage, 'narrow' | 'months' | 'shortage'> {
  const { marks } = input;
  // всё неотмеченное до сегодня включительно — платежи, поступления, воскресное пополнение карты — входит сегодняшним
  // днём: в учёте резерва этих денег ещё нет (не ушли и не пришли). В день платежа, пока он не отмечен, прогноз
  // не показывает деньги, которых уже нет. Отмеченное уже отражено в резерве и в прогноз не входит
  const due = eventsBetween(input.cal, addDays(from, -45), from).filter(e => !marks[e.key]?.done);
  const ahead = eventsBetween(input.cal, addDays(from, 1), to).filter(e => !marks[e.key]?.done);
  const { extra, minUp } = bridgeEvents(input, from, to);
  const step = (e: CalEvent, date: string): CoverageStep => ({
    date: shift && e.key === shift.key ? shift.date : date, title: e.title, kind: e.kind, approx: e.approx, key: e.key, balance: 0,
    delta: e.kind === 'income' ? e.amount : -(e.amount + (minUp[e.key] ?? 0)),
  });
  const list: CoverageStep[] = [...due.map(e => step(e, from)), ...ahead.map(e => step(e, e.date)), ...extra]
    .sort((a, b) => a.date.localeCompare(b.date) || b.delta - a.delta);
  let balance = input.reserve;
  const byDay: Record<string, number> = {};
  for (const s of list) { balance += s.delta; s.balance = balance; byDay[s.date] = balance; }
  const min = list.reduce<CoverageStep | null>((m, s) => (!m || s.balance < m.balance ? s : m), null);
  return { start: input.reserve, from, to, steps: list, byDay, min };
}

/** Прогноз резерва от сегодня: не меньше 150 дней и до первой крупной премии после самого тонкого места */
export function coverage(input: CoverageInput, from: string): Coverage {
  let to = addDays(from, HORIZON_DAYS);
  let base = run(input, from, to);
  const big = eventsBetween(input.cal, base.min?.date ?? from, addDays(from, 400)).find(e => e.kind === 'income' && e.amount >= 100_000);
  if (big && big.date > to) { to = big.date; base = run(input, from, to); }
  const { steps, min } = base;

  // узкие места: по дню — последний платёж, после которого остаток ниже запаса
  const narrowDays = new Map<string, CoverageStep>();
  for (const s of steps) if (s.delta < 0 && s.balance < NARROW) narrowDays.set(s.date, s);
  const narrow = [...narrowDays.values()];

  const months = new Map<string, CoverageMonth>();
  for (const s of steps) {
    const m = monthKey(s.date);
    const r = months.get(m) ?? { month: m, payments: 0, incomes: 0, life: 0, net: 0, min: Infinity, minDate: s.date, minTitle: s.title };
    if (s.delta > 0) r.incomes += s.delta;
    else if (s.kind === 'weekly') r.life -= s.delta;
    else r.payments -= s.delta;
    r.net += s.delta;
    if (s.balance < r.min) { r.min = s.balance; r.minDate = s.date; r.minTitle = s.title; }
    months.set(m, r);
  }

  const firstNeg = steps.find(s => s.balance < 0);
  const shortage = firstNeg ? { date: firstNeg.date, title: firstNeg.title, amount: -Math.min(...steps.filter(s => s.date >= firstNeg.date).map(s => s.balance)) } : null;
  return { ...base, narrow, months: [...months.values()], shortage, to, min };
}

export interface CoverageHint {
  text: string;
  /** закрывает ли нехватку сама по себе */
  closes: boolean;
}

/** Что можно сделать с нехваткой — только недельными деньгами; кредитка для платежа по долгу не предлагается */
export function coverageHints(input: CoverageInput, from: string, cov: Coverage): CoverageHint[] {
  const s = cov.shortage;
  if (!s) return [];
  const hints: CoverageHint[] = [];
  // перенести последнее пополнение карты до нехватки на день ближайшего поступления после него
  const top = [...cov.steps].reverse().find(x => x.kind === 'weekly' && x.date <= s.date && x.key);
  if (top) {
    const income = cov.steps.find(x => x.delta > 0 && x.date > top.date);
    if (income) {
      const moved = run(input, from, cov.to, { key: top.key!, date: income.date });
      const ok = !moved.steps.some(x => x.balance < 0);
      hints.push({ text: `Перенести пополнение карты ${ddmm(top.date)} на ${ddmm(income.date)} (${income.title})${ok ? ' — нехватка закрывается' : ' — не хватает всё равно'}`, closes: ok });
    }
  }
  const b = activeBridge(input.bridge);
  if (b) {
    const planned = b.weeks.reduce((sum, w) => sum + w.fromCredit, 0);
    const room = Math.max(0, b.cap - planned);
    if (room > 0) hints.push({ text: `Мост на Сбер-кредитке на неделю до ${ddmm(s.date)}: ещё до ${room.toLocaleString('ru-RU')} ₽ — только покупки, из недельных денег`, closes: room >= s.amount });
  }
  const oneOff = cov.steps.filter(x => x.kind === 'payment' && x.date <= s.date && x.key && !x.key.startsWith('pay:') && !x.key.startsWith('fix:'));
  for (const o of oneOff) hints.push({ text: `Если «${o.title}» ещё не оплачено — сдвинуть или уменьшить`, closes: -o.delta >= s.amount });
  if (!hints.some(h => h.closes)) hints.push({ text: 'Подсказки нехватку не закрывают — нужен пересчёт плана, отправьте файл в Claude', closes: false });
  return hints;
}

/**
 * Резерв к вечеру каждого дня [from..to] по прогнозу: в день с событиями — остаток после них, без событий — как
 * накануне. До начала прогноза (прошедшие дни) и после его конца — null: остаток дня в календаре — это ровно прогноз
 * покрытия, другого расчёта нет.
 */
export function reserveByDay(cov: Coverage, from: string, to: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  let v = cov.start;
  for (let d = cov.from; d < from && d <= cov.to; d = addDays(d, 1)) if (cov.byDay[d] != null) v = cov.byDay[d];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d < cov.from || d > cov.to) { out[d] = null; continue; }
    if (cov.byDay[d] != null) v = cov.byDay[d];
    out[d] = v;
  }
  return out;
}

/** День календаря */
export interface DayMoney {
  date: string;
  /** неоплаченное: что уходит (платежи, пополнение карты) и что приходит */
  out: number;
  in: number;
  /** сумма неоплаченных событий дня со знаком — её и показывает ячейка */
  sum: number;
  /** события дня есть, и все отмечены (оплачены, пришли, долито) */
  paid: boolean;
  /** всего отмечено в этот день — для зачёркнутой подписи, на суммы не влияет */
  paidTotal: number;
  /** резерв к вечеру по прогнозу покрытия; null — день прошёл или за горизонтом прогноза */
  total: number | null;
  past: boolean;
  /** шаги прогноза без события в календаре (погашение моста) */
  extra: { title: string; delta: number }[];
}

/**
 * Дни месяца для календаря. Остаток — из прогноза покрытия (reserveByDay); в сумму дня входят только неоплаченные
 * события: оплаченное уже ушло из резерва в день оплаты, на будущих днях оно не считается ни в сумме, ни в остатке.
 */
export function monthDays(events: CalEvent[], marks: Record<string, EventMark>, cov: Coverage, month: string, now: string): DayMoney[] {
  const from = `${month}-01`, to = `${month}-${String(lastDay(month)).padStart(2, '0')}`;
  const level = reserveByDay(cov, from, to);
  return Array.from({ length: lastDay(month) }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    const list = events.filter(e => e.date === date);
    const open = list.filter(e => !marks[e.key]?.done);
    const done = list.filter(e => marks[e.key]?.done);
    const extra = cov.steps.filter(x => x.kind === 'bridge' && x.date === date).map(x => ({ title: x.title, delta: x.delta }));
    const out = open.filter(e => e.kind !== 'income').reduce((t, e) => t + e.amount, 0) - extra.reduce((t, x) => t + Math.min(0, x.delta), 0);
    const inc = open.filter(e => e.kind === 'income').reduce((t, e) => t + e.amount, 0);
    return {
      date, out, in: inc, sum: inc - out,
      paid: list.length > 0 && open.length === 0,
      paidTotal: done.reduce((t, e) => t + (marks[e.key].amount ?? e.amount), 0),
      total: level[date],
      past: date < now,
      extra,
    };
  });
}

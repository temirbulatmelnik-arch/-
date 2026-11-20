// Покрытие обязательных платежей: хватит ли резерва на кредиты, рассрочку, Сплит, минималки и обязательные платежи.
// Платежи по долгам гасятся только реальными деньгами (резерв и поступления), кредитка никогда не источник платежа.
// Регулировать можно только недельные деньги на жизнь: пополнение карты и мост на кредитке.
import { accountMovement, cents, LIFE_ACCOUNT, RESERVE_ACCOUNT, rubles } from './accounts';
import { activeBridge, bridgeState, type Bridge } from './bridge';
import { cashIncomeEvent, eventsBetween, incomeStatus, type CalendarInput, type IncomeStatus } from './calendar';
import { addDays, daysBetween, ddmm, lastDay, monthKey } from './dates';
import { RESERVE_BUFFER, weeklyLimit } from './plan';
import { UNIT_2027, with2027Unit } from './payroll';
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
  accountId?: string;
  confidence?: CalEvent['confidence'];
  incomeStatus?: IncomeStatus;
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
  accountRisk?: AccountRisk | null;
  accountByDay?: Record<string, Record<string, number | null>>;
  paymentFunding?: PaymentFunding[];
  transferFunding?: TransferFunding[];
  bufferRisk?: { date: string; amount: number } | null;
  shortage: { date: string; title: string; amount: number } | null;
}

export interface CoverageInput {
  cal: CalendarInput;
  marks: Record<string, EventMark>;
  reserve: number;
  debts: Debt[];
  expenses: Expense[];
  bridge?: Bridge | null;
  cash?: Record<string, number | null>;
}

/**
 * Вход прогноза — один на всё приложение: календарь (остаток дня), «Хватит ли», «самая тонкая точка» и status.coverage
 * в файле для чата. Резерв — по учёту плюс деньги резерва на карте: поступления, ждущие перевода в резерв, и переводы
 * под ещё не отмеченные платежи. Недельные деньги считаются
 * потраченными до нуля: из резерва уходит только воскресное пополнение карты (в неделю моста — fromReserve), траты с
 * кредитки моста резерв не уменьшают — они растят долг по кредитке.
 */
export function coverageInput(s: CalendarInput & { marks: Record<string, EventMark>; expenses: Expense[] }, led: Pick<Ledger, 'reserve' | 'incomeOnCard' | 'heldOnCard'> & Partial<Pick<Ledger, 'card' | 'reserveVerified' | 'cashAccounts'>>): CoverageInput {
  return { cal: s, marks: s.marks, reserve: led.reserve + led.incomeOnCard + led.heldOnCard, debts: s.debts, expenses: s.expenses, bridge: s.bridge ?? null,
    cash: s.accountBook ? { [LIFE_ACCOUNT]: led.card ?? null, [RESERVE_ACCOUNT]: led.reserveVerified ? led.reserve : null,
      ...Object.fromEntries((led.cashAccounts ?? []).map(a => [a.id, a.expected])) } : undefined };
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
    if (input.cal.overrides?.[e.key]?.amount != null) continue;
    const taken = takenBy(e.date);
    if (taken > 0) minUp[e.key] = Math.round(taken * (0.02 + rate / 12));
  }
  return { extra, minUp };
}

function run(input: CoverageInput, from: string, to: string, shift?: { key: string; date: string }, scenario: Scenario = 'base'): Omit<Coverage, 'narrow' | 'months' | 'shortage'> {
  const { marks } = input;
  // всё неотмеченное до сегодня включительно — платежи, поступления, воскресное пополнение карты — входит сегодняшним
  // днём: в учёте резерва этих денег ещё нет (не ушли и не пришли). В день платежа, пока он не отмечен, прогноз
  // не показывает деньги, которых уже нет. Отмеченное уже отражено в резерве и в прогноз не входит
  const events = eventsBetween(input.cal, addDays(from, -45), to)
    .filter(e => !marks[e.key]?.done && (e.kind !== 'income' || e.date >= from))
    .flatMap(e => {
      const result = projectedEvent(e, scenario);
      return result && result.date <= to ? [result] : [];
    });
  const due = events.filter(e => e.date <= from);
  const ahead = events.filter(e => e.date > from);
  const { extra, minUp } = bridgeEvents(input, from, to);
  const step = (e: CalEvent, date: string): CoverageStep => ({
    date: shift && e.key === shift.key ? shift.date : date, title: e.title, kind: e.kind, approx: e.approx, key: e.key, balance: 0,
    incomeStatus: incomeStatus(e),
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

export type Scenario = 'base' | 'cautious' | 'stress';
export interface AccountRisk {
  date: string;
  title: string;
  accountId?: string;
  amount: number | null;
  reason: 'unassigned' | 'unverified' | 'insufficient';
}

export interface PaymentFunding {
  key: string;
  date: string;
  title: string;
  accountId?: string;
  amount: number;
  available: number | null;
  shortfall: number | null;
  prepareBy: string;
}

export interface TransferFunding {
  id: string;
  date: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  available: number | null;
  status: 'projected' | 'insufficient' | 'unverified';
}

const REGULAR = new Set(['salary', 'advance', 'bonusMonthly']);
function includeIncome(e: CalEvent, scenario: Scenario): boolean {
  if (!cashIncomeEvent(e) || e.payroll?.documented) return false;
  if (e.payroll?.vacationId) return true;
  if (incomeStatus(e) === 'conditional') return scenario === 'base';
  if (e.confidence === 'confirmed' || e.confidence === 'regular' || (e.incomeKind && REGULAR.has(e.incomeKind))) return true;
  if (e.confidence === 'estimate') return scenario === 'base';
  return scenario === 'base' && !e.approx && e.dateMode === 'exact' && e.confidence !== 'tentative';
}

export function projectedEvent(e: CalEvent, scenario: Scenario): CalEvent | null {
  if (e.projection === 'conditional' || e.projection === 'internal_transfer' ||
      (e.projection === 'review' && e.kind !== 'income' && scenario === 'base')) return null;
  if (e.kind !== 'income') return e;
  if (!includeIncome(e, scenario)) return null;
  if (e.payroll?.vacationId && e.confidence === 'tentative' && scenario !== 'base') {
    return { ...e, amount: rubles(Math.round(cents(e.amount) * (scenario === 'cautious' ? 0.8 : 0.7))),
      date: scenario === 'stress' ? addDays(e.date, 14) : e.date };
  }
  return e;
}

interface Deduction { accountId: string; amount: number }
type Projection = ReturnType<typeof run>;

function runAccounts(input: CoverageInput, from: string, to: string, scenario: Scenario, deduction?: Deduction): Projection {
  const balances = new Map(Object.entries(input.cash ?? {}).map(([id, amount]) => [id, amount === null ? null : cents(amount)]));
  let total = [...balances.values()].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const balanceOn = (id?: string) => id ? balances.get(id) ?? null : null;
  const start = rubles(total);
  const daily: NonNullable<Coverage['accountByDay']> = {};
  const steps: CoverageStep[] = [];
  const paymentFunding: PaymentFunding[] = [];
  const transferFunding: TransferFunding[] = [];
  const byDay: Record<string, number> = {};
  let accountRisk: AccountRisk | null = null;
  let bufferRisk: Coverage['bufferRisk'] = null;
  const move = (id: string | undefined, delta: number) => {
    const value = balanceOn(id);
    if (id && value != null) balances.set(id, value + delta);
  };
  const requireMoney = (id: string | undefined, amount: number, date: string, title: string) => {
    const available = balanceOn(id);
    if (!accountRisk && (available == null || available < amount)) {
      accountRisk = { accountId: id, date, title, amount: available == null ? null : rubles(amount - available),
        reason: !id ? 'unassigned' : available == null ? 'unverified' : 'insufficient' };
    }
    return available;
  };
  const push = (step: Omit<CoverageStep, 'balance' | 'delta'>, delta: number) => {
    total += delta;
    steps.push({ ...step, delta: rubles(delta), balance: rubles(total) });
    if (total < cents(RESERVE_BUFFER) && !bufferRisk) bufferRisk = { date: step.date, amount: rubles(cents(RESERVE_BUFFER) - total) };
  };
  if (total < cents(RESERVE_BUFFER)) bufferRisk = { date: from, amount: rubles(cents(RESERVE_BUFFER) - total) };
  if (deduction) {
    const amount = cents(deduction.amount);
    requireMoney(deduction.accountId, amount, from, 'Досрочное погашение');
    move(deduction.accountId, -amount);
    push({ date: from, title: 'Досрочное погашение', kind: 'payment', accountId: deduction.accountId }, -amount);
  }
  const byDate = new Map<string, CalEvent[]>();
  const { extra, minUp } = bridgeEvents(input, from, to);
  for (const event of eventsBetween(input.cal, addDays(from, -45), to)) {
    if (input.marks[event.key]?.done || (event.kind !== 'payment' && event.date < from)) continue;
    const e = projectedEvent(event, scenario);
    if (!e || e.date > to) continue;
    const date = e.date < from ? from : e.date;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(e);
  }
  const book = input.cal.accountBook;
  const stress = scenario === 'stress' ? book?.stress : undefined;
  const transfers = (book?.operations ?? []).filter(op => op.type === 'transfer' && op.status === 'planned' && op.date >= from && op.date <= to);
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = byDate.get(date) ?? [];
    const repayments = extra.filter(x => x.date === date);
    for (const step of repayments) {
      const accountId = input.cal.accountBook?.paymentAccounts['bridge-repayment'];
      requireMoney(accountId, cents(-step.delta), date, step.title);
      move(accountId, cents(step.delta));
      push({ date, title: step.title, kind: 'bridge', accountId }, cents(step.delta));
    }
    if (stress?.date === date) {
      requireMoney(stress.accountId, cents(stress.amount), date, 'Непредвиденный необходимый расход');
      move(stress.accountId, -cents(stress.amount));
      push({ date, title: 'Непредвиденный необходимый расход', kind: 'payment', accountId: stress.accountId }, -cents(stress.amount));
    }
    // Утренний автоплатёж должен быть обеспечен до зачислений и плановых переводов этого же дня.
    for (const e of day.filter(x => x.kind !== 'income')) {
      if (e.kind === 'weekly') {
        const target = cents(weeklyLimit(input.debts, addDays(date, 1), input.cal.weeklyOverrides));
        const existing = Math.min(target, Math.max(0, balanceOn(LIFE_ACCOUNT) ?? 0));
        const topUp = target - existing;
        if (topUp > 0) requireMoney(RESERVE_ACCOUNT, topUp, date, e.title);
        move(RESERVE_ACCOUNT, -topUp);
        move(LIFE_ACCOUNT, -existing);
        push({ date, title: 'Необходимые расходы недели', kind: 'weekly', key: e.key, accountId: RESERVE_ACCOUNT }, -target);
        continue;
      }
      const amount = cents(e.amount + (minUp[e.key] ?? 0));
      if (amount <= 0) continue;
      const available = requireMoney(e.accountId, amount, date, e.title);
      paymentFunding.push({ key: e.key, date, title: e.title, accountId: e.accountId, amount: rubles(amount),
        available: available == null ? null : rubles(available),
        shortfall: available == null ? null : rubles(Math.max(0, amount - available)), prepareBy: addDays(date, -1) });
      move(e.accountId, -amount);
      push({ date, title: e.title, kind: e.kind, key: e.key, accountId: e.accountId, approx: e.approx, confidence: e.confidence }, -amount);
    }
    for (const op of transfers.filter(op => op.date === date)) {
      if (op.type !== 'transfer') continue;
      const available = requireMoney(op.accountId, cents(op.amount), date, 'Перевод между счетами');
      const status = available == null ? 'unverified' : available < cents(op.amount) ? 'insufficient' : 'projected';
      transferFunding.push({ id: op.id, date, fromAccountId: op.accountId, toAccountId: op.toAccountId, amount: op.amount,
        available: available == null ? null : rubles(available), status });
      if (status !== 'projected') continue;
      move(op.accountId, accountMovement(op, op.accountId));
      move(op.toAccountId, accountMovement(op, op.toAccountId));
    }
    for (const e of day.filter(x => x.kind === 'income')) {
      const accountId = e.accountId ?? LIFE_ACCOUNT;
      move(accountId, cents(e.amount));
      push({ date, title: e.title, kind: 'income', key: e.key, accountId, approx: e.approx, confidence: e.confidence,
        incomeStatus: incomeStatus(e) }, cents(e.amount));
    }
    byDay[date] = rubles(total);
    daily[date] = Object.fromEntries([...balances].map(([id, value]) => [id, value === null ? null : rubles(value)]));
  }
  const min = steps.reduce<CoverageStep | null>((m, s) => (!m || s.balance < m.balance ? s : m), null);
  return { start, from, to, steps, byDay, accountByDay: daily, accountRisk, paymentFunding, transferFunding, bufferRisk, min };
}

/** Сравнение двух расчётных единиц с одинаковыми остатками, счетами и обязательствами. */
export function compare2027Coverage(input: CoverageInput, from: string, scenario: Scenario = 'cautious') {
  const work = input.cal.work;
  if (!work || from > '2027-12-31') return [];
  return UNIT_2027.map(unit => {
    const model = { ...input, cal: { ...input.cal, work: { ...with2027Unit(work, unit.unit), cautiousUnit2027: undefined } } };
    const result = coverage(model, from, scenario, '2027-12-31');
    return { ...unit, ...result };
  });
}

function scenarioInput(input: CoverageInput, scenario: Scenario): CoverageInput {
  const work = input.cal.work;
  return scenario !== 'base' && work?.cautiousUnit2027
    ? { ...input, cal: { ...input.cal, work: with2027Unit(work, work.cautiousUnit2027) } } : input;
}

export function safePrepayment(input: CoverageInput, from: string, accountId: string): number {
  const available = input.cash?.[accountId];
  if (available == null || available <= 0) return 0;
  const baseline = coverage(input, from, 'cautious');
  if (baseline.accountRisk || baseline.shortage || baseline.bufferRisk) return 0;
  const cautious = scenarioInput(input, 'cautious');
  let low = 0;
  let high = cents(Math.min(available, Math.max(0, Math.min(baseline.min?.balance ?? baseline.start, baseline.start) - RESERVE_BUFFER)));
  while (low < high) {
    const attempt = Math.ceil((low + high) / 2);
    const result = runAccounts(cautious, from, baseline.to, 'cautious', { accountId, amount: rubles(attempt) });
    if (result.accountRisk || result.bufferRisk) high = attempt - 1;
    else low = attempt;
  }
  return rubles(low);
}

/** Прогноз резерва от сегодня: не меньше 150 дней и до первой крупной премии после самого тонкого места */
export function coverage(input: CoverageInput, from: string, scenario: Scenario = 'base', until?: string): Coverage {
  const model = scenarioInput(input, scenario);
  let to = until && until >= from ? until : addDays(from, HORIZON_DAYS);
  const runModel = (end: string) => model.cash ? runAccounts(model, from, end, scenario) : run(model, from, end, undefined, scenario);
  let base = runModel(to);
  if (!until) {
    const big = eventsBetween(model.cal, base.min?.date ?? from, addDays(from, 400))
      .find(e => e.kind === 'income' && e.amount >= 100_000 && !model.marks[e.key]?.done && projectedEvent(e, scenario));
    if (big && big.date > to) { to = big.date; base = runModel(to); }
  }
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

  const firstNeg = base.start < 0 ? { balance: base.start, date: from, title: 'Остатки на начало прогноза' } : steps.find(s => s.balance < 0);
  const shortage = firstNeg ? { date: firstNeg.date, title: firstNeg.title, amount: -Math.min(firstNeg.balance, ...steps.filter(s => s.date >= firstNeg.date).map(s => s.balance)) } : null;
  return { ...base, narrow, months: [...months.values()], shortage, to, min };
}

export const COVERAGE_SCENARIOS = ['base', 'cautious', 'stress'] as const;

export function compareCoverage(input: CoverageInput, from: string, to: string) {
  if (to < from) return [];
  const scenarios = COVERAGE_SCENARIOS.map(scenario => ({ scenario, cov: coverage(input, from, scenario, to) }));
  const cautious = scenarios[1].cov;
  const comparisonDate = cautious.min && cautious.min.balance < cautious.start ? cautious.min.date : from;
  return scenarios.map(({ scenario, cov }) => {
    const min = Math.min(cov.start, cov.min?.balance ?? cov.start);
    const flows = { forecastIncome: 0, conditionalIncome: 0, expenses: 0 };
    for (const step of cov.steps) {
      if (step.date > comparisonDate) break;
      const group = step.kind !== 'income' ? 'expenses' : step.incomeStatus === 'conditional' ? 'conditionalIncome' : 'forecastIncome';
      flows[group] += cents(step.delta);
    }
    return { scenario, from, to, min, minDate: cov.min && cov.min.balance < cov.start ? cov.min.date : from,
      firstShortage: cov.shortage, accountRisk: cov.accountRisk, bufferRisk: cov.bufferRisk,
      comparisonDate, closingOnComparisonDate: rubles(cents(cov.start) + flows.forecastIncome + flows.conditionalIncome + flows.expenses),
      flowsOnComparisonDate: { forecastIncome: rubles(flows.forecastIncome), conditionalIncome: rubles(flows.conditionalIncome), expenses: rubles(-flows.expenses) } };
  });
}

export interface CoverageHint {
  text: string;
  /** закрывает ли нехватку сама по себе */
  closes: boolean;
}

/** Что можно сделать с нехваткой — только недельными деньгами; кредитка для платежа по долгу не предлагается */
export function coverageHints(input: CoverageInput, from: string, cov: Coverage): CoverageHint[] {
  if (input.cash) {
    const risk = cov.accountRisk;
    if (!risk) return cov.shortage ? [{ text: 'Уточните даты поступлений и пересмотрите необязательные расходы до первой нехватки.', closes: false }] : [];
    return [{ text: risk.reason === 'unassigned' ? 'Укажите карту списания в платеже.'
      : risk.reason === 'unverified' ? 'Сверьте остаток на счёте списания.'
      : 'Подготовьте деньги на счёте списания заранее и проверьте, хватит ли их на остальных счетах.', closes: false }];
  }
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
    const open = list.filter(e => !marks[e.key]?.done && projectedEvent(e, 'base'));
    const done = list.filter(e => marks[e.key]?.done || e.payroll?.documented);
    const extra = cov.steps.filter(x => x.kind === 'bridge' && x.date === date).map(x => ({ title: x.title, delta: x.delta }));
    const out = open.filter(e => e.kind !== 'income').reduce((t, e) => t + e.amount, 0) - extra.reduce((t, x) => t + Math.min(0, x.delta), 0);
    const inc = open.filter(e => e.kind === 'income').reduce((t, e) => t + e.amount, 0);
    return {
      date, out, in: inc, sum: inc - out,
      paid: done.length > 0 && open.length === 0,
      paidTotal: done.filter(e => e.kind !== 'income' || cashIncomeEvent(e)).reduce((t, e) => t + (marks[e.key]?.amount ?? e.amount), 0),
      total: level[date],
      past: date < now,
      extra,
    };
  });
}

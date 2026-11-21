import { cents, RESERVE_ACCOUNT, rubles, type PayoffTerms } from './accounts';
import { estimatePayment, eventsBetween, type CalendarInput } from './calendar';
import { addDays, addMonths, dayIn, monthKey } from './dates';
import { coverage, COVERAGE_SCENARIOS, projectedEvent, scenarioInput, type Coverage, type CoverageInput, type Scenario } from './coverage';
import { RESERVE_BUFFER } from './plan';
import type { CalEvent, Debt } from './types';

export type Mode = 'close' | 'term' | 'payment';
export interface RepaymentChoice { debtId: string; mode: Mode; amount?: number }
export interface RepaymentProduct { id: string; name: string; short: string; balance: number; quote?: number; modes: Mode[] }
export interface CashIssue { key?: string; date: string; title: string; accountId?: string; deficit: number | null; payment: number | null }
export interface CashMilestone { date: string; title: string; amount: number | null; kind: 'action' | 'income' | 'payment' | 'minimum' | 'gap' }
export interface RepaymentCashflow {
  actualReserve: number | null;
  before: number | null;
  after: number | null;
  until: string;
  known: boolean;
  earlier: CashIssue | null;
  first: CashIssue | null;
  baselineFirst: CashIssue | null;
  change: 'none' | 'new' | 'worse' | 'same' | 'better' | 'resolved';
  points: { date: string; reserve: number; schedule: number }[];
  events: CashMilestone[];
  savings: [number, number] | null;
}
export interface Repayment { debtId: string; mode: Mode; principal: number; cost: number; verified: boolean }
interface DebtResult { cost: number; paidOff: string | null; balanceAt: number; points: [string, number, number][] }
export interface RepaymentResult {
  id: string;
  title: string;
  actions: Repayment[];
  amount: number;
  reserveAfter: Record<Scenario, number | null>;
  horizons: { date: string; minimum: Record<Scenario, number | null> }[];
  scenarios: Record<Scenario, { shortage: Coverage['shortage']; accountRisk: Coverage['accountRisk']; reserveLow: number | null }>;
  removed: { key: string; title: string; date: string; amount: number }[];
  savings: [number, number] | null;
  savingsUntil: string;
  status: 'baseline' | 'available' | 'afterIncome' | 'conditional' | 'unsafe';
  reasons: string[];
  charts: { debt: number[]; cost: number[]; reserve: number[] };
  debtFree: string | null;
  cashflow?: Record<Scenario, RepaymentCashflow>;
  debtDates: { id: string; date: string | null }[];
}

function nextIssue(track: Coverage, since: string): CashIssue | null {
  const route = track.accountRisk;
  const risks: CashIssue[] = track.paymentFunding?.flatMap(p => p.date >= since && p.reserveShortfall && p.reserveShortfall > 0
    ? [{ key: p.key, date: p.date, title: p.title, accountId: p.accountId, deficit: p.reserveShortfall, payment: p.amount }] : []) ?? [];
  if (route && route.date >= since) {
    const payment = track.paymentFunding?.find(p => p.date === route.date && p.title === route.title);
    const step = track.steps.find(item => item.date === route.date && item.title === route.title && item.delta < 0);
    // Initial account checks also detect unassigned routes and payments due before any transfer.
    risks.unshift({ key: payment?.key ?? step?.key, date: route.date, title: route.title, accountId: route.accountId,
      deficit: route.amount, payment: payment?.amount ?? (step ? -step.delta : null) });
  }
  const negative = track.steps.find(step => step.date >= since && step.delta < 0 && step.balance < 0);
  if (negative) risks.push({ key: negative.key, date: negative.date, title: negative.title, accountId: negative.accountId,
    deficit: -negative.balance, payment: -negative.delta });
  return risks.sort((a, b) => a.date.localeCompare(b.date) ||
    Number(a.title === 'Модель досрочного погашения') - Number(b.title === 'Модель досрочного погашения'))[0] ?? null;
}

function cashflow(track: Coverage, baseline: Coverage, date: string, reserve: number | null, amount: number,
  savings: [number, number] | null): RepaymentCashflow {
  const old = nextIssue(baseline, baseline.from);
  const earlier = old && old.date < date ? old : null;
  const first = nextIssue(track, date);
  const baselineFirst = nextIssue(baseline, date);
  const change = !first ? baselineFirst ? 'resolved' : 'none' : !baselineFirst ? 'new' :
    first.date < baselineFirst.date ? 'worse' : first.date > baselineFirst.date ? 'better' :
      first.deficit != null && baselineFirst.deficit != null && cents(first.deficit) !== cents(baselineFirst.deficit)
        ? first.deficit > baselineFirst.deficit ? 'worse' : 'better' : 'same';
  const byDay = track.accountByDay ?? {};
  const after = byDay[date]?.[RESERVE_ACCOUNT] ?? null;
  const labels: CashMilestone[] = [{ date, title: 'Досрочное погашение', amount, kind: 'action' }];
  const next = track.steps.filter(step => step.date >= date && step.kind === 'income');
  for (const step of next.slice(0, 3)) labels.push({ ...step, amount: step.delta, kind: 'income' });
  const due = (track.paymentFunding ?? []).filter(p => p.date >= date);
  const large = [...due.filter(p => p.date <= addDays(date, 95))].sort((a, b) => b.amount - a.amount).slice(0, 3);
  for (const p of large) labels.push({ ...p, kind: 'payment' });
  const low = Object.entries(track.reserveLowByDay ?? {}).filter(([day]) => day >= date)
    .reduce<[string, number] | null>((best, point) => !best || point[1] < best[1] ? point : best, null);
  if (low) labels.push({ date: low[0], title: 'Минимум резерва', amount: low[1], kind: 'minimum' });
  if (first) labels.push({ ...first, title: 'Первая нехватка', amount: first.deficit, kind: 'gap' });
  if (earlier) labels.push({ ...earlier, title: 'Разрыв до досрочки', amount: earlier.deficit, kind: 'gap' });
  const marks = new Set(labels.map(event => event.date));
  const points = Object.entries(byDay).flatMap(([day, money], i, all) => {
    const own = money[RESERVE_ACCOUNT], normal = baseline.accountByDay?.[day]?.[RESERVE_ACCOUNT];
    return own == null || normal == null || !(i % 7 === 0 || i === all.length - 1 || marks.has(day))
      ? [] : [{ date: day, reserve: own, schedule: normal }];
  });
  return { actualReserve: reserve, before: after == null ? null : rubles(cents(after) + cents(amount)), after,
    until: track.to, known: reserve != null && after != null, earlier, first, baselineFirst, change, points,
    events: labels.sort((a, b) => a.date.localeCompare(b.date)), savings };
}

const MIN_WINDOW = 180;
const BLOCK_CENTS = cents(RESERVE_BUFFER);
const payoffTerms = (cal: CalendarInput, id: string) => cal.accountBook?.payoffTerms?.[id];
const interestRate = (d: Debt, terms: PayoffTerms | undefined, high: boolean) =>
  d.rule.type === 'schedule' && d.kind === 'installment' ? 0
    : high ? terms?.rateHigh ?? d.rate : terms?.rateLow ?? (d.kind === 'split' || d.rule.type === 'schedule' ? 0 : d.rate);

function byDebt(event: CalEvent, cal: CalendarInput): string[] {
  if (event.debtId) return [event.debtId];
  if (event.key.startsWith('split-debit:')) {
    return cal.accountBook?.splitDebits.find(d => event.key === `split-debit:${d.id}`)?.debtIds ?? [];
  }
  return [];
}

function modeledDebt(debt: Debt, rows: CalEvent[], terms: PayoffTerms | undefined, today: string, date: string,
  days: string[], scheduledUntil: string, action: Repayment | undefined, high: boolean): { result: DebtResult; payments: Map<string, number> } {
  let principal = cents(debt.balance);
  let interestDue = 0;
  let charges = 0;
  const outstanding = () => principal + interestDue;
  let balanceAt = outstanding();
  let changedPayment = 1;
  let paidOff: string | null = null;
  const points: DebtResult['points'] = [];
  const payments = new Map<string, number>();
  const rate = interestRate(debt, terms, high);
  const rowsByDate = new Map<string, CalEvent[]>();
  for (const row of rows) rowsByDate.set(row.date, [...rowsByDate.get(row.date) ?? [], row]);
  const end = days.at(-1)!;
  const repeat = debt.rule.type !== 'schedule' && debt.kind !== 'split' && debt.kind !== 'installment';
  const payDebt = (day: string, payment: number) => {
    const interest = Math.min(payment, interestDue);
    interestDue -= interest;
    principal = Math.max(0, principal - (payment - interest));
    if (outstanding() === 0 && !paidOff) paidOff = day;
  };

  for (const day of days) {
    if (principal && day > today && (repeat || day <= scheduledUntil)) {
      const interest = Math.round(principal * rate / 365);
      interestDue += interest;
      charges += interest;
    }
    for (const row of rowsByDate.get(day) ?? []) {
      const value = cents(row.amount);
      const mayReduce = action && day > date && debt.kind !== 'split' && debt.rule.type !== 'schedule';
      const pay = mayReduce && (row.approx || action.mode === 'payment')
        ? Math.min(outstanding(), Math.round(value * changedPayment))
        : action?.mode === 'close' && day > date ? 0 : value;
      payments.set(row.key, pay);
      payDebt(day, pay);
    }
    if (day > scheduledUntil && repeat && outstanding() && day === dayIn(monthKey(day), debt.dueDay)) {
      const original = estimatePayment({ ...debt, balance: rubles(outstanding()), rate }, monthKey(day));
      payDebt(day, Math.round(cents(original) * changedPayment));
    }
    if (day === date) {
      balanceAt = outstanding();
      if (action?.mode === 'close') {
        // Accrued interest is already in charges. Count an additional quote fee only
        // when the quoted cost exceeds the modeled principal plus accrued interest.
        charges += Math.max(0, cents(action.cost) - outstanding());
        payDebt(day, outstanding());
      } else if (action) {
        const applied = Math.min(principal, cents(action.principal));
        if (action.mode === 'payment' && principal) changedPayment = (principal - applied) / principal;
        charges += Math.max(0, cents(action.cost) - cents(action.principal));
        principal -= applied;
        if (outstanding() === 0 && !paidOff) paidOff = day;
      }
    }
    if (day >= date && (day === date || day === end || day.endsWith('-01'))) points.push([day, outstanding(), charges]);
  }
  return { result: { balanceAt, paidOff, cost: charges, points }, payments };
}

const maximumDate = (dates: string[]) => dates.reduce((latest, date) => date > latest ? date : latest);

export function createRepaymentPlanner(input: CoverageInput, today: string, settings: { withoutVacation?: boolean } = {}) {
  const year = Number(today.slice(0, 4));
  const until = maximumDate([addDays(today, MIN_WINDOW), `${year + 1}-12-31`]);
  const debts = input.debts.filter(d => !d.closed && d.balance > 0);
  const eligible = debts.filter(d => !d.noPrepay);
  const makeEvents = (model: CoverageInput, scenario: Scenario, from: string, to: string) => eventsBetween(model.cal, from, to).flatMap(event => {
    if (settings.withoutVacation && event.kind === 'income' && event.incomeKind === 'vacation') return [];
    const projected = !model.marks[event.key]?.done || event.kind === 'weekly' ? projectedEvent(event, scenario) : null;
    if (!projected) return [];
    const delay = scenario === 'stress' && projected.kind === 'income' &&
      ['salary', 'advance', 'bonusMonthly'].includes(projected.incomeKind ?? '') ? 7 : 0;
    return [{ ...projected, date: delay ? addDays(projected.date, delay) : projected.date }];
  });
  const currentFor = (model: CoverageInput, scenario: Scenario, end: string, events: CalEvent[]) => {
    const baseline = coverage(model, today, scenario, end);
    if (!settings.withoutVacation && scenario !== 'stress') return baseline;
    const historic = new Map(baseline.steps.flatMap(step => step.kind === 'payment' && step.key ? [[step.key, -step.delta] as const] : []));
    return coverage(model, today, scenario, end, { events: events.map(e => e.kind === 'payment' ?
      { ...e, amount: historic.get(e.key) ?? e.amount } : e), prepayments: [] });
  };
  const byScenario = Object.fromEntries(COVERAGE_SCENARIOS.map(scenario => {
    const withScenario = scenarioInput(input, scenario);
    const model = scenario === 'stress' && !withScenario.cal.accountBook?.stress && withScenario.cal.accountBook
      ? { ...withScenario, cal: { ...withScenario.cal, accountBook: { ...withScenario.cal.accountBook,
        stress: { date: addDays(today, 30), amount: 10000, accountId: RESERVE_ACCOUNT } } } }
      : withScenario;
    const events = makeEvents(model, scenario, addDays(today, -45), until);
    const current = currentFor(model, scenario, until, events);
    const actualDeltas = new Map(current.steps.flatMap(step => step.key && step.kind === 'payment' ? [[step.key, -step.delta] as const] : []));
    const scheduled = debts.map(debt => [debt.id, events.filter(e => e.kind === 'payment' && byDebt(e, model.cal).length === 1 &&
      byDebt(e, model.cal)[0] === debt.id && e.date >= today).map(e => ({ ...e, amount: actualDeltas.get(e.key) ?? e.amount }))] as const);
    return [scenario, { model, events, current, actualDeltas, scheduled: new Map(scheduled) }];
  })) as Record<Scenario, { model: CoverageInput; events: CalEvent[]; current: Coverage;
    actualDeltas: Map<string, number>; scheduled: Map<string, CalEvent[]> }>;

  const dateCache = new Map<string, string[]>();
  const byDays = (end: string) => {
    const previous = dateCache.get(end);
    if (previous) return previous;
    const days = [];
    for (let day = today; day <= end; day = addDays(day, 1)) days.push(day);
    dateCache.set(end, days);
    return days;
  };

  function products(date: string): RepaymentProduct[] {
    if (date < today || date > until) return [];
    const baseline = byScenario.base;
    return eligible.flatMap(debt => {
      const terms = payoffTerms(input.cal, debt.id);
      const balance = rubles(modeledDebt(debt, baseline.scheduled.get(debt.id) ?? [], terms, today, date,
        byDays(date), until, undefined, true).result.balanceAt);
      if (!balance && terms?.closeDate !== date) return [];
      const modes: Mode[] = ['close'];
      if (debt.kind === 'loan') modes.push(...terms?.loanModes ?? []);
      else if (debt.kind !== 'installment') modes.push('term');
      return [{ id: debt.id, short: debt.short, name: debt.name, balance,
        quote: terms?.closeDate === date ? terms.closeAmount : undefined, modes }];
    });
  }

  function analyze(date: string, quick = false, requested?: RepaymentChoice[]): RepaymentResult[] {
    if (date < today || date > until) return [];
    const windows = [...new Set([30, 90, 180].map(days => addDays(date, days)).concat(until))].sort();
    const end = maximumDate(windows);
    // When selecting a later date, extend the authoritative cash calendar before checking a full
    // 180 days. The long chart continues contractual annuities separately.
    const extended = end > until;
    const rowsAt = (scenario: Scenario) => {
      const loaded = byScenario[scenario];
      if (!extended) return loaded;
      const cal = loaded.model.cal;
      const tail = makeEvents(loaded.model, scenario, addDays(until, 1), end);
      const events = [...loaded.events, ...tail];
      const scheduled = new Map(debts.map(d => [d.id, [...(loaded.scheduled.get(d.id) ?? []),
        ...tail.filter(e => e.kind === 'payment' && byDebt(e, cal).length === 1 && byDebt(e, cal)[0] === d.id)]]));
      return { ...loaded, events, scheduled, current: currentFor(loaded.model, scenario, end, events) };
    };
    const scenarios = Object.fromEntries(COVERAGE_SCENARIOS.map(s => [s, rowsAt(s)])) as typeof byScenario;
    const debtEnd = dayIn(addMonths(monthKey(today), 72), 'last');
    const chartEnd = quick ? end : debtEnd;
    const debtModel = (scenario: Scenario, debt: Debt, action?: Repayment, high = true, limit = chartEnd) =>
      modeledDebt(debt, scenarios[scenario].scheduled.get(debt.id) ?? [], payoffTerms(input.cal, debt.id), today, date, byDays(limit), end, action, high);
    const baselineModels = new Map(debts.map(d => [d.id, debtModel('base', d)]));
    const baselineLow = new Map(debts.map(d => [d.id, debtModel('base', d, undefined, false, end).result.cost]));
    const baselineHigh = new Map(debts.map(d => [d.id, debtModel('base', d, undefined, true, end).result.cost]));
    const predictions = Object.fromEntries(eligible.map(d => [d.id, rubles(baselineModels.get(d.id)!.result.balanceAt)]));
    const close = eligible.flatMap(d => {
      const terms = payoffTerms(input.cal, d.id);
      const forecast = predictions[d.id];
      const amount = terms?.closeDate === date ? terms.closeAmount ?? forecast : forecast;
      if (!(amount > 0)) return [];
      const mixedDebit = scenarios.base.events.some(e => e.date > date && byDebt(e, input.cal).length > 1 && byDebt(e, input.cal).includes(d.id));
      if (mixedDebit) return [];
      return [{ debtId: d.id, mode: 'close', principal: forecast, cost: amount,
        verified: terms?.closeDate === date && terms.closeAmount != null } satisfies Repayment];
    });
    const variants = eligible.flatMap(d => {
      const terms = payoffTerms(input.cal, d.id);
      if (d.kind === 'installment' || (d.kind === 'loan' && !terms?.loanModes?.length)) return [];
      const cautious = scenarios.cautious.current.accountByDay?.[date]?.[RESERVE_ACCOUNT] ?? 0;
      const optimistic = scenarios.base.current.accountByDay?.[date]?.[RESERVE_ACCOUNT] ?? 0;
      const atBank = date === today ? input.cash?.[RESERVE_ACCOUNT] ?? 0 : Infinity;
      const possible = Math.max(0, Math.min(atBank, Math.max(cautious, optimistic)) - RESERVE_BUFFER - (terms?.partialFee ?? 0));
      const balance = predictions[d.id];
      const limit = Math.min(possible, balance * 0.9);
      if (limit <= 0) return [];
      const modes = d.kind === 'loan' ? terms!.loanModes! : ['term'] as const;
      const cautionLimit = Math.min(limit, Math.max(0, cautious - RESERVE_BUFFER - (terms?.partialFee ?? 0)));
      const amounts = [...new Set([1000, 5000, 10000, limit / 4, limit / 2, cautionLimit, limit].map(n => Math.floor(Math.min(n, limit))))];
      return modes.flatMap(mode => amounts.filter(n => n > 0).map(principal => ({
        debtId: d.id, mode, principal, cost: principal + (terms?.partialFee ?? 0),
        verified: !!terms?.partialConfirmed,
      } satisfies Repayment)));
    });
    const options: Repayment[][] = [[]];
    if (requested?.length) {
      if (new Set(requested.map(choice => choice.debtId)).size !== requested.length) return [];
      const selected = requested.flatMap<Repayment>(choice => {
        if (choice.mode === 'close') return close.filter(item => item.debtId === choice.debtId);
        const contract = products(date).find(item => item.id === choice.debtId);
        if (!contract?.modes.includes(choice.mode) || !Number.isFinite(choice.amount) ||
            cents(choice.amount!) <= 0 || cents(choice.amount!) >= cents(contract.balance)) return [];
        const terms = payoffTerms(input.cal, choice.debtId);
        return [{ ...choice, principal: rubles(cents(choice.amount!)),
          cost: rubles(cents(choice.amount!) + cents(terms?.partialFee ?? 0)), verified: !!terms?.partialConfirmed }];
      });
      if (selected.length !== requested.length) return [];
      options.push(selected);
    }
    for (const action of close) options.push([action]);
    for (const [index, action] of close.entries()) {
      for (const other of close.slice(index + 1)) options.push([action, other]);
      for (const partial of variants.filter(row => row.debtId !== action.debtId && row.mode === 'term').slice(0, 8)) options.push([action, partial]);
    }
    if (close.length > 2) options.push([...close].sort((a, b) => a.cost - b.cost).slice(0, 3));
    options.push(...variants.map(row => [row]));
    const distributed = [...variants].sort((a, b) => b.principal - a.principal)
      .filter((row, index, rows) => rows.findIndex(other => other.debtId === row.debtId) === index)
      .sort((a, b) => (debts.find(d => d.id === b.debtId)?.rate ?? 0) - (debts.find(d => d.id === a.debtId)?.rate ?? 0)).slice(0, 3)
      .map((row, _, rows) => ({ ...row, principal: Math.floor(row.principal / rows.length),
        cost: Math.floor(row.principal / rows.length) + row.cost - row.principal }));
    if (distributed.length > 1 && distributed.every(row => row.principal > 0)) options.push(distributed);

    const payScenario = (scenario: Scenario, actions: Repayment[], amount: number) => {
      const { current, events, actualDeltas, model } = scenarios[scenario];
      if (!actions.length) return current;
      const contracts = new Map(actions.map(action => [action.debtId,
        debtModel(scenario, debts.find(d => d.id === action.debtId)!, action, true, end).payments]));
      const releaseKeys: string[] = [];
      const changed = events.flatMap(e => {
        if (e.kind !== 'payment') return [e];
        const debtIds = byDebt(e, input.cal);
        const closeEntire = e.date > date && debtIds.length > 0 &&
          debtIds.every(id => actions.some(a => a.mode === 'close' && a.debtId === id));
        if (closeEntire) { releaseKeys.push(e.key); return []; }
        const changed = e.date > date && debtIds.length === 1 ? contracts.get(debtIds[0])?.get(e.key) : undefined;
        return [{ ...e, amount: changed === undefined ? actualDeltas.get(e.key) ?? e.amount : rubles(changed), possibleExtra: undefined }];
      });
      for (const action of actions) if (action.mode === 'close') releaseKeys.push(`bridge:${action.debtId}`);
      return coverage(model, today, scenario, end, { events: changed, prepayments: [{ date, amount, releaseKeys, title: 'Модель досрочного погашения' }] });
    };
    const planId = (actions: Repayment[]) => actions.map(a => `${a.debtId}:${a.mode}:${a.cost}`).sort().join('|') || 'schedule';
    const requestedId = requested?.length ? planId(options[1]) : null;
    const unique = [...new Map(options.map(actions => [planId(actions), actions])).values()];
    const rows = unique.map(actions => {
      const amount = rubles(actions.reduce((sum, a) => sum + cents(a.cost), 0));
      const tracks = Object.fromEntries(COVERAGE_SCENARIOS.map(scenario => [scenario, payScenario(scenario, actions, amount)])) as Record<Scenario, Coverage>;
      const minimum = (track: Coverage, last: string) => {
        const values = Object.entries(track.reserveLowByDay ?? {}).filter(([day]) => day <= last).map(([, value]) => value);
        return values.length ? Math.min(...values) : null;
      };
      const min = Object.fromEntries(COVERAGE_SCENARIOS.map(s => [s, minimum(tracks[s], end)])) as Record<Scenario, number | null>;
      const caution = tracks.cautious;
      const safe = min.cautious != null && cents(min.cautious) >= BLOCK_CENTS && !caution.accountRisk && !caution.shortage;
      const available = input.cash?.[RESERVE_ACCOUNT] ?? null;
      const needsFunds = available == null || cents(available) < cents(amount) + BLOCK_CENTS;
      const unverified = actions.some(action => !action.verified);
      const basePossible = min.base != null && cents(min.base) >= BLOCK_CENTS && !tracks.base.accountRisk && !tracks.base.shortage;
      const status = !actions.length ? 'baseline' : safe && !unverified && (date !== today || !needsFunds)
        ? date === today ? 'available' : 'afterIncome' : basePossible || safe ? 'conditional' : 'unsafe';
      const models = debts.map(d => {
        const action = actions.find(a => a.debtId === d.id);
        return [d.id, action ? debtModel('base', d, action) : baselineModels.get(d.id)!] as const;
      });
      const savingsFor = (scenario: Scenario): [number, number] | null => {
        if (!actions.length) return null;
        let lower = 0, upper = 0;
        for (const action of actions) {
          const d = debts.find(debt => debt.id === action.debtId)!;
          const high = (scenario === 'base' ? baselineHigh.get(d.id)! : debtModel(scenario, d, undefined, true, end).result.cost)
            - debtModel(scenario, d, action, true, end).result.cost;
          const low = (scenario === 'base' ? baselineLow.get(d.id)! : debtModel(scenario, d, undefined, false, end).result.cost)
            - debtModel(scenario, d, action, false, end).result.cost;
          lower += Math.min(low, high); upper += Math.max(low, high);
        }
        return [rubles(lower), rubles(upper)];
      };
      const id = planId(actions);
      const detailed = !quick && (requestedId ? id === requestedId : !actions.length);
      const results = models.map(([, m]) => m.result);
      const dates = results.map(r => r.paidOff);
      const removed = actions.length ? scenarios.base.events.filter(e => e.kind === 'payment' && e.date > date &&
        byDebt(e, input.cal).length > 0 && byDebt(e, input.cal).every(id => actions.some(a => a.mode === 'close' && a.debtId === id))) : [];
      return {
        id,
        title: actions.length ? actions.map(a => {
          const name = debts.find(d => d.id === a.debtId)!.short;
          return a.mode === 'close' ? `Закрыть ${name}` : `${name} · ${a.mode === 'payment' ? 'снизить платёж' : 'досрочно частично'}`;
        }).join(' + ') : 'Платить по графику',
        actions, amount, status,
        reserveAfter: Object.fromEntries(COVERAGE_SCENARIOS.map(s => [s, tracks[s].accountByDay?.[date]?.[RESERVE_ACCOUNT] ?? null])),
        horizons: windows.map(day => ({ date: day, minimum: Object.fromEntries(COVERAGE_SCENARIOS.map(s => [s, minimum(tracks[s], day)])) })),
        scenarios: Object.fromEntries(COVERAGE_SCENARIOS.map(s => [s, { reserveLow: min[s], shortage: tracks[s].shortage, accountRisk: tracks[s].accountRisk }])),
        removed: removed.map(({ key, title, date: day, amount: value }) => ({ key, title, date: day, amount: value })),
        savings: savingsFor('base'),
        ...(detailed ? { cashflow: Object.fromEntries(COVERAGE_SCENARIOS.map(s =>
          [s, cashflow(tracks[s], scenarios[s].current, date, available, amount, savingsFor(s))])) } : {}),
        savingsUntil: end,
        reasons: [
          ...(unverified ? ['Уточните условия договора и сумму закрытия на выбранную дату.'] : []),
          ...(actions.some(a => debts.find(d => d.id === a.debtId)?.kind === 'split') ?
            ['Экономия по Сплиту зависит от полного графика и суммы закрытия на выбранную дату.'] : []),
          ...(needsFunds && date === today && actions.length ? ['Подтвердите денежный остаток в резерве после фактического зачисления и перевода.'] : []),
          ...(actions.length && date > today ? ['Повторите расчёт после зачисления денег и перевода в резерв.'] : []),
          ...(actions.length && !safe ? ['В осторожном сценарии есть риск нехватки на платежи или падения резерва ниже 20 000 ₽.'] : []),
        ],
        debtFree: dates.length && dates.every(Boolean) ? maximumDate(dates as string[]) : null,
        debtDates: models.map(([id, row]) => ({ id, date: row.result.paidOff })),
        charts: { debt: (results[0]?.points ?? []).map((_, i) => rubles(results.reduce((n, r) => n + (r.points[i]?.[1] ?? 0), 0))),
          cost: (results[0]?.points ?? []).map((_, i) => rubles(results.reduce((n, r) => n + (r.points[i]?.[2] ?? 0), 0))),
          reserve: Object.entries(tracks.base.accountByDay ?? {}).filter(([d]) => d >= date && (d === date || d.endsWith('-01')))
            .flatMap(([, value]) => value[RESERVE_ACCOUNT] ?? []) },
      } as RepaymentResult;
    });
    const ranked = rows.sort((a, b) => {
      const rank = { baseline: 0, available: 1, afterIncome: 2, conditional: 3, unsafe: 4 };
      return rank[a.status] - rank[b.status] || (b.savings?.[0] ?? 0) - (a.savings?.[0] ?? 0) || a.amount - b.amount;
    });
    if (!requestedId) return ranked;
    return [ranked[0], ranked.find(row => row.id === requestedId)!,
      ...ranked.filter(row => row.actions.length && row.id !== requestedId)];
  }

  function nextOpportunity(seed: string) {
    const model = byScenario.cautious;
    const previous = new Map<string, number>();
    const dates = Object.entries(model.current.accountByDay ?? {}).flatMap(([date, accounts]) => {
      const reserve = Math.max(accounts[RESERVE_ACCOUNT] ?? 0, byScenario.base.current.accountByDay?.[date]?.[RESERVE_ACCOUNT] ?? 0);
      const week = monthKey(date);
      if (reserve == null || reserve <= (previous.get(week) ?? RESERVE_BUFFER)) return [];
      previous.set(week, reserve);
      return [date];
    });
    const days = [...new Set([today, ...dates.filter(d => d <= addDays(today, 180)), ...eligible.flatMap(d => payoffTerms(input.cal, d.id)?.closeDate ?? []), seed])].sort();
    type Offer = { date: string; result: RepaymentResult };
    let conditional: Offer | null = null, ready: Offer | null = null;
    const better = (candidate: Offer, current: Offer | null) => !current ||
      (candidate.result.savings?.[0] ?? 0) > (current.result.savings?.[0] ?? 0) ||
      candidate.result.savings?.[0] === current.result.savings?.[0] && candidate.result.amount < current.result.amount;
    const blockers = [byScenario.cautious.current, byScenario.base.current].map(track => {
      const below = Object.entries(track.reserveLowByDay ?? {}).find(([, amount]) => cents(amount) < BLOCK_CENTS)?.[0];
      return [nextIssue(track, today)?.date, below].filter((v): v is string => !!v).sort()[0];
    });
    for (const date of days) {
      if (blockers.every(blocker => blocker && blocker < date)) break;
      const rows = analyze(date, true);
      const result = rows.find(row => (row.savings?.[1] ?? 0) > 0 && row.status !== 'baseline' && row.status !== 'unsafe');
      if (!result) continue;
      const choice = { date, result };
      if (result.status === 'conditional') {
        if (better(choice, conditional)) conditional = choice;
      } else if (better(choice, ready)) ready = choice;
    }
    return ready ?? conditional;
  }

  const nextSalary = byScenario.cautious.current.steps.find(step => step.kind === 'income' && !!step.key?.startsWith('inc:salary:'));
  const nextIncome = byScenario.cautious.current.steps.find(step => step.kind === 'income');
  return { analyze, products, nextOpportunity, until, nextIncome, nextSalary,
    baselineIssue: nextIssue(byScenario.cautious.current, today) };
}

export function bestPartial(rows: RepaymentResult[]) {
  const only = rows.filter(row => row.actions.length && row.actions.every(a => a.mode !== 'close'));
  const possible = only.find(r => r.status === 'available' || r.status === 'afterIncome' || r.status === 'conditional');
  return possible ?? only.sort((a, b) => (b.scenarios.cautious.reserveLow ?? -Infinity) - (a.scenarios.cautious.reserveLow ?? -Infinity) ||
    (b.savings?.[0] ?? 0) - (a.savings?.[0] ?? 0))[0];
}

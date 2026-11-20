import { accountOptions, appendOperations, bookOperationAllowed, budgetExpenses, cents, EMPTY_BOOK, LIFE_ACCOUNT, monthDebtActivity, RESERVE_ACCOUNT, validAmount, validBankBalance, validDate, validLoanReview, validSplitDebit, validSplitPlan, type AccountBook, type CashAccount } from './accounts';
import { validPayroll, with2027Unit, type PayrollProfile } from './payroll';
import { annualIncome } from './annualIncome';
// Файл обмена с чатом «Финансы»: один формат в обе стороны.
// Приложение выгружает всё, что знает (status — сводка только для чтения); чат возвращает тот же формат,
// но только с изменениями. Списки с id/key — «добавить или изменить», удаление — только явное "delete": true.
// Перед применением приложение показывает разницу по разделам; присланное без изменений ничего не трогает.
import { bridgeState, weekMoney, type Bridge } from './bridge';
import { cardOn, ledger, type Checkup, type LedgerInput } from './ledger';
import { compare2027Coverage, compareCoverage, coverage, coverageInput, HORIZON_DAYS, safePrepayment } from './coverage';
import { PROTOCOL_VERSION } from './sync';
import { eventsBetween, incomeStatus, paidOn, type CalendarInput, type IncomeStatus } from './calendar';
import { categorize } from './categorize';
import { addDays, daysBetween, ddmm, plural } from './dates';
import { rub } from './money';
import { CATEGORIES, CATEGORY, currentPhase, DEFAULT_PLAN, reserveNeed, type BonusRule, type PlanConfig } from './plan';
import { dayBudget, weekSummary } from './summary';
import type {
  CalEvent, CalendarOverride, CardBalance, CategoryId, ChecklistItem, Debt, DebtKind, EventMark, Expense, FixedItem, IncomeTemplate, Phase, ReserveMove, Source,
  StrategySection, WeekClosure, WeeklyOverride,
} from './types';

export const EXCHANGE_APP = 'kurs-exchange';
/** сколько дней трат попадает в файл */
export const EXPENSE_DAYS = 90;

/** Что приложение отдаёт в файл и что файл может поменять */
export interface ExchangeState extends CalendarInput {
  overrides: Record<string, CalendarOverride>;
  marks: Record<string, EventMark>;
  plan: PlanConfig | null;
  expenses: Expense[];
  reserve: number;
  savings: number;
  cardBalance: CardBalance | null;
  checklist: ChecklistItem[];
  checks: Record<string, { done: boolean; at: string }>;
  strategy: StrategySection[];
  rules: string[];
  closures: Record<string, WeekClosure>;
  checkups?: Checkup[];
  reserveLog?: ReserveMove[];
}

type Del = { delete?: boolean };

export interface ExchangeFile {
  app: typeof EXCHANGE_APP;
  version: 2;
  /** версия протокола, по которой выгружен файл: чат при несовпадении просит свежий текст */
  protocolVersion?: string;
  short?: boolean;
  from?: 'app' | 'chat';
  appVersion?: string;
  date?: string;
  /** одной фразой: что меняется */
  summary?: string;
  about?: string;
  /** сводка из приложения — только для чтения, при загрузке не применяется */
  status?: Record<string, unknown>;
  /** воскресные сверки с банком — только из приложения */
  checkups?: { date: string; monday: string; expected: Checkup['expected']; actual: Checkup['actual']; topUp: number; toReserve: number }[];
  limits?: {
    /** особые недельные лимиты на периоды — полный список */
    weekly?: WeeklyOverride[];
    weeklyDefaults?: WeeklyOverride[];
    defaultWeekly?: PlanConfig['defaultWeekly'];
    phases?: (Partial<Phase> & { id: number })[];
    categories?: Partial<Record<CategoryId, { limit?: number; baseline?: number }>>;
    bonusRules?: Record<string, BonusRule>;
    /** нехватка зарплаты по месяцам YYYY-MM */
    shortfall?: Record<string, number>;
  };
  debts?: (Partial<Pick<Debt, 'name' | 'short' | 'kind' | 'balance' | 'rate' | 'dueDay' | 'targetClose' | 'note' | 'limit' | 'order' | 'phase'>> & { id: string; minPayment?: number; closed?: boolean; closedOn?: string })[];
  fixed?: (Partial<FixedItem> & { id?: string } & Del)[];
  /** шаблон поступлений — полный список */
  incomes?: IncomeTemplate[];
  /** события календаря по key: amount и date — плановые, paid — фактически оплачено или пришло */
  /** событие ищется по key, а без него — по названию, дате (±7 дней) и сумме */
  calendar?: { key?: string; date?: string; title?: string; kind?: string; amount?: number; done?: boolean; paid?: number; paidFrom?: string; paidDate?: string; reset?: boolean; resetAmount?: boolean; approx?: boolean; exact?: boolean; planned?: string; dateMode?: string; accountId?: string; economicType?: CalEvent['economicType']; projection?: CalEvent['projection']; accrualPeriod?: string; nominalDate?: string; expectedPayDate?: string; actualPayDate?: string; confidence?: CalEvent['confidence']; incomeStatus?: IncomeStatus; manuallyAdjusted?: boolean }[];
  /** разовые платежи и поступления */
  events?: ({ key?: string; date?: string; title?: string; amount?: number; kind?: 'payment' | 'income'; dateMode?: CalEvent['dateMode']; note?: string; debtId?: string } & Del)[];
  expensesFrom?: string;
  accountBook?: Partial<AccountBook>;
  work?: Partial<PayrollProfile>;
  /** source credit — с кредитки, creditCard — id долга (без него — кредитка моста); dup — добавить, даже если такая дата и сумма уже есть */
  expenses?: ({ id?: string; date?: string; amount?: number; category?: string; note?: string; source?: Source; creditCard?: string; accountId?: string; fundingSource?: Expense['fundingSource']; occurredAt?: string; fingerprint?: string; dup?: boolean } & Del)[];
  /** мост на кредитке — целиком; { closed: true } — закрыть. В выгрузке ещё used и left — факт */
  bridge?: (Partial<Bridge> & { used?: number; left?: number }) | null;
  reserve?: number;
  savings?: number;
  card?: { amount: number; date: string } | null;
  weeks?: unknown;
  checklist?: (Partial<ChecklistItem> & { id: string } & Del)[];
  strategy?: StrategySection[];
  strategyEdits?: { title: string; find: string; replace: string }[];
  rules?: string[];
}

const r0 = (n: number) => Math.round(n);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isDate = validDate;
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
};

/* ---------- Выгрузка ---------- */

/** Неделя по источникам: всё в лимите, с карты, с кредитки; left меньше нуля — перерасход (лимит минус все траты).
 *  cardLeft — остаток карты по учёту (а не лимит минус траты): у текущей недели — ledger.card, у прошедших — на вечер
 *  воскресенья до пополнения, по сверке этой недели (actual.card), если она была */
function weekFields(s: ExchangeState, monday: string, cardLeft: number | null) {
  const m = weekMoney(s.expenses, s.debts, s.weeklyOverrides, s.bridge, monday);
  return {
    limit: r0(m.limit), spent: r0(m.spent), left: r0(m.left), spentLife: r0(m.spentLife), spentCredit: r0(m.spentCredit),
    cardLeft: cardLeft == null ? null : r0(cardLeft), creditLeft: r0(m.creditLeft),
  };
}

function cardAfterWeek(s: ExchangeState, input: LedgerInput, monday: string): number | null {
  const c = (s.checkups ?? []).find(x => x.monday === monday);
  return c ? c.actual.card : cardOn(input, addDays(monday, 6));
}

function bridgeOut(s: ExchangeState) {
  const st = bridgeState(s.expenses, s.bridge);
  if (!st) return null;
  return { ...st.bridge, weeks: st.weeks.map(w => ({ ...w, used: r0(w.used) })), used: r0(st.used), left: r0(st.left) };
}

/** short — для еженедельной сверки: календарь −14…+45 дней, траты за 14 дней, 4 недели, без шаблонов и стратегии */
export function buildExchange(s: ExchangeState, now: string, opts: { short?: boolean } = {}): ExchangeFile {
  const short = !!opts.short;
  const plan = s.plan ?? DEFAULT_PLAN;
  const expenses = budgetExpenses(s.expenses, s.accountBook ?? EMPTY_BOOK);
  const week = weekSummary(expenses, s.debts, s.weeklyOverrides, now);
  const phase = currentPhase(s.debts, now);
  const need = reserveNeed(now, s.debts);
  const from = addDays(now, short ? -14 : -EXPENSE_DAYS);
  const ledIn: LedgerInput = { accountBook: s.accountBook, checkups: s.checkups ?? [], cardBalance: s.cardBalance, reserve: s.reserve, reserveLog: s.reserveLog ?? [], marks: s.marks, expenses: s.expenses, oneOff: s.oneOff, debts: s.debts, bridge: s.bridge ?? null, now };
  const led = ledger(ledIn);
  const day = dayBudget(expenses, s.debts, s.weeklyOverrides, now);
  // тот же вход прогноза, что у календаря и «Хватит ли» в приложении: остаток дня в календаре = status.coverage
  const input = coverageInput(s, led);
  const cov = coverage(input, now);
  const byScenario = (scenario: 'cautious' | 'stress') => {
    const p = coverage(input, now, scenario);
    return { to: p.to, min: p.min?.balance ?? p.start, minDate: p.min?.date ?? now, shortage: p.shortage, accountRisk: p.accountRisk, bufferRisk: p.bufferRisk };
  };
  // окно −45…+75 дней и, дальше него, всё, что поправлено в приложении вручную: точные суммы и даты будущих платежей;
  // воскресные пополнения карты — только прошедшие и ближайшее, чтобы сверить их с переводами из резерва
  const recent = short
    ? eventsBetween(s, addDays(now, -14), addDays(now, 45))
    : eventsBetween(s, addDays(now, -45), addDays(now, 400))
      .filter(e => (e.kind === 'weekly' ? e.date <= addDays(now, 7) : e.date <= addDays(now, 75) || s.overrides[e.key] || s.marks[e.key]));
  const year = Number(now.slice(0, 4));
  const lastYear = year + (s.work?.from.startsWith(String(year - 1)) ? 0 : 1);
  const firstYear = Math.max(year - 1, Number(s.work?.from.slice(0, 4) ?? year));
  const throughYear = `${lastYear}-12-31`;
  const calendar = !short && s.work
    ? [...new Map([...recent, ...eventsBetween(s, `${firstYear}-01-01`, throughYear).filter(e => e.kind === 'income')]
      .map(e => [e.key, e])).values()].sort((a, b) => a.date.localeCompare(b.date))
    : recent;
  const incomeReport = (reportYear: number, scenario: 'base' | 'cautious') => {
    const work = s.work;
    const model = scenario === 'cautious' && work?.cautiousUnit2027 ? { ...s, work: with2027Unit(work, work.cautiousUnit2027) } : s;
    const { next, ...report } = annualIncome(model, reportYear, now, scenario);
    void next;
    return { year: reportYear, scenario, ...report };
  };
  return {
    app: EXCHANGE_APP, version: 2, protocolVersion: PROTOCOL_VERSION, from: 'app', date: now,
    ...(typeof __APP_VERSION__ === 'string' ? { appVersion: __APP_VERSION__ } : {}), ...(short ? { short: true } : {}),
    about: 'Файл обмена приложения «Курс». status — сводка только для чтения. Остальные разделы можно менять: в ответ присылай этот же формат только с изменениями.',
    status: {
      totalDebt: r0(Object.values(led.debtBalances).reduce((sum, d) => sum + d.estimated, 0)),
      phase: { id: phase.id, title: phase.title, weekly: phase.weekly, monthly: phase.monthly },
      week: { from: week.monday, to: week.sunday, ...weekFields(s, week.monday, led.card) },
      // сегодняшний день: норма, траты по источникам и сколько ещё можно — то же число, что в кольце на «Сегодня»
      today: {
        date: now, allowance: r0(day.day), spent: r0(day.spentToday), spentLife: r0(day.spentLife), spentCredit: r0(day.spentCredit),
        canSpend: r0(day.canSpend),
      },
      reserveNeed: { amount: r0(need.need), untilBonus: need.next },
      coverage: {
        to: cov.to, ...(cov.min ? { min: cov.min.balance, minDate: cov.min.date, minTitle: cov.min.title } : {}),
        ...(s.accountBook ? { scenario: 'base', accountRisk: cov.accountRisk, bufferRisk: cov.bufferRisk } : {}),
        ...(cov.shortage ? { shortage: cov.shortage } : {}),
        narrow: cov.narrow.map(n => ({ date: n.date, title: n.title, left: r0(n.balance) })),
      },
      ...(s.accountBook ? {
        accounts: [{ id: LIFE_ACCOUNT, expected: led.card, confirmed: s.cardBalance?.amount ?? null },
          { id: RESERVE_ACCOUNT, expected: led.reserveVerified ? led.reserve : null, confirmed: led.reserveVerified ? s.reserve : null },
          ...led.cashAccounts.map(a => ({ id: a.id, name: a.name, expected: a.expected, confirmed: a.balance?.amount ?? null, date: a.balance?.date }))],
        debtActivity: monthDebtActivity(s.accountBook, s.expenses, now),
        accountRisk: cov.accountRisk,
        coverageScenarios: { cautious: byScenario('cautious'), ...(short ? {} : { stress: byScenario('stress') }) },
        ...(!short ? {
          coverageComparison: { common: compareCoverage(input, now, addDays(now, HORIZON_DAYS)), yearEnd: compareCoverage(input, now, throughYear) },
          paymentFunding: cov.paymentFunding?.filter(p => p.date <= addDays(now, 45)),
          transferFunding: cov.transferFunding?.filter(p => p.date <= addDays(now, 45)),
        } : {}),
        ...(!short && s.work ? { yearIncome: Array.from({ length: Math.max(0, lastYear - firstYear + 1) }, (_, index) => firstYear + index)
          .flatMap(reportYear => [incomeReport(reportYear, 'base'), incomeReport(reportYear, 'cautious')]) } : {}),
        ...(!short && s.work ? { payUnitScenarios: compare2027Coverage(input, now).map(scenario => ({
          id: scenario.id, unit: scenario.unit, to: scenario.to, min: Math.min(scenario.start, scenario.min?.balance ?? scenario.start),
          shortage: scenario.shortage, accountRisk: scenario.accountRisk,
        })) } : {}),
        safePrepayment: Object.fromEntries(accountOptions(s.accountBook).map(a => [a.id, safePrepayment(input, now, a.id)])),
      } : {}),
      ledger: {
        card: led.card == null ? null : r0(led.card), reserve: r0(led.reserve), credit: led.credit == null ? null : r0(led.credit),
        incomeOnCard: r0(led.incomeOnCard), ...(led.heldOnCard ? { heldOnCard: r0(led.heldOnCard) } : {}), ...(led.creditInterest ? { creditInterest: r0(led.creditInterest) } : {}),
        ...(led.cardFrom ? { since: led.cardFrom.date } : {}),
      },
    },
    limits: { weekly: s.weeklyOverrides, defaultWeekly: plan.defaultWeekly, phases: plan.phases, categories: plan.categories, bonusRules: plan.bonusRules ?? {}, shortfall: plan.shortfallOverrides ?? {} },
    debts: s.debts.map(d => ({
      id: d.id, name: d.name, short: d.short, kind: d.kind, balance: r0(d.balance), rate: d.rate, dueDay: d.dueDay, order: d.order,
      ...(d.phase != null ? { phase: d.phase } : {}), ...(d.targetClose ? { targetClose: d.targetClose } : {}), ...(d.note ? { note: d.note } : {}),
      ...(d.limit != null ? { limit: d.limit } : {}), closed: d.closed, ...(d.closedOn ? { closedOn: d.closedOn } : {}),
    })),
    fixed: s.fixed,
    ...(s.accountBook ? { accountBook: short ? {
      operations: s.accountBook.operations.filter(op => op.date >= from && op.type === 'loan_disbursement'),
      splitDebits: s.accountBook.splitDebits.filter(d => d.date >= now && d.date <= addDays(now, 45)),
    } : s.accountBook } : {}),
    ...(!short && s.work ? { work: s.work } : {}),
    ...(short ? {} : { incomes: s.incomes }),
    calendar: calendar.map(e => {
      const m = s.marks[e.key];
      const status = incomeStatus(e, m);
      const override = s.overrides[e.key];
      const manuallyAdjusted = override?.amount != null || override?.date != null;
      const exact = status ? status === 'recorded' || (status === 'documented' && !!e.payroll?.actualPayDate)
        : manuallyAdjusted && !e.approx;
      return {
        key: e.key, date: e.date, title: e.title, kind: e.kind, amount: e.amount,
        ...(e.approx ? { approx: true } : {}), ...(e.dateMode !== 'exact' ? { dateMode: e.dateMode } : {}),
        ...(exact ? { exact: true } : {}), ...(manuallyAdjusted ? { manuallyAdjusted: true } : {}),
        ...(status ? { incomeStatus: status } : {}), ...(e.planned ? { planned: e.planned } : {}),
        ...(e.accountId ? { accountId: e.accountId } : {}), ...(e.economicType ? { economicType: e.economicType } : {}),
        ...(e.projection ? { projection: e.projection } : {}),
        ...(status === 'conditional' ? { confidence: 'estimate' as const } : e.confidence ? { confidence: e.confidence } : {}),
        ...(e.accrualPeriod ? { accrualPeriod: e.accrualPeriod, nominalDate: e.nominalDate, expectedPayDate: e.expectedPayDate,
          actualPayDate: m?.done ? paidOn(e, m) : e.payroll?.actualPayDate } : {}),
        done: !!m?.done, ...(m?.done && m.amount != null ? { paid: m.amount } : {}), ...(m?.paidFrom ? { paidFrom: m.paidFrom } : {}),
        ...(m?.done ? { paidDate: paidOn(e, m) } : {}),
      };
    }),
    ...(short ? {} : { events: s.oneOff.filter(e => e.date >= addDays(now, -45)).map(e => ({
      key: e.key, date: e.date, title: e.title, amount: r0(e.amount), kind: e.kind === 'income' ? 'income' : 'payment',
      ...(e.dateMode !== 'exact' ? { dateMode: e.dateMode } : {}), ...(e.note ? { note: e.note } : {}), ...(e.debtId ? { debtId: e.debtId } : {}),
    })) }),
    expensesFrom: from,
    expenses: s.expenses.filter(e => e.date >= from).map(e => ({ id: e.id, date: e.date, amount: e.amount, category: e.category, ...(e.note ? { note: e.note } : {}), source: e.source, ...(e.creditCard ? { creditCard: e.creditCard } : {}), ...(e.accountId ? { accountId: e.accountId } : {}), ...(e.fundingSource ? { fundingSource: e.fundingSource } : {}), ...(e.occurredAt ? { occurredAt: e.occurredAt } : {}), ...(e.fingerprint ? { fingerprint: e.fingerprint } : {}) })),
    reserve: r0(s.reserve),
    ...(short ? {} : { savings: r0(s.savings) }),
    card: s.cardBalance ? { amount: r0(s.cardBalance.amount), date: s.cardBalance.date } : null,
    weeks: Object.values(s.closures).sort((a, b) => b.monday.localeCompare(a.monday)).slice(0, short ? 4 : 8)
      .map(w => ({ monday: w.monday, ...weekFields(s, w.monday, w.monday === week.monday ? led.card : cardAfterWeek(s, ledIn, w.monday)), ...(w.topUp ? { topUp: r0(w.topUp) } : {}), ...(w.transferred ? { transferred: r0(w.transferred) } : {}) })),
    bridge: bridgeOut(s),
    ...((s.checkups ?? []).length ? { checkups: s.checkups!.slice(-4).map(c => ({ date: c.date, monday: c.monday, expected: c.expected, actual: c.actual, topUp: c.topUp, toReserve: c.toReserve })) } : {}),
    checklist: s.checklist.map(c => ({ ...c, done: s.checks[c.id]?.done ?? !!c.done })),
    ...(short ? {} : { strategy: s.strategy, rules: s.rules }),
  };
}

/* ---------- Разбор ответа чата ---------- */

/** Прежний формат «kurs-plan»: если в проекте осталась старая инструкция */
interface LegacyPlan {
  app: 'kurs-plan';
  summary?: string;
  strategy?: StrategySection[];
  checklist?: ChecklistItem[];
  rules?: string[];
  phases?: Phase[];
  categories?: Partial<Record<CategoryId, { limit?: number; baseline?: number }>>;
  bonusRules?: Record<string, BonusRule>;
  shortfallOverrides?: Record<string, number>;
  weeklyOverrides?: WeeklyOverride[];
  debts?: ExchangeFile['debts'];
  fixed?: FixedItem[];
  incomes?: IncomeTemplate[];
  events?: ExchangeFile['events'];
  payments?: { debtId: string; month: string; amount?: number; date?: string }[];
  reserve?: number;
}

export type Parsed = { kind: 'v2'; file: ExchangeFile } | { kind: 'v1'; plan: LegacyPlan };

/** Достаёт файл обмена из текста: целиком, из блока ```json или первый {...} */
export function parseExchange(text: string): Parsed | null {
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/g;
  for (let m = fence.exec(text); m; m = fence.exec(text)) candidates.push(m[1]);
  candidates.push(text);
  const i = text.indexOf('{'), j = text.lastIndexOf('}');
  if (i >= 0 && j > i) candidates.push(text.slice(i, j + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim());
      if (v?.app === EXCHANGE_APP) return { kind: 'v2', file: v as ExchangeFile };
      if (v?.app === 'kurs-plan') return { kind: 'v1', plan: v as LegacyPlan };
    } catch { /* следующий кандидат */ }
  }
  return null;
}

/** Старый формат в новый: «fixed» и «checklist» там были полными списками — недостающее удаляем */
export function normalize(p: Parsed, s: ExchangeState): ExchangeFile {
  if (p.kind === 'v2') return p.file;
  const v = p.plan;
  return {
    app: EXCHANGE_APP, version: 2, from: 'chat', summary: v.summary,
    limits: (v.phases || v.categories || v.bonusRules || v.shortfallOverrides || v.weeklyOverrides)
      ? { phases: v.phases, categories: v.categories, bonusRules: v.bonusRules, shortfall: v.shortfallOverrides, weekly: v.weeklyOverrides } : undefined,
    debts: v.debts,
    fixed: v.fixed && [...v.fixed, ...s.fixed.filter(f => !v.fixed!.some(x => x.id === f.id)).map(f => ({ id: f.id, delete: true }))],
    incomes: v.incomes,
    events: v.events,
    calendar: v.payments?.map(x => ({ key: `pay:${x.debtId}:${x.month}`, amount: x.amount, date: x.date })),
    reserve: v.reserve,
    checklist: v.checklist && [...v.checklist, ...s.checklist.filter(c => !v.checklist!.some(x => x.id === c.id)).map(c => ({ id: c.id, delete: true }))],
    strategy: v.strategy,
    rules: v.rules,
  };
}

/* ---------- Разница и применение ---------- */

export type SectionId = 'limits' | 'bridge' | 'fixed' | 'incomes' | 'debts' | 'events' | 'calendar' | 'expenses' | 'money' | 'accountBook' | 'work' | 'checklist' | 'strategy';

export interface ExchangeSection {
  id: SectionId;
  title: string;
  lines: string[];
}

interface Ctx { now: string; newId: () => string; at: string; only: Set<SectionId> | null }
type Step = (f: ExchangeFile, s: ExchangeState, ctx: Ctx) => { lines: string[]; patch: Partial<ExchangeState> };

const money = (n: number) => rub(n);
const arrow = (a: string, b: string) => `${a} → ${b}`;

const stepLimits: Step = (f, s) => {
  const L = f.limits;
  const lines: string[] = [];
  const patch: Partial<ExchangeState> = {};
  if (!L) return { lines, patch };
  if (Array.isArray(L.weekly) && (L.weekly.length || f.protocolVersion !== '2.7')) {
    let next = L.weekly.filter(w => isDate(w.from) && isDate(w.to) && isNum(w.amount)).sort((a, b) => a.from.localeCompare(b.from));
    if (f.protocolVersion === '2.7') {
      next = [...s.weeklyOverrides.filter(w => !next.some(x => x.from === w.from && x.to === w.to)), ...next].sort((a, b) => a.from.localeCompare(b.from));
    }
    if (!same(next, [...s.weeklyOverrides].sort((a, b) => a.from.localeCompare(b.from)))) {
      for (const w of next) {
        const cur = s.weeklyOverrides.find(x => x.from === w.from && x.to === w.to);
        if (!cur) lines.push(`Недельный лимит ${ddmm(w.from)}–${ddmm(w.to)}: ${money(w.amount)}`);
        else if (cur.amount !== w.amount) lines.push(`Недельный лимит ${ddmm(w.from)}–${ddmm(w.to)}: ${arrow(money(cur.amount), money(w.amount))}`);
      }
      for (const w of s.weeklyOverrides) if (!next.some(x => x.from === w.from && x.to === w.to)) lines.push(`Убран особый лимит ${ddmm(w.from)}–${ddmm(w.to)}`);
      patch.weeklyOverrides = next;
    }
  }
  if (Array.isArray(L.weeklyDefaults)) {
    const existing = patch.weeklyOverrides ?? s.weeklyOverrides;
    const next = [...existing];
    for (const w of L.weeklyDefaults) {
      if (!w || !validDate(w.from) || !validDate(w.to) || w.from > w.to || !validAmount(w.amount) || w.amount <= 0
          || next.some(e => e.from <= w.to && w.from <= e.to)) continue;
      next.push(w);
      lines.push(`Предложение для недель ${ddmm(w.from)}–${ddmm(w.to)}: ${money(w.amount)}`);
    }
    if (next.length !== existing.length) patch.weeklyOverrides = next.sort((a, b) => a.from.localeCompare(b.from));
  }
  const base = s.plan ?? DEFAULT_PLAN;
  let plan: PlanConfig = base;
  const touch = (p: Partial<PlanConfig>) => { plan = { ...plan, ...p }; };
  if (L.defaultWeekly && validDate(L.defaultWeekly.from) && validAmount(L.defaultWeekly.amount) && L.defaultWeekly.amount > 0
      && (!plan.defaultWeekly || plan.defaultWeekly.from <= L.defaultWeekly.from) && !same(plan.defaultWeekly, L.defaultWeekly)) {
    touch({ defaultWeekly: L.defaultWeekly });
    lines.push(`Базовый недельный лимит с ${L.defaultWeekly.from} · ${money(L.defaultWeekly.amount)}. Особые недельные лимиты сохраняются.`);
  }
  if (Array.isArray(L.phases)) {
    const phases = [...plan.phases];
    for (const p of L.phases) {
      const i = phases.findIndex(x => x.id === p.id);
      if (i < 0) {
        if (p.title && isNum(p.weekly) && isNum(p.monthly)) {
          phases.push({ shortfall: 0, closes: [], premiums: '', from: '2000-01', to: '2099-12', ...p } as Phase);
          lines.push(`Новый этап ${p.id}: ${p.title}, ${money(p.weekly)} в неделю`);
        }
        continue;
      }
      const cur = phases[i];
      const changes: string[] = [];
      if (isNum(p.weekly) && p.weekly !== cur.weekly) changes.push(`в неделю ${arrow(money(cur.weekly), money(p.weekly))}`);
      if (isNum(p.monthly) && p.monthly !== cur.monthly) changes.push(`в месяц ${arrow(money(cur.monthly), money(p.monthly))}`);
      if (isNum(p.shortfall) && p.shortfall !== cur.shortfall) changes.push(`нехватка ${arrow(money(cur.shortfall), money(p.shortfall))}`);
      for (const k of ['title', 'premiums', 'from', 'to'] as const) if (p[k] != null && p[k] !== cur[k]) changes.push(k === 'title' ? `название «${p[k]}»` : k === 'premiums' ? 'премии' : `${k === 'from' ? 'начало' : 'конец'} ${p[k]}`);
      if (p.closes && !same(p.closes, cur.closes)) changes.push('что закрывается');
      if (changes.length) {
        phases[i] = { ...cur, ...p } as Phase;
        lines.push(`Этап ${cur.id}: ${changes.join(', ')}`);
      }
    }
    if (!same(phases, plan.phases)) touch({ phases });
  }
  if (L.categories) {
    const categories = { ...plan.categories };
    for (const c of CATEGORIES) {
      const p = L.categories[c.id];
      if (!p) continue;
      const cur = categories[c.id] ?? { limit: 0, baseline: 0 };
      const next = { limit: isNum(p.limit) ? p.limit : cur.limit, baseline: isNum(p.baseline) ? p.baseline : cur.baseline };
      if (next.limit !== cur.limit) lines.push(`${c.name}: лимит ${arrow(money(cur.limit), money(next.limit))} в месяц`);
      if (!same(next, cur)) categories[c.id] = next;
    }
    if (!same(categories, plan.categories)) touch({ categories });
  }
  if (L.bonusRules) {
    const bonusRules = { ...plan.bonusRules };
    for (const [m, rule] of Object.entries(L.bonusRules)) {
      if (same(rule, bonusRules[m])) continue;
      bonusRules[m] = rule;
      lines.push(`Премия ${m}: ${rule.note ?? (rule.targets?.length ? `в ${rule.targets.join(', ')}` : 'в резерв')}`);
    }
    if (!same(bonusRules, plan.bonusRules ?? {})) touch({ bonusRules });
  }
  if (L.shortfall) {
    const shortfallOverrides = { ...plan.shortfallOverrides };
    for (const [m, v] of Object.entries(L.shortfall)) {
      if (!isNum(v) || shortfallOverrides[m] === v) continue;
      lines.push(`Нехватка зарплаты в ${m}: ${money(v)}`);
      shortfallOverrides[m] = v;
    }
    if (!same(shortfallOverrides, plan.shortfallOverrides ?? {})) touch({ shortfallOverrides });
  }
  if (plan !== base) patch.plan = plan;
  return { lines, patch };
};

const stepFixed: Step = (f, s) => {
  const lines: string[] = [];
  if (!f.fixed) return { lines, patch: {} };
  let list = [...s.fixed];
  for (const p of f.fixed) {
    const id = p.id ?? list.find(x => x.name === p.name)?.id;
    const i = id ? list.findIndex(x => x.id === id) : -1;
    if (p.delete) {
      if (i >= 0) { lines.push(`Удалить: ${list[i].name}`); list = list.filter((_, k) => k !== i); }
      continue;
    }
    if (i >= 0) {
      const cur = list[i];
      const changes: string[] = [];
      if (isNum(p.amount) && p.amount !== cur.amount) changes.push(arrow(money(cur.amount), money(p.amount)));
      if (isNum(p.day) && p.day !== cur.day) changes.push(`${cur.day}-го → ${p.day}-го`);
      if (p.name && p.name !== cur.name) changes.push(`название «${p.name}»`);
      if (p.from && p.from !== cur.from) changes.push(`с ${p.from}`);
      if (p.note != null && p.note !== cur.note) changes.push('пояснение');
      if (changes.length) {
        list[i] = { ...cur, ...p, id: cur.id } as FixedItem;
        delete (list[i] as FixedItem & Del).delete;
        lines.push(`${cur.name}: ${changes.join(', ')}`);
      }
    } else if (p.name && isNum(p.day) && isNum(p.amount)) {
      const item: FixedItem = { id: p.id ?? `chat-${hash(p.name)}`, name: p.name, day: p.day, amount: p.amount, ...(p.from ? { from: p.from } : {}), ...(p.note ? { note: p.note } : {}) };
      list.push(item);
      lines.push(`Новый: ${item.name}, ${item.day}-го, ${money(item.amount)}`);
    }
  }
  return { lines, patch: lines.length ? { fixed: list } : {} };
};

const INCOME_KINDS = ['salary', 'bonusMonthly', 'advance', 'bonusQuarter', 'bonusYear', 'vacation', 'thirteenth', 'other'];
const stepIncomes: Step = (f, s) => {
  if (!Array.isArray(f.incomes)) return { lines: [], patch: {} };
  const next = f.incomes.filter(i => i.name && isNum(i.day) && isNum(i.amount)).map(i => ({ ...i, kind: INCOME_KINDS.includes(i.kind) ? i.kind : 'other' }) as IncomeTemplate);
  if (same(next, s.incomes)) return { lines: [], patch: {} };
  return {
    lines: next.map(i => `${i.name}: ${i.day}-го, ${money(i.amount)}${i.months ? ` (месяцы ${i.months.join(', ')})` : ''}`),
    patch: { incomes: next },
  };
};

const KINDS: DebtKind[] = ['micro', 'installment', 'card', 'split', 'loan'];
const stepDebts: Step = (f, s, ctx) => {
  const lines: string[] = [];
  if (!f.debts) return { lines, patch: {} };
  const debts = [...s.debts];
  const overrides = { ...s.overrides };
  let overridesChanged = false;
  for (const p of f.debts) {
    const i = debts.findIndex(x => x.id === p.id);
    if (i < 0) {
      if (p.name && isNum(p.balance) && isNum(p.rate)) {
        debts.push({
          id: p.id, name: p.name, short: p.short ?? p.name, kind: p.kind && KINDS.includes(p.kind) ? p.kind : 'card', balance: p.balance, startBalance: p.balance,
          rate: p.rate, dueDay: p.dueDay ?? 1, rule: p.minPayment ? { type: 'fixed', amount: p.minPayment } : { type: 'interestPlus', share: 0.03 },
          frozen: true, order: p.order ?? debts.length + 1, phase: p.phase, closed: false, targetClose: p.targetClose, note: p.note,
        });
        lines.push(`Новый долг «${p.name}»: ${money(p.balance)} под ${(p.rate * 100).toFixed(1).replace('.', ',').replace(',0', '')}%`);
      }
      continue;
    }
    const cur = debts[i];
    const changes: string[] = [];
    const next: Debt = { ...cur };
    if (isNum(p.balance) && Math.abs(p.balance - cur.balance) >= 1) {
      changes.push(`остаток ${arrow(money(cur.balance), money(p.balance))}`);
      next.balance = Math.max(0, p.balance);
      next.updatedAt = ctx.at;
      next.closed = next.balance <= 0.5;
      next.closedOn = next.closed ? (cur.closedOn ?? ctx.now) : undefined;
    }
    if (p.closed === true && !cur.closed) { changes.push('закрыт'); Object.assign(next, { closed: true, balance: 0, closedOn: p.closedOn ?? ctx.now, updatedAt: ctx.at }); }
    if (isNum(p.rate) && p.rate !== cur.rate) { changes.push(`ставка ${(p.rate * 100).toFixed(1).replace('.', ',').replace(',0', '')}%`); next.rate = p.rate; }
    if (p.dueDay != null && p.dueDay !== cur.dueDay) { changes.push(`платёж ${p.dueDay === 'last' ? 'в конце месяца' : `${p.dueDay}-го`}`); next.dueDay = p.dueDay; }
    for (const k of ['name', 'short', 'targetClose', 'note'] as const) if (p[k] != null && p[k] !== cur[k]) { changes.push(k === 'targetClose' ? `закрыть ${p[k]}` : k === 'note' ? 'пояснение' : `название «${p[k]}»`); next[k] = p[k]; }
    for (const k of ['order', 'phase', 'limit'] as const) if (isNum(p[k]) && p[k] !== cur[k]) { changes.push(k === 'order' ? `очередь ${p[k]}` : k === 'phase' ? `этап ${p[k]}` : `лимит ${money(p[k]!)}`); next[k] = p[k]; }
    if (isNum(p.minPayment)) {
      // ближайший платёж по этому долгу
      const e = eventsBetween(s, ctx.now, addDays(ctx.now, 45)).find(x => x.debtId === cur.id && x.kind === 'payment' && !s.marks[x.key]?.done);
      if (e && Math.abs(e.amount - p.minPayment) >= 1) {
        overrides[e.key] = { ...overrides[e.key], amount: p.minPayment };
        overridesChanged = true;
        changes.push(`платёж ${ddmm(e.date)}: ${arrow(money(e.amount), money(p.minPayment))}`);
      }
    }
    if (changes.length) { debts[i] = next; lines.push(`${cur.short}: ${changes.join(', ')}`); }
  }
  const patch: Partial<ExchangeState> = {};
  if (lines.length) patch.debts = debts;
  if (overridesChanged) patch.overrides = overrides;
  return { lines, patch };
};

const stepEvents: Step = (f, s) => {
  const lines: string[] = [];
  if (!f.events) return { lines, patch: {} };
  let list = [...s.oneOff];
  for (const p of f.events) {
    const i = p.key ? list.findIndex(x => x.key === p.key) : -1;
    if (p.delete) {
      // без key удалить можно по названию: все разовые события с таким названием
      const del = i >= 0 ? [i] : !p.key && p.title ? list.map((x, k) => (x.title.toLowerCase() === p.title!.toLowerCase() ? k : -1)).filter(k => k >= 0) : [];
      for (const k of del) lines.push(`Удалить: ${ddmm(list[k].date)} ${list[k].title}`);
      list = list.filter((_, k) => !del.includes(k));
      continue;
    }
    if (i >= 0) {
      const cur = list[i];
      const changes: string[] = [];
      if (isDate(p.date) && p.date !== cur.date) changes.push(`дата ${arrow(ddmm(cur.date), ddmm(p.date))}`);
      if (isNum(p.amount) && Math.abs(p.amount - cur.amount) >= 1) changes.push(arrow(money(cur.amount), money(p.amount)));
      if (p.title && p.title !== cur.title) changes.push(`«${p.title}»`);
      if (p.note != null && p.note !== cur.note) changes.push('пояснение');
      if (changes.length) {
        list[i] = { ...cur, ...(isDate(p.date) ? { date: p.date } : {}), ...(isNum(p.amount) ? { amount: p.amount } : {}), ...(p.title ? { title: p.title } : {}), ...(p.note != null ? { note: p.note } : {}), ...(p.dateMode ? { dateMode: p.dateMode } : {}) };
        lines.push(`${cur.title}: ${changes.join(', ')}`);
      }
    } else if (isDate(p.date) && p.title && isNum(p.amount) && p.amount > 0) {
      const kind = p.kind === 'income' ? 'income' : 'payment';
      const key = p.key ?? `chat:${hash(`${p.date}|${p.title}|${p.amount}`)}`;
      if (list.some(x => x.key === key)) continue;
      list.push({ key, date: p.date, dateMode: p.dateMode ?? 'exact', kind, title: p.title, amount: p.amount, debtId: p.debtId, note: p.note });
      lines.push(`${kind === 'income' ? 'Поступление' : 'Платёж'} ${ddmm(p.date)}: ${p.title}, ${money(p.amount)}`);
    }
  }
  return { lines, patch: lines.length ? { oneOff: list.sort((a, b) => a.date.localeCompare(b.date)) } : {} };
};

const stems = (t: string) => t.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(w => w.length >= 4).map(w => w.slice(0, 5));

/** Событие календаря по key, а если чат key не знает — по словам названия, дате (±7 дней) и сумме */
function findEvent(p: NonNullable<ExchangeFile['calendar']>[number], list: CalEvent[], byKey: Map<string, CalEvent>): CalEvent | undefined {
  if (p.key && byKey.has(p.key)) return byKey.get(p.key);
  const want = p.title ? stems(p.title) : [];
  const sum = isNum(p.paid) ? p.paid : p.amount;
  if (!want.length && !isNum(sum)) return undefined;
  let best: CalEvent | undefined, bestScore = 0;
  for (const e of list) {
    if (e.kind === 'weekly' || (p.kind && p.kind !== e.kind)) continue;
    const far = isDate(p.date) ? Math.abs(daysBetween(e.date, p.date)) : 0;
    if (far > 7) continue;
    const have = stems(e.title);
    const words = want.filter(w => have.includes(w)).length;
    const sameSum = isNum(sum) && Math.abs(e.amount - sum) < 1;
    if (want.length ? !words : !sameSum) continue;
    const score = words * 10 + (sameSum ? 5 : 0) - far * 0.5 + 4;
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best;
}

const stepCalendar: Step = (f, s, ctx) => {
  const lines: string[] = [];
  if (!f.calendar) return { lines, patch: {} };
  const list = eventsBetween(s, addDays(ctx.now, -120), addDays(ctx.now, 400));
  const known = new Map(list.map(e => [e.key, e]));
  const marks = { ...s.marks };
  const overrides = { ...s.overrides };
  let mc = false, oc = false;
  for (const p of f.calendar) {
    if ((p.resetAmount || p.projection || p.economicType === 'non_income') && (!p.key || !known.has(p.key))) {
      lines.push(`Не найден точный ключ ${p.key ?? ''}, изменение пропущено`);
      continue;
    }
    const e = findEvent(p, list, known);
    if (!e) {
      if (p.key || p.title) lines.push(`Не нашёл в календаре: ${p.title ?? p.key}${isDate(p.date) ? ` ${ddmm(p.date)}` : ''}, пропускаю`);
      continue;
    }
    const name = `${e.title} ${ddmm(e.date)}`;
    if (p.reset) {
      if (overrides[e.key]) { delete overrides[e.key]; oc = true; lines.push(`${name}: вернуть расчётные сумму и дату`); }
      continue;
    }
    const mark = marks[e.key];
    const recorded = s.accountBook?.operations.find(op => op.eventKey === e.key && op.status === 'confirmed');
    const historical = s.accountBook?.historicalLoans?.find(op => op.eventKey === e.key);
    if ((recorded || historical) && (p.done === false || (p.done === true &&
        ((p.paid != null && p.paid !== (recorded ?? historical)?.amount) || (p.paidDate && p.paidDate !== (recorded ?? historical)?.date))))) {
      lines.push(`${name}: даты и суммы подтверждённой операции меняются в журнале`);
      continue;
    }
    if (p.done === true && !mark?.done && (e.payroll?.documented || e.projection === 'internal_transfer')) {
      lines.push(`${name}: эта строка не создаёт движения денег`);
      continue;
    }
    if (p.done === true) {
      const paid = isNum(p.paid) ? p.paid : mark?.done && mark.amount != null ? mark.amount : isNum(p.amount) ? p.amount : e.amount;
      // день фактической оплаты: из файла (paidDate); у уже отмеченного — прежний; у новой отметки — день импорта
      const paidDate = isDate(p.paidDate) ? p.paidDate : mark?.done ? paidOn(e, mark) : ctx.now;
      if (!mark?.done || Math.abs((mark.amount ?? e.amount) - paid) >= (f.protocolVersion === '2.7' ? 0.01 : 1) || paidDate !== paidOn(e, mark)) {
        marks[e.key] = { ...mark, done: true, amount: paid, at: ctx.at, paidDate, ...(p.paidFrom === 'card' || p.paidFrom === 'reserve' ? { paidFrom: p.paidFrom } : {}) };
        mc = true;
        lines.push(`${name}: ${e.kind === 'income' ? 'пришло' : 'оплачено'} ${money(paid)}${paidDate !== e.date ? ` (${ddmm(paidDate)})` : ''}`);
        // платёж по долгу с кредитки — против правил плана: отмечаем, но предупреждаем
        if ((p.paidFrom as string) === 'credit' && e.debtId) lines.push(`⚠ ${name}: платёж по долгу с кредитки — так нельзя по правилам плана`);
      }
    } else if (p.done === false && mark?.done) {
      delete marks[e.key];
      mc = true;
      lines.push(`${name}: снять отметку`);
    }
    if (p.done !== true) {
      const o = { ...overrides[e.key] };
      const changes: string[] = [];
      if (p.resetAmount && !mark?.done && o.amount != null) { delete o.amount; changes.push('вернуть расчётную сумму'); }
      if (!p.resetAmount && isNum(p.amount) && Math.abs(p.amount - e.amount) >= 1) { o.amount = p.amount; changes.push(`сумма ${arrow(money(e.amount), money(p.amount))}`); }
      if (isDate(p.date) && p.date !== e.date) { o.date = p.date; changes.push(`дата ${arrow(ddmm(e.date), ddmm(p.date))}`); }
      if (['conditional', 'internal_transfer', 'review'].includes(p.projection ?? '') && o.projection !== p.projection) {
        o.projection = p.projection; changes.push(p.projection === 'conditional' ? 'только при подтверждении условий' :
          p.projection === 'internal_transfer' ? 'внутренний перевод без расхода' : 'предварительно, нужна сверка');
      }
      if (p.economicType === 'non_income' && e.kind === 'income' && o.economicType !== 'non_income') {
        o.economicType = 'non_income'; changes.push('исключить из доходов, сохранить денежную историю');
      }
      if (changes.length) {
        if (Object.keys(o).length) overrides[e.key] = o; else delete overrides[e.key];
        oc = true; lines.push(`${name}: ${changes.join(', ')}`);
      }
    }
  }
  return { lines, patch: { ...(mc ? { marks } : {}), ...(oc ? { overrides } : {}) } };
};

const SOURCES: Source[] = ['life', 'reserve', 'credit'];
const SOURCE_NAME: Record<Source, string> = { life: 'карта жизни', reserve: 'резерв', credit: 'кредитка' };
const catName = (c: string) => CATEGORY[c as CategoryId]?.short ?? c;

/** Одна и та же трата: та же дата и сумма. Продавца и категорию банк, приложение и чат пишут по-разному. */
const sameSpend = (a: { date: string; amount: number }, b: { date?: string; amount?: number }) =>
  a.date === b.date && b.amount != null && Math.abs(a.amount - b.amount) < 1;

/** Повторы, которые раньше добавлял файл из чата: трата из чата и трата с той же датой и суммой, внесённые в разное время.
 *  Остаётся более ранняя; две одинаковые траты из одного файла (две поездки по 95 ₽) не трогаются. */
export function dropChatTwins(expenses: Expense[]): { expenses: Expense[]; removed: Expense[] } {
  const kept: Expense[] = [];
  const removed: Expense[] = [];
  const matched = new Set<string>();
  for (const e of [...expenses].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))) {
    const twin = kept.find(t => !matched.has(t.id) && sameSpend(t, e) && (t.origin === 'chat' || e.origin === 'chat') && (t.createdAt ?? '') < (e.createdAt ?? ''));
    if (twin) { matched.add(twin.id); removed.push(e); } else kept.push(e);
  }
  const drop = new Set(removed.map(e => e.id));
  return { expenses: expenses.filter(e => !drop.has(e.id)), removed };
}

const stepExpenses: Step = (f, s, ctx) => {
  const lines: string[] = [];
  if (!Array.isArray(f.expenses)) return { lines, patch: {} };
  let list = [...s.expenses];
  // каждая трата приложения закрывает одну строку файла: две поездки по 95 ₽ в файле при одной в приложении — одна новая
  const matched = new Set<string>();
  const validCat = (c?: string): c is CategoryId => !!c && c in CATEGORY;
  const strict = f.protocolVersion === '2.7';
  const knownAccounts = new Set(accountOptions(s.accountBook ?? EMPTY_BOOK).map(a => a.id));
  if ((!ctx.only || ctx.only.has('accountBook')) && Array.isArray(f.accountBook?.accounts)) {
    for (const a of f.accountBook.accounts) if (a && typeof a.id === 'string' && typeof a.name === 'string' && validBankBalance(a.balance)) knownAccounts.add(a.id);
  }
  for (const p of f.expenses) {
    if (!p) continue;
    if (strict && p.accountId && !knownAccounts.has(p.accountId)) {
      lines.push(`Трата ${p.id ?? p.date ?? ''}: добавьте заявленный счёт вместе с покупкой`.trim());
      continue;
    }
    const i = list.findIndex(x => (p.id && x.id === p.id) || (p.fingerprint && x.fingerprint === p.fingerprint && x.accountId === p.accountId && x.source === (p.source ?? 'life')));
    if (p.delete) {
      if (i >= 0) { const e = list[i]; lines.push(`Удалить: ${ddmm(e.date)} ${e.note || catName(e.category)}, ${money(e.amount)}`); list = list.filter((_, k) => k !== i); }
      continue;
    }
    if (i >= 0) {
      const cur = list[i];
      matched.add(cur.id);
      const changes: string[] = [];
      const next: Expense = { ...cur };
      if (isNum(p.amount) && Math.abs(p.amount - cur.amount) >= 0.01) { changes.push(arrow(money(cur.amount), money(p.amount))); next.amount = p.amount; }
      if (isDate(p.date) && p.date !== cur.date) { changes.push(`дата ${arrow(ddmm(cur.date), ddmm(p.date))}`); next.date = p.date; }
      if (validCat(p.category) && p.category !== cur.category) { changes.push(`${catName(cur.category)} → ${catName(p.category)}`); next.category = p.category; }
      if (p.note != null && p.note !== (cur.note ?? '')) { changes.push(`«${p.note}»`); next.note = p.note || undefined; }
      if (p.source && SOURCES.includes(p.source) && p.source !== cur.source) { changes.push(SOURCE_NAME[p.source]); next.source = p.source; }
      if (p.creditCard && p.creditCard !== cur.creditCard) { changes.push(`кредитка ${p.creditCard}`); next.creditCard = p.creditCard; }
      if (strict && p.accountId && p.accountId !== cur.accountId && knownAccounts.has(p.accountId)) { next.accountId = p.accountId; changes.push('счёт'); }
      if (strict && (p.fundingSource === 'own' || p.fundingSource === 'borrowed' || p.fundingSource === 'unknown') && p.fundingSource !== cur.fundingSource) { next.fundingSource = p.fundingSource; changes.push('источник денег'); }
      if (strict && p.occurredAt && Number.isFinite(Date.parse(p.occurredAt)) && cur.occurredAt !== p.occurredAt) { next.occurredAt = p.occurredAt; changes.push('время'); }
      if (changes.length) { list[i] = next; lines.push(`${ddmm(cur.date)} ${cur.note || catName(cur.category)}: ${changes.join(', ')}`); }
      continue;
    }
    if (!isDate(p.date) || !isNum(p.amount) || p.amount <= 0) continue;
    // dup — заведомо вторая такая же трата (вторая поездка в метро за день): повтором не считается
    if (strict && !p.id && !p.fingerprint && !p.occurredAt) {
      const ambiguous = s.expenses.some(x => sameSpend(x, p) && x.source === (p.source ?? 'life') && x.accountId === p.accountId);
      if (ambiguous || p.dup) { lines.push(`Уже есть похожая трата ${ddmm(p.date)} · ${money(p.amount)}. Для отдельной операции нужен ID, отпечаток или время.`); continue; }
    }
    const twin = p.dup ? undefined : s.expenses.find(x => !matched.has(x.id) && sameSpend(x, p)
      && (!p.source || x.source === p.source) && (!p.creditCard || x.creditCard === p.creditCard)
      && (!strict || (!p.id && (p.occurredAt ? x.occurredAt === p.occurredAt : !p.fingerprint) && x.accountId === p.accountId)));
    if (twin) { matched.add(twin.id); lines.push(`Уже есть: ${ddmm(p.date)} ${twin.note || catName(twin.category)}, ${money(p.amount)}`); continue; }
    const category: CategoryId = validCat(p.category) ? p.category : (p.note && categorize(p.note)) || 'shopping';
    list.push({
      id: p.id || ctx.newId(), date: p.date, amount: p.amount, category, ...(p.note ? { note: p.note } : {}),
      source: p.source && SOURCES.includes(p.source) ? p.source : 'life', ...(p.source === 'credit' && p.creditCard ? { creditCard: p.creditCard } : {}), origin: 'chat', createdAt: ctx.at,
      ...(strict && p.accountId && knownAccounts.has(p.accountId) ? { accountId: p.accountId } : {}),
      ...(strict && p.occurredAt && Number.isFinite(Date.parse(p.occurredAt)) ? { occurredAt: p.occurredAt } : {}),
      ...(strict && p.fingerprint ? { fingerprint: p.fingerprint } : {}),
      ...(strict && (p.fundingSource === 'own' || p.fundingSource === 'borrowed' || p.fundingSource === 'unknown') ? { fundingSource: p.fundingSource } : {}),
    });
    lines.push(`Новая: ${ddmm(p.date)} ${catName(category)}${p.note ? ` (${p.note})` : ''}, ${money(p.amount)}`);
  }
  const changed = lines.some(l => !l.startsWith('Уже есть'));
  return { lines, patch: changed ? { expenses: list.sort((a, b) => a.date.localeCompare(b.date)) } : {} };
};

/** Мост на кредитке: присылается целиком; used и left из выгрузки — факт, их не применяем */
const stepBridge: Step = (f, s) => {
  const lines: string[] = [];
  if (f.bridge === undefined || f.bridge === null) return { lines, patch: {} };
  if (f.bridge.closed) {
    if (s.bridge && !s.bridge.closed) { lines.push('Мост на кредитке закрыт'); return { lines, patch: { bridge: { ...s.bridge, closed: true } } }; }
    return { lines, patch: {} };
  }
  const b = f.bridge;
  const weeks = (Array.isArray(b.weeks) ? b.weeks : [])
    .filter(w => isDate(w.monday) && isNum(w.fromReserve) && isNum(w.fromCredit))
    .map(w => ({ monday: w.monday, fromReserve: w.fromReserve, fromCredit: w.fromCredit }))
    .sort((a, c) => a.monday.localeCompare(c.monday));
  if (!weeks.length || !isNum(b.cap)) return { lines: ['Мост: нет недель или общего лимита — пропускаю'], patch: {} };
  const next: Bridge = {
    card: typeof b.card === 'string' && b.card ? b.card : 'sber-card', cap: b.cap, weeks,
    ...(isDate(b.repayBy) ? { repayBy: b.repayBy } : {}), ...(typeof b.repayNote === 'string' && b.repayNote ? { repayNote: b.repayNote } : {}),
  };
  if (s.bridge && !s.bridge.closed && same(s.bridge, next)) return { lines, patch: {} };
  const card = s.debts.find(d => d.id === next.card)?.short ?? next.card;
  lines.push(`Мост на кредитке ${card}: не больше ${money(next.cap)}${next.repayBy ? `, погасить до ${ddmm(next.repayBy)}` : ''}`);
  for (const w of weeks) lines.push(`Неделя с ${ddmm(w.monday)}: из резерва ${money(w.fromReserve)}, с кредитки до ${money(w.fromCredit)}`);
  return { lines, patch: { bridge: next } };
};

const stepMoney: Step = (f, s) => {
  const lines: string[] = [];
  const patch: Partial<ExchangeState> = {};
  if (isNum(f.reserve) && Math.abs(f.reserve - s.reserve) >= 1) { lines.push(`Резерв: ${arrow(money(s.reserve), money(f.reserve))}`); patch.reserve = f.reserve; }
  if (isNum(f.savings) && Math.abs(f.savings - s.savings) >= 1) { lines.push(`Копилка недельных остатков: ${arrow(money(s.savings), money(f.savings))}`); patch.savings = f.savings; }
  if (f.card && isNum(f.card.amount) && isDate(f.card.date) && (!s.cardBalance || Math.abs(s.cardBalance.amount - f.card.amount) >= 1 || s.cardBalance.date !== f.card.date)) {
    lines.push(`Зарплатная карта: ${money(f.card.amount)} на ${ddmm(f.card.date)}`);
    patch.cardBalance = { amount: f.card.amount, date: f.card.date, source: 'manual' };
  }
  return { lines, patch };
};

const stepAccountBook: Step = (f, s, ctx) => {
  const incoming = f.accountBook;
  const lines: string[] = [];
  if (!incoming || typeof incoming !== 'object') return { lines, patch: {} };
  const base = s.accountBook ?? EMPTY_BOOK;
  const accounts = [...base.accounts];
  for (const item of Array.isArray(incoming.accounts) ? incoming.accounts : []) {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !item.name.trim() ||
        [LIFE_ACCOUNT, RESERVE_ACCOUNT].includes(item.id) || !validBankBalance(item.balance)) continue;
    const i = accounts.findIndex(a => a.id === item.id);
    const old = accounts[i];
    const incomingTime = item.balance?.at ?? item.balance?.date ?? '';
    const oldTime = old?.balance?.at ?? old?.balance?.date ?? '';
    const balance = incomingTime && incomingTime >= oldTime ? item.balance : old?.balance;
    const next: CashAccount = { id: item.id, name: item.name.trim(), balance };
    if (same(old, next)) continue;
    if (i < 0) accounts.push(next); else accounts[i] = next;
    lines.push(`Счёт ${next.name}${balance ? ` · сверка ${balance.date}, ${money(balance.amount)}` : ''}`);
  }
  let book = { ...base, accounts };
  if (Array.isArray(incoming.historicalLoans)) {
    const history = new Map((book.historicalLoans ?? []).map(loan => [loan.eventKey, loan]));
    for (const loan of incoming.historicalLoans) {
      if (!loan || typeof loan.eventKey !== 'string' || history.has(loan.eventKey) ||
          !validDate(loan.date) || loan.date > ctx.now || !validAmount(loan.amount) || loan.amount <= 0 ||
          !s.debts.some(d => d.id === loan.debtId)) continue;
      const event = s.oneOff.find(e => e.key === loan.eventKey && e.kind === 'income');
      const mark = s.marks[loan.eventKey];
      const recorded = book.operations.find(op => op.eventKey === loan.eventKey);
      if (recorded || !event || !mark?.done || paidOn(event, mark) !== loan.date ||
          cents(mark.amount ?? event.amount) !== cents(loan.amount)) {
        lines.push(`Классификация ${loan.eventKey} пропущена: сверьте отметку или существующую операцию`);
        continue;
      }
      history.set(loan.eventKey, { eventKey: loan.eventKey, debtId: loan.debtId, date: loan.date, amount: loan.amount });
      lines.push(`Полученный заём ${ddmm(loan.date)} · ${money(loan.amount)} · категория без движения денег`);
    }
    if (history.size !== (base.historicalLoans?.length ?? 0)) book = { ...book, historicalLoans: [...history.values()] };
  }
  if (incoming.creditChargeKinds && typeof incoming.creditChargeKinds === 'object') {
    const creditChargeKinds = { ...book.creditChargeKinds };
    for (const expense of s.expenses) {
      if (expense.source !== 'credit') continue;
      const kind = incoming.creditChargeKinds[expense.id];
      if ((kind !== 'fee' && kind !== 'interest') || creditChargeKinds[expense.id] === kind) continue;
      creditChargeKinds[expense.id] = kind;
      lines.push(`Списание по кредитке ${ddmm(expense.date)} · ${money(expense.amount)} · ${kind === 'fee' ? 'комиссия' : 'проценты'}`);
    }
    if (!same(creditChargeKinds, book.creditChargeKinds ?? {})) book = { ...book, creditChargeKinds };
  }
  if (Array.isArray(incoming.splitPlans)) for (const p of incoming.splitPlans) {
    if (!validSplitPlan(p, s.debts) || same(book.splitPlans.find(x => x.id === p.id), p)) continue;
    book = { ...book, splitPlans: [...book.splitPlans.filter(x => x.id !== p.id), p] };
    lines.push(`План Сплита ${p.name} · ${p.schedule.length} строк графика`);
  }
  if (Array.isArray(incoming.splitDebits)) for (const d of incoming.splitDebits) {
    if (!validSplitDebit(d, book, s.debts) || same(book.splitDebits.find(x => x.id === d.id), d) || s.marks[`split-debit:${d.id}`]?.done
        || d.replacesKeys.some(key => s.marks[key]?.done)) continue;
    book = { ...book, splitDebits: [...book.splitDebits.filter(x => x.id !== d.id), d] };
    lines.push(`Автосписание Сплита ${d.date} · ${money(d.amount)} · заменяет строк ${d.replacesKeys.length}`);
  }
  if (Array.isArray(incoming.loanReviews)) {
    const reviews = new Map((book.loanReviews ?? []).map(r => [r.id, r]));
    for (const review of incoming.loanReviews) {
      if (!validLoanReview(review) || reviews.has(review.id)) continue;
      reviews.set(review.id, review);
      lines.push(`К сверке: ${review.label} · ${money(review.amount)} · ${review.from}–${review.to}`);
    }
    if (reviews.size > (book.loanReviews?.length ?? 0)) book = { ...book, loanReviews: [...reviews.values()] };
  }
  const accountsById = new Set(accountOptions(book).map(a => a.id));
  if (incoming.paymentAccounts && typeof incoming.paymentAccounts === 'object') {
    const paymentAccounts = { ...book.paymentAccounts };
    for (const [key, value] of Object.entries(incoming.paymentAccounts)) {
      if (!key || ['__proto__', 'prototype', 'constructor'].includes(key) || !accountsById.has(value) || paymentAccounts[key] === value) continue;
      paymentAccounts[key] = value;
      lines.push(`Счёт списания для ${key} · ${accountOptions(book).find(a => a.id === value)?.name}`);
    }
    book = { ...book, paymentAccounts };
  }
  if (incoming.stress && validDate(incoming.stress.date) && validAmount(incoming.stress.amount) && incoming.stress.amount > 0
      && accountsById.has(incoming.stress.accountId) && !same(book.stress, incoming.stress)) {
    book = { ...book, stress: incoming.stress };
    lines.push(`Стресс-сценарий ${incoming.stress.date} · ${money(incoming.stress.amount)}`);
  }
  const marks = { ...s.marks };
  if (Array.isArray(incoming.operations)) for (const op of incoming.operations) {
    if (!bookOperationAllowed(op, book, s.debts, s.expenses) || (op.status === 'confirmed' && op.date > ctx.now) || (op.eventKey && op.type === 'loan_disbursement' && !marks[op.eventKey]?.done)) continue;
    const operations = appendOperations(book.operations, [op]);
    if (operations === book.operations) continue;
    book = { ...book, operations };
    if (op.eventKey && op.status === 'confirmed' && !marks[op.eventKey]) marks[op.eventKey] = {
      done: true, paidDate: op.date, at: op.at ?? new Date(op.date + 'T00:00:00Z').toISOString(), amount: op.amount,
    };
    lines.push(`Операция ${op.type === 'loan_disbursement' ? 'выдача займа' : op.type} · ${op.date} · ${money(op.amount)}${op.eventKey ? ' · связана с календарём' : ''}`);
  }
  return { lines, patch: lines.length ? { accountBook: book, ...(!same(marks, s.marks) ? { marks } : {}) } : {} };
};

const stepWork: Step = (f, s) => {
  const incoming = f.work;
  if (!incoming || typeof incoming !== 'object') return { lines: [], patch: {} };
  const base = s.work;
  const rates = new Map((base?.rates ?? []).map(r => [r.from, r]));
  for (const r of Array.isArray(incoming.rates) ? incoming.rates : []) if (r && validDate(r.from)) rates.set(r.from, r);
  const vacations = new Map((base?.vacations ?? []).map(v => [v.id, v]));
  for (const v of Array.isArray(incoming.vacations) ? incoming.vacations : []) {
    if (!v || typeof v.id !== 'string') continue;
    const old = vacations.get(v.id);
    if (old?.status === 'taken' || (old?.status === 'approved' && v.status === 'planned')) continue;
    vacations.set(v.id, { ...old, ...v });
  }
  const actual = { ...base?.actual };
  for (const [key, record] of Object.entries(incoming.actual ?? {})) {
    const former = actual[key];
    if (!record || (former?.net != null && record.net != null && cents(former.net) !== cents(record.net))) continue;
    actual[key] = { ...record, ...Object.fromEntries(Object.entries(former ?? {}).filter(([, value]) => value != null)) };
  }
  const next: PayrollProfile = {
    from: incoming.from ?? base?.from ?? '',
    rates: [...rates.values()].sort((a, b) => a.from.localeCompare(b.from)),
    accountId: incoming.accountId ?? base?.accountId,
    advancesBy: incoming.advancesBy ?? base?.advancesBy,
    cautiousUnit2027: incoming.cautiousUnit2027 ?? base?.cautiousUnit2027,
    workingHours: { ...base?.workingHours, ...incoming.workingHours },
    absenceHours: { ...base?.absenceHours, ...incoming.absenceHours },
    attendance: { ...base?.attendance, ...incoming.attendance },
    vacations: [...vacations.values()], vacationDaysRemaining: incoming.vacationDaysRemaining ?? base?.vacationDaysRemaining,
    taxBase: { ...base?.taxBase, ...Object.fromEntries(Object.entries(incoming.taxBase ?? {})
      .filter(([year, tax]) => tax && (!base?.taxBase?.[year] || tax.asOf >= base.taxBase[year].asOf))) },
    deductions: { ...base?.deductions, ...incoming.deductions }, actual,
    extras: { ...base?.extras, ...incoming.extras }, payDates: { ...base?.payDates, ...incoming.payDates },
    aliases: { ...base?.aliases, ...incoming.aliases },
  };
  if (!validPayroll(next) || (next.accountId && !accountOptions(s.accountBook ?? EMPTY_BOOK).some(a => a.id === next.accountId))
      || same(base, next)) return { lines: [], patch: {} };
  const details = [
    `Модель начисления с ${next.from}`,
    ...(same(base?.actual ?? {}, actual) ? [] : [`Сверенных сведений о выплатах: ${Object.keys(actual).length}. Остатки не меняются.`]),
    ...next.rates.filter(r => !same(base?.rates.find(a => a.from === r.from), r)).map(r =>
      `Ставка с ${r.from} · расчётная единица ${money(r.unit)} · ${r.confidence === 'confirmed' ? 'сверена' : 'оценка'}`),
    ...(next.vacations ?? []).filter(v => !same(base?.vacations?.find(a => a.id === v.id), v)).map(v =>
      `Отпуск ${v.from} — ${v.to}${v.allowance ? ' · план единовременной выплаты' : ''}`),
  ];
  return { lines: details, patch: { work: next } };
};

const stepChecklist: Step = (f, s, ctx) => {
  const lines: string[] = [];
  if (!f.checklist) return { lines, patch: {} };
  let list = [...s.checklist];
  const checks = { ...s.checks };
  let cc = false, lc = false;
  for (const p of f.checklist) {
    const i = list.findIndex(x => x.id === p.id);
    if (p.delete) {
      if (i >= 0) { lines.push(`Убрать: ${list[i].title}`); list = list.filter((_, k) => k !== i); lc = true; }
      continue;
    }
    const status = p.status && ['review', 'payment', 'clarify'].includes(p.status) ? p.status : undefined;
    const eventKey = typeof p.eventKey === 'string' && p.eventKey ? p.eventKey : undefined;
    if (i < 0) {
      if (!p.title) continue;
      list.push({ id: p.id, title: p.title, ...(status ? { status } : {}), ...(eventKey ? { eventKey } : {}), ...(p.note ? { note: p.note } : {}), ...(p.due ? { due: p.due } : {}) });
      lc = true;
      lines.push(`Новый пункт: ${p.title}${p.due ? `, срок ${p.due}` : ''}`);
    } else {
      const cur = list[i];
      const changes: string[] = [];
      if (p.title && p.title !== cur.title) changes.push(`«${p.title}»`);
      if (p.due !== undefined && p.due !== cur.due) changes.push(`срок ${p.due || 'без срока'}`);
      if (p.note !== undefined && p.note !== cur.note) changes.push('пояснение');
      if (status && status !== cur.status) changes.push('статус');
      if (eventKey && eventKey !== cur.eventKey) changes.push('связанный платёж');
      if (changes.length) {
        list[i] = { ...cur, ...(status ? { status } : {}), ...(eventKey ? { eventKey } : {}), ...(p.title ? { title: p.title } : {}), ...(p.due !== undefined ? { due: p.due || undefined } : {}), ...(p.note !== undefined ? { note: p.note || undefined } : {}) };
        lc = true;
        lines.push(`${cur.title}: ${changes.join(', ')}`);
      }
    }
    if (typeof p.done === 'boolean') {
      const base = list.find(x => x.id === p.id)?.done ?? false;
      const cur = checks[p.id]?.done ?? base;
      if (cur !== p.done) { checks[p.id] = { done: p.done, at: ctx.at }; cc = true; lines.push(`${p.title ?? list.find(x => x.id === p.id)?.title ?? p.id}: ${p.done ? 'выполнено' : 'не выполнено'}`); }
    }
  }
  return { lines, patch: { ...(lc ? { checklist: list } : {}), ...(cc ? { checks } : {}) } };
};

const stepStrategy: Step = (f, s) => {
  const lines: string[] = [];
  const patch: Partial<ExchangeState> = {};
  if (Array.isArray(f.strategy) && !same(f.strategy, s.strategy)) {
    patch.strategy = f.strategy.filter(x => x.title && typeof x.text === 'string');
    lines.push(`Стратегия: ${patch.strategy.length} ${plural(patch.strategy.length, 'раздел', 'раздела', 'разделов')}`);
  }
  if (Array.isArray(f.strategyEdits)) {
    const original = patch.strategy ?? s.strategy;
    const strategy = original.map(section => {
      let text = section.text;
      for (const edit of f.strategyEdits ?? []) {
        if (edit?.title !== section.title || typeof edit.find !== 'string' || !edit.find || typeof edit.replace !== 'string') continue;
        const first = text.indexOf(edit.find);
        if (first >= 0 && first === text.lastIndexOf(edit.find)) text = text.replace(edit.find, () => edit.replace);
      }
      if (section.text === text) return section;
      lines.push(`Стратегия · ${section.title}`);
      return { ...section, text };
    });
    if (!same(strategy, original)) patch.strategy = strategy;
  }
  if (Array.isArray(f.rules) && !same(f.rules, s.rules)) {
    patch.rules = f.rules.filter(r => typeof r === 'string' && r.trim());
    lines.push(`Правила: ${patch.rules.length}`);
  }
  return { lines, patch };
};

const STEPS: [SectionId, string, Step][] = [
  ['limits', 'Лимиты', stepLimits],
  ['bridge', 'Мост на кредитке', stepBridge],
  ['fixed', 'Обязательные платежи', stepFixed],
  ['incomes', 'Поступления по шаблону', stepIncomes],
  ['debts', 'Долги', stepDebts],
  ['events', 'Разовые платежи и поступления', stepEvents],
  ['calendar', 'Отметки и точные суммы', stepCalendar],
  ['expenses', 'Траты', stepExpenses],
  ['money', 'Резерв, копилка, карта', stepMoney],
  ['accountBook', 'Счета, заёмные операции и Сплит', stepAccountBook],
  ['work', 'Работа и отпуска', stepWork],
  ['checklist', 'Чек-лист', stepChecklist],
  ['strategy', 'Стратегия и правила', stepStrategy],
];

function run(f: ExchangeFile, s: ExchangeState, now: string, only: Set<SectionId> | null, newId: () => string) {
  const ctx: Ctx = { now, newId, at: new Date().toISOString(), only };
  let state = s;
  const patch: Partial<ExchangeState> = {};
  const sections: ExchangeSection[] = [];
  for (const [id, title, step] of STEPS) {
    if (only && !only.has(id)) continue;
    const r = step(f, state, ctx);
    // раздел, где всё уже есть в приложении, не показываем: менять в нём нечего
    if (r.lines.some(l => !l.startsWith('Уже есть'))) sections.push({ id, title, lines: r.lines });
    Object.assign(patch, r.patch);
    state = { ...state, ...r.patch };
  }
  return { sections, patch };
}

/** Что изменится — по разделам; пустой список — в файле нет ничего нового */
export function previewExchange(f: ExchangeFile, s: ExchangeState, now: string): ExchangeSection[] {
  return run(f, s, now, null, () => 'preview').sections;
}

/** Изменения выбранных разделов одним патчем состояния */
export function applyExchange(f: ExchangeFile, s: ExchangeState, now: string, only: Set<SectionId>, newId: () => string): Partial<ExchangeState> {
  return run(f, s, now, only, newId).patch;
}

export const exchangeFileName = (now: string) => `Курс — обмен ${now}.json`;

/** Итог файла перед применением, по-человечески: «Траты: +3 (1 234 ₽)», «Отмечено: …», «Резерв: … → …», повторы */
export function exchangeDigest(f: ExchangeFile, s: ExchangeState, now: string): string[] {
  const { sections, patch } = run(f, s, now, null, () => `preview-${Math.random()}`);
  const out: string[] = [];
  if (patch.expenses) {
    const have = new Set(s.expenses.map(e => e.id));
    const added = patch.expenses.filter(e => !have.has(e.id));
    const left = new Set(patch.expenses.map(e => e.id));
    const removed = s.expenses.filter(e => !left.has(e.id)).length;
    if (added.length) out.push(`Траты: +${added.length} (${money(added.reduce((t, e) => t + e.amount, 0))})`);
    if (removed) out.push(`Траты удалены: ${removed}`);
  }
  if (patch.marks) {
    const titles = new Map(eventsBetween(s, addDays(now, -90), addDays(now, 400)).map(e => [e.key, e.title]));
    for (const [k, m] of Object.entries(patch.marks)) {
      if (m.done && !s.marks[k]?.done) out.push(`Отмечено: ${titles.get(k) ?? k}${m.amount != null ? ` — ${money(m.amount)}` : ''}`);
    }
  }
  if (patch.reserve != null) out.push(`Резерв: ${money(s.reserve)} → ${money(patch.reserve)}`);
  if (patch.bridge) out.push(patch.bridge.closed ? 'Мост на кредитке закрыт' : 'Мост: план по неделям');
  const dups = sections.flatMap(x => x.lines).filter(l => l.startsWith('Уже есть')).length;
  if (dups) out.push(`Пропущено как повтор: ${dups}`);
  const warn = sections.flatMap(x => x.lines).filter(l => l.startsWith('⚠'));
  return [...warn, ...out];
}

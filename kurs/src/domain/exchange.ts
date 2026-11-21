import { accountOptions, appendOperations, bookOperationAllowed, budgetExpenses, cents, EMPTY_BOOK, LIFE_ACCOUNT, monthDebtActivity, RESERVE_ACCOUNT, rubles, validAmount, validBankBalance, validDate, validLoanReview, validSplitDebit, validSplitPlan, type AccountBook, type CashAccount } from './accounts';
import { validPayroll, with2027Unit, type PayrollProfile, type PayRate, type Vacation } from './payroll';
import { payrollRegister } from './payrollRegister';
import { annualIncome } from './annualIncome';
// Файл обмена с чатом «Финансы»: один формат в обе стороны.
// Приложение выгружает всё, что знает (status — сводка только для чтения); чат возвращает тот же формат,
// но только с изменениями. Списки с id/key — «добавить или изменить», удаление — только явное "delete": true.
// Перед применением приложение показывает разницу по разделам; присланное без изменений ничего не трогает.
import { bridgeState, weekMoney, type Bridge } from './bridge';
import { canVoidOperation, cardOn, ledger, type Checkup, type LedgerInput } from './ledger';
import { compare2027Coverage, compareCoverage, coverage, coverageInput, HORIZON_DAYS, safePrepayment } from './coverage';
import { PROTOCOL_VERSION } from './sync';
import { eventsBetween, incomeStatus, paidOn, type CalendarInput, type IncomeStatus } from './calendar';
import { categorize } from './categorize';
import { DEFAULT_PREPARATION_TIME, partialPayments, paymentPreparations, preparationInstant, weeklyTopUp } from './funds';
import { addDays, daysBetween, ddmm, plural } from './dates';
import { rub } from './money';
import { CATEGORIES, CATEGORY, currentPhase, DEFAULT_PLAN, reserveNeed, weeklyLimit, type BonusRule, type PlanConfig } from './plan';
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
  exchangePatchIds?: string[];
}

type Del = { delete?: boolean };
type WorkPatch = Omit<Partial<PayrollProfile>, 'rates' | 'vacations'> & {
  rates?: (Partial<PayRate> & Del & { effectiveFrom?: string })[];
  vacations?: (Partial<Vacation> & Del & { id: string })[];
  remove?: { section: 'attendance' | 'workingHours' | 'absenceHours' | 'deductions' | 'extras' | 'payDates' | 'aliases'; key: string; delete: true }[];
};
export interface Correction { key: string; oldValue: number; newValue: number; reason: string; source: string; revision: string; date?: string }
type BookRemoval = { section: 'accounts' | 'paymentAccounts' | 'historicalLoans' | 'creditChargeKinds' | 'loanReviews' | 'splitPlans' | 'splitDebits' | 'operations'; key: string; delete: true };

export interface ExchangeFile {
  app: typeof EXCHANGE_APP;
  version: 2;
  /** версия протокола, по которой выгружен файл: чат при несовпадении просит свежий текст */
  protocolVersion?: string;
  baseRevision?: string;
  exportId?: string;
  patchId?: string;
  recovery?: boolean;
  actualCorrection?: Correction[];
  bankCorrection?: Correction[];
  payrollRegister?: ReturnType<typeof payrollRegister>;
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
  calendar?: { key?: string; date?: string; title?: string; kind?: string; amount?: number; done?: boolean; paid?: number; paidFrom?: string; paidDate?: string; reset?: boolean; resetAmount?: boolean; approx?: boolean; exact?: boolean; planned?: string; dateMode?: string; accountId?: string; economicType?: CalEvent['economicType']; projection?: CalEvent['projection']; accrualPeriod?: string; nominalDate?: string; expectedPayDate?: string; actualPayDate?: string; confidence?: CalEvent['confidence']; incomeStatus?: IncomeStatus; manuallyAdjusted?: boolean; reviewFor?: string | null; possibleExtra?: number; incomeEvidence?: object }[];
  /** разовые платежи и поступления */
  events?: ({ key?: string; date?: string; title?: string; amount?: number; kind?: 'payment' | 'income'; dateMode?: CalEvent['dateMode']; note?: string; debtId?: string } & Del)[];
  expensesFrom?: string;
  accountBook?: Partial<AccountBook> & { remove?: BookRemoval[] };
  work?: WorkPatch;
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
  ruleEdits?: { find: string; replace: string }[];
}

const r0 = (n: number) => Math.round(n);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isDate = validDate;
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const safeKey = (key: unknown): key is string => typeof key === 'string' && !!key.trim() && !['__proto__', 'prototype', 'constructor'].includes(key);
const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function exchangeRevision(s: ExchangeState): string {
  const { debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides, marks, plan, expenses,
    reserve, reserveLog, savings, cardBalance, checklist, checks, strategy, rules, closures, checkups, work, accountBook, bridge } = s;
  const data = canonical({ debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides, marks, plan, expenses,
    reserve, reserveLog, savings, cardBalance, checklist, checks, strategy, rules, closures, checkups, work, accountBook, bridge });
  let a = 2166136261, b = 2246822519;
  for (let i = 0; i < data.length; i++) {
    a = Math.imul(a ^ data.charCodeAt(i), 16777619);
    b = Math.imul(b ^ data.charCodeAt(i), 3266489917);
  }
  return `r${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

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
  const ledIn: LedgerInput = { ...s, accountBook: s.accountBook, checkups: s.checkups ?? [], cardBalance: s.cardBalance, reserve: s.reserve, reserveLog: s.reserveLog ?? [], marks: s.marks, expenses: s.expenses, oneOff: s.oneOff, debts: s.debts, bridge: s.bridge ?? null, now };
  const led = ledger(ledIn);
  const day = dayBudget(expenses, s.debts, s.weeklyOverrides, now);
  // тот же вход прогноза, что у календаря и «Хватит ли» в приложении: остаток дня в календаре = status.coverage
  const input = coverageInput(s, led);
  const revision = exchangeRevision(s);
  const debtRows = s.debts.map(d => {
    const { anchor, ...row } = led.debtBalances[d.id];
    return { id: d.id, ...row, anchor: anchor ? { amount: anchor.amount, date: anchor.date, at: anchor.at } : null };
  });
  const basis = debtRows.reduce((sum, row) => sum + cents(row.basis), 0);
  const estimated = debtRows.reduce((sum, row) => sum + cents(row.estimated), 0);
  const cov = coverage(input, now);
  const byScenario = (scenario: 'cautious' | 'stress') => {
    const p = coverage(input, now, scenario);
    return { to: p.to, min: p.min?.balance ?? p.start, minDate: p.min?.date ?? now, shortage: p.shortage, maxShortfall: p.maxShortfall, accountRisk: p.accountRisk, bufferRisk: p.bufferRisk };
  };
  // окно −45…+75 дней и, дальше него, всё, что поправлено в приложении вручную: точные суммы и даты будущих платежей;
  // воскресные пополнения карты — только прошедшие и ближайшее, чтобы сверить их с переводами из резерва
  const recent = short
    ? eventsBetween(s, addDays(now, -14), addDays(now, 45))
    : eventsBetween(s, addDays(now, -45), addDays(now, 400))
      .filter(e => (e.kind === 'weekly' ? e.date <= addDays(now, 7) : e.date <= addDays(now, 75) || s.overrides[e.key] || s.marks[e.key]));
  const nextWeek = recent.find(e => e.kind === 'weekly' && e.date >= now && !s.marks[e.key]?.done);
  const preparations = paymentPreparations(recent.filter(e => e.date >= now), s.marks, led.heldForPayments, led.reserve);
  const proposedTransfers = [
    ...Object.entries(led.pendingSweepToReserve).filter(([, amount]) => amount > 0).map(([accountId, amount]) => ({
      kind: 'sweep', date: now, fromAccountId: accountId, toAccountId: RESERVE_ACCOUNT, amount,
    })),
    ...(nextWeek && led.lifeAvailable != null ? [{
      kind: 'weekly', date: nextWeek.date, fromAccountId: RESERVE_ACCOUNT, toAccountId: LIFE_ACCOUNT,
      amount: weeklyTopUp(weeklyLimit(s.debts, nextWeek.key.slice(3), s.weeklyOverrides), led.lifeAvailable),
      remindAt: preparationInstant(nextWeek.date, DEFAULT_PREPARATION_TIME), eventKeys: [nextWeek.key],
    }] : []),
    ...preparations.filter(group => group.toFund && group.accountId && group.date <= addDays(now, 45)).map(group => ({
      kind: 'prepare', date: group.remindDate, fromAccountId: RESERVE_ACCOUNT, toAccountId: group.accountId, amount: group.toFund,
      paymentDate: group.date, remindAt: preparationInstant(group.remindDate, DEFAULT_PREPARATION_TIME),
      eventKeys: group.events.map(e => e.key),
    })),
  ].filter(transfer => transfer.amount != null && transfer.amount > 0);
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
    baseRevision: revision, exportId: `${now}-${revision}`,
    ...(!short ? { payrollRegister: payrollRegister(s, 2026, 2027, now) } : {}),
    ...(typeof __APP_VERSION__ === 'string' ? { appVersion: __APP_VERSION__ } : {}), ...(short ? { short: true } : {}),
    about: 'Файл обмена приложения «Курс». status — сводка только для чтения. Остальные разделы можно менять: в ответ присылай этот же формат только с изменениями.',
    status: {
      totalDebt: rubles(estimated),
      totalCash: led.card == null || (led.cashAccounts.some(a => a.expected == null)) ? null
        : rubles(cents(led.card) + cents(led.reserve) + led.cashAccounts.reduce((n, a) => n + cents(a.expected ?? 0), 0)),
      lifeFree: led.lifeAvailable,
      proposedTransfers,
      ...(!short ? { debtReconciliation: { asOf: now, basis: rubles(basis), estimated: rubles(estimated), delta: rubles(estimated - basis), rows: debtRows } } : {}),
      phase: { id: phase.id, title: phase.title, weekly: phase.weekly, monthly: phase.monthly },
      week: { from: week.monday, to: week.sunday, ...weekFields(s, week.monday, led.card) },
      // сегодняшний день: норма, траты по источникам и сколько ещё можно — то же число, что в кольце на «Сегодня»
      today: {
        date: now, allowance: r0(day.day), spent: r0(day.spentToday), spentLife: r0(day.spentLife), spentCredit: r0(day.spentCredit),
        canSpend: r0(led.lifeAvailable == null ? day.canSpend : Math.min(day.canSpend, led.lifeAvailable)),
      },
      reserveNeed: { amount: r0(need.need), untilBonus: need.next },
      coverage: {
        to: cov.to, maxShortfall: cov.maxShortfall, ...(cov.min ? { min: cov.min.balance, minDate: cov.min.date, minTitle: cov.min.title } : {}),
        ...(s.accountBook ? { scenario: 'base', accountRisk: cov.accountRisk, bufferRisk: cov.bufferRisk } : {}),
        ...(cov.shortage ? { shortage: cov.shortage } : {}),
        narrow: cov.narrow.map(n => ({ date: n.date, title: n.title, left: r0(n.balance) })),
      },
      ...(s.accountBook ? {
        accounts: [{ id: LIFE_ACCOUNT, expected: led.card, confirmed: s.cardBalance?.amount ?? null },
          { id: RESERVE_ACCOUNT, expected: led.reserveVerified ? led.reserve : null, confirmed: led.reserveVerified ? s.reserve : null },
          ...led.cashAccounts.map(a => ({ id: a.id, name: a.name, expected: a.expected, confirmed: a.balance?.amount ?? null, date: a.balance?.date }))],
        debtActivity: monthDebtActivity(s.accountBook, s.expenses, now),
        ...(!short ? { pendingReview: {
          upcomingPaymentsWithoutAccount: cov.paymentFunding?.filter(p => !p.accountId && p.date <= addDays(now, 45))
            .map(p => ({ key: p.key, date: p.date, amount: p.amount, title: p.title })),
          loanReviews: s.accountBook.loanReviews ?? [],
        } } : {}),
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
          minDate: scenario.min && scenario.min.balance < scenario.start ? scenario.min.date : now,
          shortage: scenario.shortage, accountRisk: scenario.accountRisk,
        })) } : {}),
        safePrepayment: Object.fromEntries(accountOptions(s.accountBook).map(a => [a.id, safePrepayment(input, now, a.id)])),
      } : {}),
      ledger: {
        card: led.card, reserve: led.reserve, credit: led.credit,
        lifeAvailable: led.lifeAvailable, heldForPayments: led.heldForPayments,
        pendingSweepToReserve: led.pendingSweepToReserve, unassignedOnCard: led.unassignedOnCard,
        allocationShortfall: led.allocationShortfall,
        incomeOnCard: r0(led.incomeOnCard), ...(led.heldOnCard ? { heldOnCard: r0(led.heldOnCard) } : {}), ...(led.creditInterest ? { creditInterest: r0(led.creditInterest) } : {}),
        ...(led.cardFrom ? { since: led.cardFrom.date } : {}),
      },
    },
    limits: { weekly: s.weeklyOverrides, defaultWeekly: plan.defaultWeekly, phases: plan.phases, categories: plan.categories, bonusRules: plan.bonusRules ?? {}, shortfall: plan.shortfallOverrides ?? {} },
    debts: s.debts.map(d => ({
      id: d.id, name: d.name, short: d.short, kind: d.kind, balance: d.balance, rate: d.rate, dueDay: d.dueDay, order: d.order,
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
        key: e.key, date: e.date, title: e.title, kind: e.kind, amount: e.originalAmount ?? e.amount,
        ...(e.originalAmount != null ? { remainingPayment: e.amount } : {}), ...(e.prepareOn ? { prepareOn: e.prepareOn } : {}),
        ...(e.approx ? { approx: true } : {}), ...(e.dateMode !== 'exact' ? { dateMode: e.dateMode } : {}),
        ...(exact ? { exact: true } : {}), ...(manuallyAdjusted ? { manuallyAdjusted: true } : {}),
        ...(status ? { incomeStatus: status } : {}), ...(e.planned ? { planned: e.planned } : {}),
        ...(e.accountId ? { accountId: e.accountId } : {}), ...(e.economicType ? { economicType: e.economicType } : {}),
        ...(e.projection ? { projection: e.projection } : {}),
        ...(e.possibleExtra ? { possibleExtra: e.possibleExtra } : {}),
        ...(e.payroll ? { incomeEvidence: { recorded: !!m?.done, documented: !!e.payroll.documented,
          gross: e.payroll.gross, grossSource: e.payroll.actualGrossKnown ? 'document' : 'estimate',
          tax: e.payroll.tax, taxSource: e.payroll.actualTaxKnown ? 'document' : 'estimate',
          ...(e.payroll.taxDeduction ? { deduction: e.payroll.taxDeduction, deductionSource: 'estimate' } : {}) } } : {}),
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
  if (p.kind === 'v2') {
    const f = p.file;
    if (f.from !== 'app' || f.protocolVersion !== '2.7' || (!f.work && !f.accountBook)) return f;
    const book = f.accountBook;
    return { app: EXCHANGE_APP, version: 2, protocolVersion: '2.7', recovery: true, from: 'chat',
      summary: 'Восстановление отсутствующих настроек из прежней выгрузки', work: f.work,
      accountBook: book && { historicalLoans: book.historicalLoans, creditChargeKinds: book.creditChargeKinds, paymentAccounts: book.paymentAccounts } };
  }
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

export type SectionId = 'limits' | 'bridge' | 'fixed' | 'incomes' | 'debts' | 'events' | 'calendar' | 'expenses' | 'money' | 'accountBook' | 'work' | 'checklist' | 'strategy' | 'corrections';

export interface ExchangeSection {
  id: SectionId;
  title: string;
  lines: string[];
}

interface Ctx { revision: string; now: string; newId: () => string; at: string; only: Set<SectionId> | null }
type Step = (f: ExchangeFile, s: ExchangeState, ctx: Ctx) => { lines: string[]; patch: Partial<ExchangeState>; errors?: string[] };

const money = (n: number) => rub(n);
const arrow = (a: string, b: string) => `${a} → ${b}`;

const stepLimits: Step = (f, s) => {
  const L = f.limits;
  const lines: string[] = [];
  const patch: Partial<ExchangeState> = {};
  if (!L) return { lines, patch };
  if (Array.isArray(L.weekly) && (L.weekly.length || f.protocolVersion !== '2.7')) {
    let next = L.weekly.filter(w => isDate(w.from) && isDate(w.to) && isNum(w.amount)).sort((a, b) => a.from.localeCompare(b.from));
    if (['2.7', '2.8'].includes(f.protocolVersion ?? '')) {
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
  const overridesForLookup = f.calendar.some(row => row.reviewFor !== undefined)
    ? Object.fromEntries(Object.entries(s.overrides).map(([key, row]) => [key, { ...row, reviewFor: undefined }])) : s.overrides;
  const list = eventsBetween({ ...s, overrides: overridesForLookup }, addDays(ctx.now, -120), addDays(ctx.now, 400));
  const known = new Map(list.map(e => [e.key, e]));
  const marks = { ...s.marks };
  const overrides = { ...s.overrides };
  let mc = false, oc = false;
  for (const p of f.calendar) {
    if (f.protocolVersion === '2.8' && !f.recovery && (!safeKey(p?.key) ||
        p.done === true && (!validDate(p.paidDate) || p.paidDate > ctx.now || !validAmount(p.paid) || p.paid < 0))) {
      lines.push('Не найден стабильный ключ календаря или не указаны дата и сумма подтверждённой операции');
      continue;
    }
    if ((p.resetAmount || p.projection || p.reviewFor !== undefined || p.economicType === 'non_income') && (!p.key || !known.has(p.key))) {
      lines.push(`Не найден точный ключ ${p.key ?? ''}, изменение пропущено`);
      continue;
    }
    if (f.protocolVersion === '2.8' && !f.recovery && (p.incomeStatus === 'recorded' && !p.done ||
        p.incomeStatus === 'documented' && !f.work?.actual?.[p.key ?? ''] ||
        p.date != null && !validDate(p.date) || p.amount != null && (!validAmount(p.amount) || p.amount < 0))) {
      lines.push(`Не найден корректный источник или сумма для ${p.key}. Документы передавайте через work.actual.`);
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
    if (f.protocolVersion === '2.8' && !f.recovery && mark?.done && (p.done === false ||
        p.done === true && (p.paid != null && cents(p.paid) !== cents(mark.amount ?? e.amount) ||
          p.paidDate != null && p.paidDate !== paidOn(e, mark)))) {
      lines.push(`Не найдено основание для изменения факта ${e.key}. Используйте сверенное исправление.`);
      continue;
    }
    const recorded = s.accountBook?.operations.find(op => op.eventKey === e.key && op.status === 'confirmed');
    const historical = s.accountBook?.historicalLoans?.find(op => op.eventKey === e.key);
    if ((recorded || historical) && (p.done === false || (p.done === true &&
        ((p.paid != null && p.paid !== (mark?.amount ?? (recorded ?? historical)?.amount)) || (p.paidDate && p.paidDate !== (recorded ?? historical)?.date))))) {
      lines.push(`${name}: даты и суммы подтверждённой операции меняются в журнале`);
      continue;
    }
    const incomingOperation = f.accountBook?.operations?.find(op => op.status === 'confirmed' && op.eventKey === e.key && op.date === p.paidDate);
    if (incomingOperation && s.accountBook?.operations.some(op => op.id === incomingOperation.id && op.status === 'voided')) continue;
    const linkedAmount = (incomingOperation ? cents(incomingOperation.amount) : 0) + (e.kind === 'payment'
      ? (partialPayments(appendOperations(s.accountBook?.operations ?? [], f.accountBook?.operations ?? [])).get(e.key) ?? 0) : 0);
    if (p.done === true && !mark?.done && e.projection === 'internal_transfer') {
      lines.push(`${name}: эта строка не создаёт движения денег`);
      continue;
    }
    if (p.done === true && !mark?.done && (!incomingOperation || linkedAmount !== cents(p.paid ?? -1)) &&
        (e.payroll?.documented || s.accountBook?.paymentRouting === 'life' && f.protocolVersion === '2.8')) {
      lines.push(`${name}: эта строка не создаёт движения денег без связанной операции журнала`);
      continue;
    }
    if (p.done === true) {
      const paid = isNum(p.paid) ? p.paid : mark?.done && mark.amount != null ? mark.amount : isNum(p.amount) ? p.amount : e.amount;
      // день фактической оплаты: из файла (paidDate); у уже отмеченного — прежний; у новой отметки — день импорта
      const paidDate = isDate(p.paidDate) ? p.paidDate : mark?.done ? paidOn(e, mark) : ctx.now;
      if (!mark?.done || Math.abs((mark.amount ?? e.amount) - paid) >= (['2.7', '2.8'].includes(f.protocolVersion ?? '') ? 0.01 : 1) || paidDate !== paidOn(e, mark)) {
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
      if (f.protocolVersion === '2.8' && e.payroll && (p.date != null || p.amount != null)) {
        lines.push(`Не найден способ изменить расчёт ${e.key}: используйте work.payDates, work.rates, work.extras или actualCorrection`);
        continue;
      }
      const o = { ...overrides[e.key] };
      const changes: string[] = [];
      if (f.protocolVersion === '2.8' && e.kind === 'income' && p.incomeStatus === 'conditional' && !o.projection && !e.payroll) {
        o.projection = 'conditional'; changes.push('учитывать поступление только в полном сценарии');
      }
      if (f.protocolVersion === '2.8' && e.kind === 'income' && p.incomeStatus === 'forecast' && o.projection === 'conditional' && !e.payroll) {
        delete o.projection; changes.push('вернуть обычный прогноз поступления');
      }
      if (p.resetAmount && !mark?.done && o.amount != null) { delete o.amount; changes.push('вернуть расчётную сумму'); }
      if (!p.resetAmount && isNum(p.amount) && Math.abs(cents(p.amount) - cents(e.originalAmount ?? e.amount)) >= (['2.7', '2.8'].includes(f.protocolVersion ?? '') ? 1 : 100)) { o.amount = p.amount; changes.push(`сумма ${arrow(money(e.amount), money(p.amount))}`); }
      if (isDate(p.date) && p.date !== e.date) { o.date = p.date; changes.push(`дата ${arrow(ddmm(e.date), ddmm(p.date))}`); }
      if (['conditional', 'internal_transfer', 'review'].includes(p.projection ?? '') && o.projection !== p.projection) {
        o.projection = p.projection; changes.push(p.projection === 'conditional' ? 'только при подтверждении условий' :
          p.projection === 'internal_transfer' ? 'внутренний перевод без расхода' : 'предварительно, нужна сверка');
      }
      if (p.reviewFor === null && o.reviewFor != null && !mark?.done) { delete o.reviewFor; changes.push('отвязать возможную доплату'); }
      else if (typeof p.reviewFor === 'string' && p.reviewFor !== o.reviewFor && e.kind === 'payment' && o.projection === 'review' && !mark?.done) {
        const target = known.get(p.reviewFor);
        if (target?.kind === 'payment' && target.key !== e.key && !target.projection && target.debtId
            && (!e.debtId || e.debtId === target.debtId) && !marks[target.key]?.done && target.date === e.date) {
          o.reviewFor = target.key;
          changes.push(`проверять как возможную доплату к «${target.title}»`);
        }
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
  const strict = ['2.7', '2.8'].includes(f.protocolVersion ?? '');
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
  const errors: string[] = [];
  const strict = f.protocolVersion === '2.8' && !f.recovery;
  if (!incoming || typeof incoming !== 'object') return { lines, patch: {} };
  const base = s.accountBook ?? EMPTY_BOOK;
  const accounts = [...base.accounts];
  for (const item of Array.isArray(incoming.accounts) ? incoming.accounts : []) {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !item.name.trim() ||
        [LIFE_ACCOUNT, RESERVE_ACCOUNT].includes(item.id) || !validBankBalance(item.balance)) { if (strict) errors.push('accountBook.accounts: неизвестный id, пустое имя или неверный остаток'); continue; }
    const i = accounts.findIndex(a => a.id === item.id);
    const old = accounts[i];
    if (f.recovery && old) continue;
    if (strict && old?.balance && item.balance && !same(item.balance, old.balance)) { errors.push(`accountBook.accounts.${item.id}: для остатка используйте банковскую корректировку`); continue; }
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
      if (!loan || !safeKey(loan.eventKey) || !validDate(loan.date) || loan.date > ctx.now ||
          !validAmount(loan.amount) || loan.amount <= 0 || !s.debts.some(d => d.id === loan.debtId)) {
        if (strict) errors.push('accountBook.historicalLoans: проверьте дату, сумму и долг');
        continue;
      }
      const previous = history.get(loan.eventKey);
      if (previous) {
        if (strict && !same(previous, loan)) errors.push(`accountBook.historicalLoans.${loan.eventKey}: прежняя классификация расходится`);
        continue;
      }
      const event = s.oneOff.find(e => e.key === loan.eventKey && e.kind === 'income');
      const mark = s.marks[loan.eventKey];
      const recorded = book.operations.find(op => op.eventKey === loan.eventKey);
      if (recorded || !event || !mark?.done || paidOn(event, mark) !== loan.date ||
          cents(mark.amount ?? event.amount) !== cents(loan.amount)) {
        if (strict) errors.push(`accountBook.historicalLoans.${loan.eventKey}: запись не совпадает с фактической отметкой`);
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
      if ((kind !== 'fee' && kind !== 'interest') || creditChargeKinds[expense.id] === kind || (f.recovery && creditChargeKinds[expense.id])) continue;
      creditChargeKinds[expense.id] = kind;
      lines.push(`Списание по кредитке ${ddmm(expense.date)} · ${money(expense.amount)} · ${kind === 'fee' ? 'комиссия' : 'проценты'}`);
    }
    if (strict) for (const [id, kind] of Object.entries(incoming.creditChargeKinds)) {
      if ((kind !== 'fee' && kind !== 'interest') || !s.expenses.some(e => e.id === id && e.source === 'credit')) errors.push(`accountBook.creditChargeKinds.${id}: нет подходящей кредитной операции`);
    }
    if (!same(creditChargeKinds, book.creditChargeKinds ?? {})) book = { ...book, creditChargeKinds };
  }
  if (Array.isArray(incoming.splitPlans)) for (const p of incoming.splitPlans) {
    if (!validSplitPlan(p, s.debts)) { if (strict) errors.push('accountBook.splitPlans: проверьте долг и график'); continue; }
    if (same(book.splitPlans.find(x => x.id === p.id), p)) continue;
    book = { ...book, splitPlans: [...book.splitPlans.filter(x => x.id !== p.id), p] };
    lines.push(`План Сплита ${p.name} · ${p.schedule.length} строк графика`);
  }
  if (Array.isArray(incoming.splitDebits)) for (const d of incoming.splitDebits) {
    if (!validSplitDebit(d, book, s.debts)) { if (strict) errors.push('accountBook.splitDebits: проверьте даты, ключи и счёт'); continue; }
    if (same(book.splitDebits.find(x => x.id === d.id), d) || s.marks[`split-debit:${d.id}`]?.done
        || d.replacesKeys.some(key => s.marks[key]?.done)) continue;
    book = { ...book, splitDebits: [...book.splitDebits.filter(x => x.id !== d.id), d] };
    lines.push(`Автосписание Сплита ${d.date} · ${money(d.amount)} · заменяет строк ${d.replacesKeys.length}`);
  }
  if (Array.isArray(incoming.loanReviews)) {
    const reviews = new Map((book.loanReviews ?? []).map(r => [r.id, r]));
    for (const review of incoming.loanReviews) {
      if (!validLoanReview(review)) { if (strict) errors.push('accountBook.loanReviews: проверьте период, название и сумму'); continue; }
      if (reviews.has(review.id) && (f.recovery || same(reviews.get(review.id), review))) continue;
      reviews.set(review.id, review);
      lines.push(`К сверке: ${review.label} · ${money(review.amount)} · ${review.from}–${review.to}`);
    }
    if (reviews.size > (book.loanReviews?.length ?? 0)) book = { ...book, loanReviews: [...reviews.values()] };
  }
  const accountsById = new Set(accountOptions(book).map(a => a.id));
  if (incoming.paymentAccounts && typeof incoming.paymentAccounts === 'object') {
    const paymentAccounts = { ...book.paymentAccounts };
    for (const [key, value] of Object.entries(incoming.paymentAccounts)) {
      if (!safeKey(key) || !accountsById.has(value)) { if (strict) errors.push(`accountBook.paymentAccounts.${key}: неизвестный счёт`); continue; }
      if (paymentAccounts[key] === value || (f.recovery && paymentAccounts[key])) continue;
      if (strict && !s.debts.some(d => d.id === key) && !s.fixed.some(a => `fix:${a.id}` === key) &&
          !s.oneOff.some(e => e.key === key && e.kind === 'payment') && !/^(pay|fix|split-debit|split-plan):/.test(key)) {
        errors.push(`accountBook.paymentAccounts.${key}: не найдено обязательство`); continue;
      }
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
    if (!bookOperationAllowed(op, book, s.debts, s.expenses) || (op.status === 'confirmed' && op.date > ctx.now) || (op.eventKey && op.type === 'loan_disbursement' && !marks[op.eventKey]?.done)) { if (strict) errors.push('accountBook.operations: неверный маршрут, дата или отметка займа'); continue; }
    const previous = book.operations.find(row => row.id === op.id);
    if (op.status === 'voided' && previous?.status === 'confirmed' && !canVoidOperation({
      ...s, accountBook: book, marks, reserveLog: s.reserveLog ?? [], checkups: s.checkups ?? [], bridge: s.bridge ?? null,
    }, previous, ctx.now)) {
      if (strict) errors.push(`accountBook.operations.${op.id}: операция уже сверена или связана с последующим движением`);
      continue;
    }
    const operations = appendOperations(book.operations, [op]);
    if (operations === book.operations) {
      if (strict && !book.operations.some(existing => canonical(existing) === canonical(op) ||
          existing.id === op.id && existing.status === 'voided' && canonical({ ...existing, status: op.status }) === canonical(op))) {
        errors.push(`accountBook.operations.${op.id}: операция уже связана с другой записью`);
      }
      continue;
    }
    book = { ...book, operations };
    if (op.status === 'voided' && op.eventKey && !operations.some(row => row.status === 'confirmed' && row.eventKey === op.eventKey)) delete marks[op.eventKey];
    if (op.eventKey && op.status === 'confirmed' && !marks[op.eventKey]) marks[op.eventKey] = {
      done: true, paidDate: op.date, at: op.at ?? new Date(op.date + 'T00:00:00Z').toISOString(), amount: rubles(cents(op.amount) + (partialPayments(operations).get(op.eventKey) ?? 0)),
      ...((op.type === 'debt_payment' || op.type === 'expense') ? {
        paidFrom: op.accountId === LIFE_ACCOUNT ? 'card' as const : 'reserve' as const,
      } : {}),
    };
    lines.push(`Операция ${op.type === 'loan_disbursement' ? 'выдача займа' : op.type} · ${op.date} · ${money(op.amount)}${op.eventKey ? ' · связана с календарём' : ''}`);
  }
  for (const item of incoming.remove ?? []) {
    const key = item?.key;
    if (!item?.delete || !safeKey(key)) { errors.push('accountBook.remove: требуется ключ и delete:true'); continue; }
    if (item.section === 'paymentAccounts' || item.section === 'creditChargeKinds') {
      const map = { ...book[item.section] } as Record<string, string>;
      if (!Object.hasOwn(map, key)) continue;
      delete map[key]; book = { ...book, [item.section]: map };
    } else if (item.section === 'accounts') {
      if (!book.accounts.some(a => a.id === key)) continue;
      if (book.operations.some(op => op.accountId === key || (op.type === 'transfer' && op.toAccountId === key)) ||
          Object.values(book.paymentAccounts).includes(key) || book.splitDebits.some(op => op.accountId === key) ||
          s.work?.accountId === key || s.expenses.some(e => e.accountId === key) || book.stress?.accountId === key) {
        errors.push(`accountBook.accounts.${key}: счёт используется в финансовых данных`); continue;
      }
      book = { ...book, accounts: book.accounts.filter(a => a.id !== key) };
    } else if (item.section === 'operations') {
      const op = book.operations.find(o => o.id === key);
      if (!op) continue;
      if (op.status !== 'planned') { errors.push(`accountBook.operations.${key}: запись журнала защищена`); continue; }
      book = { ...book, operations: book.operations.filter(o => o.id !== key) };
    } else if (item.section === 'historicalLoans') {
      if (!book.historicalLoans?.some(o => o.eventKey === key)) continue;
      book = { ...book, historicalLoans: book.historicalLoans.filter(o => o.eventKey !== key) };
    } else if (item.section === 'loanReviews' || item.section === 'splitPlans' || item.section === 'splitDebits') {
      if (!book[item.section]?.some(o => o.id === key)) continue;
      if (item.section === 'splitDebits' && s.marks[`split-debit:${key}`]?.done ||
          item.section === 'splitPlans' && book.operations.some(o => o.type === 'loan_disbursement' && o.splitPlanId === key) ||
          item.section === 'loanReviews' && book.operations.some(o => o.type === 'loan_disbursement' && o.auditId === key)) {
        errors.push(`accountBook.${item.section}.${key}: есть подтверждённая операция`); continue;
      }
      book = { ...book, [item.section]: book[item.section]?.filter(o => o.id !== key) };
    } else { errors.push('accountBook.remove: неизвестный раздел'); continue; }
    lines.push(`Удаляется явно указанная запись ${item.section} · ${key}`);
  }
  return { lines, errors, patch: lines.length ? { accountBook: book, ...(!same(marks, s.marks) ? { marks } : {}) } : {} };
};

const stepWork: Step = (f, s, ctx) => {
  const incoming = f.work;
  if (!incoming) return { lines: [], patch: {} };
  const base = s.work;
  const errors: string[] = [];
  const lines: string[] = [];
  const keepExisting = f.recovery === true;
  if (typeof incoming !== 'object' || Array.isArray(incoming)) return { lines, patch: {}, errors: ['work должен быть объектом'] };
  const rates = new Map((base?.rates ?? []).map(r => [r.from, r]));
  for (const r of incoming.rates ?? []) {
    const from = r?.effectiveFrom ?? r?.from;
    if (!validDate(from)) { errors.push('work.rates: отсутствует корректная дата начала'); continue; }
    const old = rates.get(from);
    if (keepExisting && old) continue;
    const { effectiveFrom: _date, delete: remove, ...data } = r;
    void _date;
    if (remove) {
      if (old?.confidence === 'confirmed' && from <= ctx.now) errors.push(`work.rates.${from}: подтверждённая ставка сохраняется`);
      else rates.delete(from);
      continue;
    }
    if (!old && !['unit','positionUnits','rankUnits','seniority','conditions','monthlyBonus','confidence'].every(key => key in data)) {
      errors.push(`work.rates.${from}: нужны все компоненты новой ставки`);
      continue;
    }
    rates.set(from, { ...old, ...data, from } as PayRate);
  }
  const vacations = new Map((base?.vacations ?? []).map(v => [v.id, v]));
  for (const v of incoming.vacations ?? []) {
    if (!v || typeof v.id !== 'string') { errors.push('work.vacations: отсутствует id'); continue; }
    const old = vacations.get(v.id);
    const { delete: remove, ...data } = v;
    if (old?.status === 'taken' || (keepExisting && old) || (old?.status === 'approved' && v.status === 'planned')) {
      if (!keepExisting && (remove || !same(old, { ...old, ...data }))) errors.push(`work.vacations.${v.id}: сохранён подтверждённый отпуск`);
      continue;
    }
    if (remove) vacations.delete(v.id);
    else vacations.set(v.id, { ...old, ...data } as Vacation);
  }
  const actual = { ...base?.actual };
  for (const [key, record] of Object.entries(incoming.actual ?? {})) {
    const former = actual[key];
    if (!record || typeof record !== 'object') { errors.push(`work.actual.${key}: требуется запись о выплате`); continue; }
    const marked = s.marks[key]?.done ? s.marks[key] : undefined;
    const bookEntry = s.accountBook?.operations.find(op => op.status === 'confirmed' && op.type === 'income' && op.eventKey === key);
    const date = bookEntry?.date ?? marked?.paidDate;
    const recordedNet = bookEntry?.amount ?? marked?.amount;
    const conflicts = ['net', 'gross', 'tax', 'otherWithheld', 'payDate'].filter(field => {
      const k = field as keyof typeof record;
      const oldValue = field === 'payDate' ? date ?? former?.[k] : field === 'net' ? recordedNet ?? former?.[k] : former?.[k];
      return record[k] != null && oldValue != null && record[k] !== oldValue;
    });
    if (conflicts.length) {
      if (keepExisting) lines.push(`${key} · сохранены более свежие поля (${conflicts.join(', ')})`);
      else errors.push(`work.actual.${key}: конфликт полей ${conflicts.join(', ')}. Используйте отдельную сверенную корректировку.`);
    }
    actual[key] = { ...record, ...Object.fromEntries(Object.entries(former ?? {}).filter(([, value]) => value != null)) };
    if (date) actual[key].payDate = date;
  }
  const merge = <T,>(old: Record<string, T> | undefined, next: Record<string, T> | undefined) =>
    keepExisting ? { ...next, ...old } : { ...old, ...next };
  const next: PayrollProfile = {
    from: keepExisting ? base?.from ?? incoming.from ?? '' : incoming.from ?? base?.from ?? '',
    rates: [...rates.values()].sort((a, b) => a.from.localeCompare(b.from)),
    accountId: keepExisting ? base?.accountId ?? incoming.accountId : incoming.accountId ?? base?.accountId,
    advancesBy: keepExisting ? base?.advancesBy ?? incoming.advancesBy : incoming.advancesBy ?? base?.advancesBy,
    cautiousUnit2027: keepExisting ? base?.cautiousUnit2027 ?? incoming.cautiousUnit2027 : incoming.cautiousUnit2027 ?? base?.cautiousUnit2027,
    workingHours: merge(base?.workingHours, incoming.workingHours), absenceHours: merge(base?.absenceHours, incoming.absenceHours),
    attendance: merge(base?.attendance, incoming.attendance), vacations: [...vacations.values()],
    vacationDaysRemaining: keepExisting ? base?.vacationDaysRemaining ?? incoming.vacationDaysRemaining : incoming.vacationDaysRemaining ?? base?.vacationDaysRemaining,
    taxBase: merge(base?.taxBase, Object.fromEntries(Object.entries(incoming.taxBase ?? {})
      .filter(([year, tax]) => tax && (!base?.taxBase?.[year] || tax.asOf >= base.taxBase[year].asOf)))),
    deductions: merge(base?.deductions, incoming.deductions), actual,
    extras: merge(base?.extras, incoming.extras), payDates: merge(base?.payDates, incoming.payDates), aliases: merge(base?.aliases, incoming.aliases),
    payDateSources: merge(base?.payDateSources, incoming.payDateSources),
  };
  const removable = new Set(['attendance', 'workingHours', 'absenceHours', 'deductions', 'extras', 'payDates', 'aliases']);
  for (const change of incoming.remove ?? []) {
    if (!change || !change.delete || !removable.has(change.section) || !safeKey(change.key)) { errors.push('work.remove: неверное удаление'); continue; }
    if (change.section === 'extras' && (next.actual?.[change.key]?.net != null || s.marks[change.key]?.done)) {
      errors.push(`work.extras.${change.key}: есть подтверждённая выплата`);
      continue;
    }
    delete next[change.section]?.[change.key];
    if (change.section === 'payDates') delete next.payDateSources?.[change.key];
  }
  if (!validPayroll(next) || (next.accountId && !accountOptions(s.accountBook ?? EMPTY_BOOK).some(a => a.id === next.accountId))) {
    return { lines: [], patch: {}, errors: [...errors, 'Работа: проверьте поля ставки, даты, пересекающиеся отпуска, часы и счёт получения'] };
  }
  if (canonical(base) === canonical(next)) return { lines: [], patch: {}, errors };
  const before = new Map(payrollRegister(s, 2026, 2027, ctx.now).regular.map(row => [row.key, row]));
  const after = payrollRegister({ ...s, work: next }, 2026, 2027, ctx.now);
  for (const row of after.regular) {
    const old = before.get(row.key);
    if (old?.net === row.net && old?.expectedPayDate === row.expectedPayDate && old?.tax === row.tax) continue;
    if (row.nominalDate < ctx.now && old?.status === 'recorded') continue;
    const show = (amount: number | null | undefined) => amount == null ? 'нет данных' : amount.toLocaleString('ru-RU') + ' ₽';
    lines.push(`${row.nominalDate} · ${row.kind} · ${show(old?.net)} → ${show(row.net)} · дата ${old?.expectedPayDate ?? '—'} → ${row.expectedPayDate} · НДФЛ ${show(old?.tax)} → ${show(row.tax)}`);
  }
  lines.unshift(`Ставок ${base?.rates.length ?? 0} → ${next.rates.length} · отпусков ${base?.vacations?.length ?? 0} → ${next.vacations?.length ?? 0} · документальных записей ${Object.keys(base?.actual ?? {}).length} → ${Object.keys(actual).length}`);
  return { lines, patch: { work: next }, errors };
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
    const afterReceiptKey = typeof p.afterReceiptKey === 'string' ? p.afterReceiptKey : undefined;
    if (i < 0) {
      if (!p.title) continue;
      list.push({ id: p.id, title: p.title, ...(status ? { status } : {}), ...(eventKey ? { eventKey } : {}), ...(afterReceiptKey ? { afterReceiptKey } : {}), ...(p.note ? { note: p.note } : {}), ...(p.due ? { due: p.due } : {}) });
      lc = true;
      lines.push(`Новый пункт: ${p.title}${p.due ? `, срок ${p.due}` : ''}`);
    } else {
      const cur = list[i];
      const changes: string[] = [];
      if (p.title && p.title !== cur.title) changes.push(`«${p.title}»`);
      if (p.due !== undefined && (p.due || undefined) !== cur.due) changes.push(`срок ${p.due || 'без срока'}`);
      if (p.note !== undefined && (p.note || undefined) !== cur.note) changes.push('пояснение');
      if (status && status !== cur.status) changes.push('статус');
      if (eventKey && eventKey !== cur.eventKey) changes.push('связанный платёж');
      if (afterReceiptKey !== undefined && afterReceiptKey !== (cur.afterReceiptKey ?? '')) changes.push('начало задачи после зачисления');
      if (changes.length) {
        list[i] = { ...cur, ...(status ? { status } : {}), ...(eventKey ? { eventKey } : {}), ...(afterReceiptKey !== undefined ? { afterReceiptKey: afterReceiptKey || undefined } : {}), ...(p.title ? { title: p.title } : {}), ...(p.due !== undefined ? { due: p.due || undefined } : {}), ...(p.note !== undefined ? { note: p.note || undefined } : {}) };
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
  if (Array.isArray(f.ruleEdits)) {
    const original = patch.rules ?? s.rules;
    const rules = original.map(rule => {
      const edit = f.ruleEdits?.find(row => row?.find === rule && typeof row.replace === 'string' && row.replace.trim());
      return edit?.replace ?? rule;
    });
    if (!same(rules, original)) {
      patch.rules = rules;
      lines.push('Обновлены совпавшие правила');
    }
  }
  return { lines, patch };
};

const stepCorrections: Step = (f, s, ctx) => {
  const errors: string[] = [], lines: string[] = [];
  const patch: Partial<ExchangeState> = {};
  const knownKeys = new Set<string>();
  const label = (correction: Correction) => `${correction.key} · ${correction.oldValue} → ${correction.newValue} ₽ · ${correction.reason} · ${correction.source}`;
  const valid = (row: Correction, type: string) => {
    const id = `${type}:${row?.key}`;
    if (!row || !safeKey(row.key) || knownKeys.has(id) || !validAmount(row.oldValue) || !validAmount(row.newValue) ||
        typeof row.reason !== 'string' || !row.reason.trim() || typeof row.source !== 'string' || !row.source.trim() ||
        row.revision !== ctx.revision) {
      errors.push(`${id}: проверьте ключ, ревизию, обе суммы, причину и источник`);
      return false;
    }
    knownKeys.add(id);
    return true;
  };
  const marks = { ...s.marks };
  let book = s.accountBook ?? EMPTY_BOOK;
  const actual = { ...s.work?.actual };
  for (const row of f.actualCorrection ?? []) {
    if (!valid(row, 'actualCorrection')) continue;
    const actualKey = Object.entries(s.work?.aliases ?? {}).find(([, alias]) => alias === row.key)?.[0] ?? row.key;
    const key = s.work?.aliases?.[actualKey] ?? row.key;
    const mark = marks[key];
    const previous = actual[actualKey];
    const op = book.operations.find(o => o.type === 'income' && o.status === 'confirmed' && o.eventKey === key && o.fundingSource !== 'borrowed');
    const knownNet = op?.amount ?? (mark?.done ? mark.amount : undefined) ?? previous?.net;
    const existingEvent = eventsBetween(s, '2025-12-01', addDays(ctx.now, 400)).find(event => event.key === key && event.payroll);
    if (!s.work || row.newValue <= 0 || knownNet == null || cents(knownNet) !== cents(row.oldValue) || !existingEvent) {
      errors.push(`actualCorrection.${row.key}: не совпадает ранее подтверждённая сумма зарплаты`); continue;
    }
    actual[actualKey] = { ...previous, net: row.newValue, asOf: ctx.now, verifiedBy: row.source };
    if (mark?.done) marks[key] = { ...mark, amount: row.newValue };
    if (op) book = { ...book, operations: book.operations.map(o => o.id === op.id ? { ...o, amount: row.newValue } : o) };
    lines.push(label(row));
  }
  if (lines.length) {
    patch.marks = marks;
    patch.work = { ...s.work!, actual };
    if (book !== s.accountBook && s.accountBook) patch.accountBook = book;
  }
  for (const row of f.bankCorrection ?? []) {
    if (!valid(row, 'bankCorrection')) continue;
    if (!validDate(row.date) || row.date !== ctx.now) {
      errors.push(`bankCorrection.${row.key}: укажите дату сегодняшней банковской сверки`); continue;
    }
    const currentBook = patch.accountBook ?? book;
    const debt = s.debts.find(d => d.id === row.key);
    const cash = currentBook.accounts.find(a => a.id === row.key);
    const basis = row.key === LIFE_ACCOUNT ? s.cardBalance?.amount : row.key === RESERVE_ACCOUNT ? s.reserve : debt?.balance ?? cash?.balance?.amount;
    if (basis == null || cents(basis) !== cents(row.oldValue) || (debt && row.newValue < 0)) {
      errors.push(`bankCorrection.${row.key}: прежний банковский остаток не совпадает или не найден`); continue;
    }
    const confirmed = currentBook.operations.filter(op => op.status === 'confirmed' && op.date <= row.date!).map(op => op.id);
    if (row.key === LIFE_ACCOUNT) patch.cardBalance = { ...s.cardBalance, amount: row.newValue, date: row.date, source: 'manual', at: ctx.at };
    else if (row.key === RESERVE_ACCOUNT) patch.reserve = row.newValue;
    else if (debt) patch.debts = (patch.debts ?? s.debts).map(d => d.id !== row.key ? d : {
      ...d, balance: row.newValue, updatedAt: ctx.at, bankBalance: { amount: row.newValue, date: row.date!, at: ctx.at,
        includedIds: [...confirmed, ...s.expenses.filter(e => e.creditCard === d.id && e.date <= row.date!).map(e => e.id)] },
    });
    else if (cash) patch.accountBook = { ...currentBook, accounts: currentBook.accounts.map(a => a.id !== row.key ? a : {
      ...a, balance: { amount: row.newValue, date: row.date!, at: ctx.at,
        includedIds: [...confirmed, ...s.expenses.filter(e => e.accountId === a.id && e.date <= row.date!).map(e => e.id)] },
    }) };
    lines.push(label(row));
  }
  return { lines, patch, errors };
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
  ['corrections', 'Сверенные исправления фактов', stepCorrections],
  ['checklist', 'Чек-лист', stepChecklist],
  ['strategy', 'Стратегия и правила', stepStrategy],
];

function run(f: ExchangeFile, s: ExchangeState, now: string, only: Set<SectionId> | null, newId: () => string) {
  const revision = exchangeRevision(s);
  const strict = f.protocolVersion === '2.8' && !f.recovery;
  const errors: string[] = [];
  const sections: ExchangeSection[] = [];
  const patch: Partial<ExchangeState> = {};
  if (f.version !== 2 || (f.protocolVersion && !['2.6','2.7','2.8'].includes(f.protocolVersion))) {
    return { sections, patch, errors: ['Версия файла не поддерживается'] };
  }
  if (f.patchId && s.exchangePatchIds?.includes(f.patchId)) return { sections, patch, errors };
  if (strict && (!safeKey(f.patchId) || f.baseRevision !== revision)) {
    errors.push('Ревизия патча не совпадает или отсутствует patchId. Создайте свежую выгрузку и обновите патч.');
  }
  if (strict && f.from !== 'chat') errors.push('Полная выгрузка не предназначена для изменения данных. Для восстановления используйте резервную копию.');
  if ((f.actualCorrection || f.bankCorrection) && !strict) errors.push('Сверенные исправления требуют протокол 2.8 и свежую ревизию');
  if (strict && f.debts != null && !Array.isArray(f.debts)) errors.push('debts: ожидается список');
  if (strict && (f.reserve != null || f.card != null || Array.isArray(f.debts) && f.debts.some(row => row && row.balance != null && s.debts.some(d => d.id === row.id)))) {
    errors.push('Для изменения сверенных банковских остатков используйте bankCorrection');
  }
  const listFields = ['debts', 'fixed', 'incomes', 'calendar', 'events', 'expenses', 'checklist', 'strategy', 'rules', 'actualCorrection', 'bankCorrection'] as const;
  for (const key of listFields) if (f[key] != null && !Array.isArray(f[key])) errors.push(`${key}: ожидается список`);
  const workArrays = ['rates','vacations','remove'] as const;
  for (const key of workArrays) if (f.work?.[key] != null && !Array.isArray(f.work[key])) errors.push(`work.${key}: ожидается список`);
  const bookArrays = ['accounts','operations','historicalLoans','splitPlans','splitDebits','loanReviews','remove'] as const;
  for (const key of bookArrays) if (f.accountBook?.[key] != null && !Array.isArray(f.accountBook[key])) errors.push(`accountBook.${key}: ожидается список`);
  if (errors.length) return { sections, patch, errors };
  const safe = f.recovery ? { ...f, work: f.work && { ...f.work, remove: undefined,
    rates: f.work.rates?.filter(row => !row?.delete), vacations: f.work.vacations?.filter(row => !row?.delete) },
    accountBook: f.accountBook && { paymentAccounts: f.accountBook.paymentAccounts,
      historicalLoans: f.accountBook.historicalLoans, creditChargeKinds: f.accountBook.creditChargeKinds } } : f;
  const ctx: Ctx = { revision, now, newId, at: new Date().toISOString(), only: strict ? null : only };
  let state = s;
  for (const [id, title, step] of STEPS) {
    if (f.recovery && id !== 'work' && id !== 'accountBook') continue;
    if (only && !strict && !only.has(id)) continue;
    try {
      const r = step(safe, state, ctx);
      errors.push(...(r.errors ?? []));
      if (strict && id === 'calendar') {
        errors.push(...r.lines.filter(line => /^(Не нашёл|Не найден)|изменяются в журнале|не создаёт движения/.test(line)));
      }
      if (r.lines.some(l => !l.startsWith('Уже есть'))) sections.push({ id, title, lines: r.lines });
      Object.assign(patch, r.patch);
      state = { ...state, ...r.patch };
    } catch {
      errors.push(`${title}: неверный формат поля`);
    }
  }
  if (errors.length && (strict || f.recovery || f.actualCorrection || f.bankCorrection)) return { sections: [], patch: {}, errors };
  if (f.patchId && Object.keys(patch).length && (!f.recovery || !only || sections.every(section => only.has(section.id)))) {
    patch.exchangePatchIds = [...s.exchangePatchIds ?? [], f.patchId];
  }
  return { sections, patch, errors };
}

export function prepareExchange(f: ExchangeFile, s: ExchangeState, now: string) {
  return run(f, s, now, null, () => 'preview');
}

export function previewExchange(f: ExchangeFile, s: ExchangeState, now: string): ExchangeSection[] {
  return prepareExchange(f, s, now).sections;
}

export function applyExchange(f: ExchangeFile, s: ExchangeState, now: string, only: Set<SectionId>, newId: () => string): Partial<ExchangeState> {
  return run(f, s, now, only, newId).patch;
}

export const exchangeFileName = (now: string) => `Курс — обмен ${now}.json`;

/** Итог файла перед применением, по-человечески: «Траты: +3 (1 234 ₽)», «Отмечено: …», «Резерв: … → …», повторы */
export function exchangeDigest(f: ExchangeFile, s: ExchangeState, now: string): string[] {
  const { sections, patch } = run(f, s, now, null, () => `preview-${Math.random()}`);
  const out: string[] = [];
  if (patch.work || patch.accountBook || patch.overrides || patch.marks) {
    const to = addDays(now, HORIZON_DAYS);
    const summarize = (state: ExchangeState) => {
      const model = coverageInput(state, ledger({ ...state, checkups: state.checkups ?? [], reserveLog: state.reserveLog ?? [], bridge: state.bridge ?? null, now }));
      const cov = coverage(model, now, 'cautious', to);
      return { minimum: Math.min(cov.start, cov.min?.balance ?? cov.start), routes: cov.paymentFunding?.filter(p => p.accountId).length ?? 0 };
    };
    const before = summarize(s), after = summarize({ ...s, ...patch });
    out.push(`Осторожный прогноз, минимум за 150 дней: ${money(before.minimum)} → ${money(after.minimum)}`);
    out.push(`Платежи с назначенным счётом за 150 дней: ${before.routes} → ${after.routes}`);
  }
  if (!patch.expenses && !patch.debts && !patch.reserve && !patch.cardBalance && !patch.marks) {
    out.push(`Сохраняются ${s.debts.length} долгов, ${s.expenses.length} расходов, все отметки и сверенные остатки`);
  }
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

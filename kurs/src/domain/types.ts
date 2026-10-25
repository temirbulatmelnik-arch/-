// Модель данных «Курса». Все суммы — в рублях, даты — строки YYYY-MM-DD по местному времени.

export type DebtKind = 'micro' | 'installment' | 'card' | 'split' | 'loan';

/** Как считается обязательный платёж */
export type PaymentRule =
  | { type: 'fixed'; amount: number }
  /** проценты за месяц + доля долга (обычно 1,5–3%), не меньше min */
  | { type: 'interestPlus'; share: number; min?: number }
  /** фиксированный график */
  | { type: 'schedule'; items: { date: string; amount: number }[] }
  /** аннуитет до даты окончания, досрочка уменьшает платёж */
  | { type: 'annuity'; endDate: string; amount: number };

export interface Debt {
  id: string;
  name: string;
  short: string;
  kind: DebtKind;
  balance: number;
  /** остаток на старте плана — от него считается прогресс */
  startBalance: number;
  /** годовая ставка, доля: 0.545 = 54,5% */
  rate: number;
  limit?: number;
  /** день платежа: число месяца или 'last' */
  dueDay: number | 'last';
  rule: PaymentRule;
  /** с кредитки нельзя тратить */
  frozen: boolean;
  /** порядок закрытия (лавина) */
  order: number;
  /** на каком этапе плана закрывается */
  phase?: number;
  /** досрочно не гасим (рассрочка по графику) */
  noPrepay?: boolean;
  closed: boolean;
  closedOn?: string;
  /** план закрытия YYYY-MM */
  targetClose?: string;
  note?: string;
  /** когда остаток обновлялся последний раз */
  updatedAt?: string;
}

export type CategoryId =
  | 'fixed' | 'groceries' | 'work' | 'taxi' | 'transport' | 'health'
  | 'shopping' | 'beauty' | 'tobacco' | 'fun';

/** Откуда оплачена трата: карта жизни (норма), резерв (по правилам) или кредитка (нарушение) */
export type Source = 'life' | 'reserve' | 'credit';

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category: CategoryId;
  note?: string;
  source: Source;
  /** откуда пришла: вручную, выписка, скриншот */
  origin?: 'manual' | 'csv' | 'text' | 'ai' | 'pdf' | 'chat';
  /** для поиска дублей при импорте */
  fingerprint?: string;
  createdAt: string;
}

export type EventKind = 'payment' | 'income' | 'weekly';

/** Строка календаря: платёж по долгу, фиксированный расход или поступление */
export interface CalEvent {
  /** стабильный ключ: по нему хранится отметка «оплачено/пришло» */
  key: string;
  date: string;
  /** «до 16.11» — платёж можно внести раньше; «~10.11» — дата примерная */
  dateMode: 'exact' | 'until' | 'approx' | 'month';
  kind: EventKind;
  title: string;
  amount: number;
  /** примерная сумма */
  approx?: boolean;
  debtId?: string;
  incomeKind?: IncomeKind;
  note?: string;
  /** дата перенесена вручную */
  moved?: boolean;
  /** дата по графику, если поступление сдвинулось на рабочий день */
  planned?: string;
}

export type IncomeKind = 'salary' | 'bonusMonthly' | 'advance' | 'bonusQuarter' | 'bonusYear' | 'vacation' | 'thirteenth' | 'other';

/** Отметка по событию календаря */
export interface EventMark {
  done: boolean;
  /** фактическая сумма */
  amount?: number;
  /** остаток долга до отметки — чтобы отменить */
  prevBalance?: number;
  at: string;
}

export interface ReserveMove {
  id: string;
  date: string;
  /** + пополнение, − расход */
  amount: number;
  note: string;
}

export interface WishItem {
  id: string;
  title: string;
  amount: number;
  category: CategoryId;
  createdAt: string;
  /** решение принято: купил или передумал */
  resolved?: 'bought' | 'skipped';
  resolvedAt?: string;
}

export interface DebtSnapshot {
  /** YYYY-MM */
  month: string;
  total: number;
}

export interface Phase {
  id: 0 | 1 | 2 | 3 | 4;
  title: string;
  /** на жизнь в месяц, включая фикс 6 400 */
  monthly: number;
  weekly: number;
  /** месячная нехватка зарплаты, которую закрывает резерв */
  shortfall: number;
  /** что закрывается на этапе */
  closes: string[];
  premiums: string;
  /** период по плану */
  from: string;
  to: string;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  apiKey: string;
  model: string;
  /** скрывать суммы в напоминаниях календаря */
  hideAmounts: boolean;
  /** за сколько дней напоминать о платеже */
  remindDays: number[];
  /** время напоминаний */
  remindTime: string;
  lastBackupAt?: string;
  lastIcsAt?: string;
  lastReportAt?: string;
  badge: boolean;
}

export interface IncomeTemplate {
  kind: IncomeKind;
  name: string;
  day: number;
  amount: number;
  /** месяцы (1–12), если не каждый месяц */
  months?: number[];
}

/** Обязательный ежемесячный платёж (связь, спортзал, подписка) — у каждого своя дата */
export interface FixedItem {
  id: string;
  name: string;
  day: number;
  amount: number;
  /** с какого месяца (YYYY-MM) появляется в календаре; раньше — уже оплачено до начала плана */
  from?: string;
  note?: string;
}

/** Пункт чек-листа из аудита: разовое действие с желательным сроком */
export interface ChecklistItem {
  id: string;
  title: string;
  note?: string;
  /** YYYY-MM-DD или YYYY-MM */
  due?: string;
  /** выполнено на момент составления плана */
  done?: boolean;
}

/** Раздел стратегии из аудита: заголовок и текст (абзацы через пустую строку, пункты с «- ») */
export interface StrategySection {
  title: string;
  text: string;
}

/** Итог недели: сколько потрачено из лимита и сколько остатка переведено в копилку */
export interface WeekClosure {
  monday: string;
  limit: number;
  spent: number;
  left: number;
  transferred: number;
  at: string;
}

/** Баланс зарплатной карты на дату — от него считается прогноз денег по дням */
export interface CardBalance {
  amount: number;
  /** YYYY-MM-DD: платежи и поступления до этой даты включительно уже учтены в балансе */
  date: string;
  source: 'manual' | 'statement';
}

/** Исходные данные плана (зашифрованы в seed.enc.json) */
export interface PlanSeed {
  /** номер редакции плана: выше, чем на телефоне, — приложение предложит обновиться без потери данных */
  rev?: number;
  asOf: string;
  debts: Debt[];
  incomes: IncomeTemplate[];
  fixed: FixedItem[];
  /** разовые события до конца шаблонного периода */
  oneOff: CalEvent[];
  /** события 22.10–31.12 уже внесены разово; шаблон работает с этого месяца */
  templateFrom: string;
  reserve: number;
  /** этапы, лимиты категорий, особые месяцы */
  plan: import('./plan').PlanConfig;
  /** особый недельный лимит на период */
  weeklyOverrides: WeeklyOverride[];
  planTrajectory: [string, number][];
  baselineTrajectory: [string, number][];
  /** отметки по событиям, которые уже случились */
  marks?: Record<string, EventMark>;
  checklist?: ChecklistItem[];
  strategy?: StrategySection[];
  rules?: string[];
}

export interface WeeklyOverride {
  from: string;
  to: string;
  amount: number;
}

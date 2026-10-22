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

export interface Category {
  id: CategoryId;
  name: string;
  short: string;
  emoji: string;
  /** лимит этапа 1 в месяц */
  limit: number;
  /** было в среднем в 2026 */
  baseline: number;
}

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
  origin?: 'manual' | 'csv' | 'text' | 'ai';
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

export interface FixedItem {
  name: string;
  day: number;
  amount: number;
}

/** Исходные данные плана (зашифрованы в seed.enc.json) */
export interface PlanSeed {
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
}

export interface WeeklyOverride {
  from: string;
  to: string;
  amount: number;
}

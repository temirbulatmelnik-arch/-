// Файл обмена с чатом «Финансы»: один формат в обе стороны.
// Приложение выгружает всё, что знает (status — сводка только для чтения); чат возвращает тот же формат,
// но только с изменениями. Списки с id/key — «добавить или изменить», удаление — только явное "delete": true.
// Перед применением приложение показывает разницу по разделам; присланное без изменений ничего не трогает.
import { eventsBetween, type CalendarInput } from './calendar';
import { categorize } from './categorize';
import { addDays, daysBetween, ddmm, plural } from './dates';
import { rub } from './money';
import { CATEGORIES, CATEGORY, currentPhase, DEFAULT_PLAN, reserveNeed, totalDebt, type BonusRule, type PlanConfig } from './plan';
import { weekSummary } from './summary';
import type {
  CalEvent, CardBalance, CategoryId, ChecklistItem, Debt, DebtKind, EventMark, Expense, FixedItem, IncomeTemplate, Phase, Source,
  StrategySection, WeekClosure, WeeklyOverride,
} from './types';

export const EXCHANGE_APP = 'kurs-exchange';
/** сколько дней трат попадает в файл */
export const EXPENSE_DAYS = 90;

/** Что приложение отдаёт в файл и что файл может поменять */
export interface ExchangeState extends CalendarInput {
  overrides: Record<string, { amount?: number; date?: string }>;
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
}

type Del = { delete?: boolean };

export interface ExchangeFile {
  app: typeof EXCHANGE_APP;
  version: 2;
  from?: 'app' | 'chat';
  date?: string;
  /** одной фразой: что меняется */
  summary?: string;
  about?: string;
  /** сводка из приложения — только для чтения, при загрузке не применяется */
  status?: Record<string, unknown>;
  limits?: {
    /** особые недельные лимиты на периоды — полный список */
    weekly?: WeeklyOverride[];
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
  calendar?: { key?: string; date?: string; title?: string; kind?: string; amount?: number; done?: boolean; paid?: number; reset?: boolean; approx?: boolean; dateMode?: string }[];
  /** разовые платежи и поступления */
  events?: ({ key?: string; date?: string; title?: string; amount?: number; kind?: 'payment' | 'income'; dateMode?: CalEvent['dateMode']; note?: string; debtId?: string } & Del)[];
  expensesFrom?: string;
  expenses?: ({ id?: string; date?: string; amount?: number; category?: string; note?: string; source?: Source } & Del)[];
  reserve?: number;
  savings?: number;
  card?: { amount: number; date: string } | null;
  weeks?: unknown;
  checklist?: (Partial<ChecklistItem> & { id: string } & Del)[];
  strategy?: StrategySection[];
  rules?: string[];
}

const r0 = (n: number) => Math.round(n);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
};

/* ---------- Выгрузка ---------- */

export function buildExchange(s: ExchangeState, now: string): ExchangeFile {
  const plan = s.plan ?? DEFAULT_PLAN;
  const week = weekSummary(s.expenses, s.debts, s.weeklyOverrides, now);
  const phase = currentPhase(s.debts, now);
  const need = reserveNeed(now, s.debts);
  const from = addDays(now, -EXPENSE_DAYS);
  const calendar = eventsBetween(s, addDays(now, -45), addDays(now, 75)).filter(e => e.kind !== 'weekly');
  return {
    app: EXCHANGE_APP, version: 2, from: 'app', date: now,
    about: 'Файл обмена приложения «Курс». status — сводка только для чтения. Остальные разделы можно менять: в ответ присылай этот же формат только с изменениями.',
    status: {
      totalDebt: r0(totalDebt(s.debts)),
      phase: { id: phase.id, title: phase.title, weekly: phase.weekly, monthly: phase.monthly },
      week: { from: week.monday, to: week.sunday, limit: r0(week.limit), spent: r0(week.spent), left: r0(week.left) },
      reserveNeed: { amount: r0(need.need), untilBonus: need.next },
    },
    limits: { weekly: s.weeklyOverrides, phases: plan.phases, categories: plan.categories, bonusRules: plan.bonusRules ?? {}, shortfall: plan.shortfallOverrides ?? {} },
    debts: s.debts.map(d => ({
      id: d.id, name: d.name, short: d.short, kind: d.kind, balance: r0(d.balance), rate: d.rate, dueDay: d.dueDay, order: d.order,
      ...(d.phase != null ? { phase: d.phase } : {}), ...(d.targetClose ? { targetClose: d.targetClose } : {}), ...(d.note ? { note: d.note } : {}),
      closed: d.closed, ...(d.closedOn ? { closedOn: d.closedOn } : {}),
    })),
    fixed: s.fixed,
    incomes: s.incomes,
    calendar: calendar.map(e => {
      const m = s.marks[e.key];
      return {
        key: e.key, date: e.date, title: e.title, kind: e.kind, amount: r0(e.amount),
        ...(e.approx ? { approx: true } : {}), ...(e.dateMode !== 'exact' ? { dateMode: e.dateMode } : {}),
        done: !!m?.done, ...(m?.done && m.amount != null ? { paid: r0(m.amount) } : {}),
      };
    }),
    events: s.oneOff.filter(e => e.date >= addDays(now, -45)).map(e => ({
      key: e.key, date: e.date, title: e.title, amount: r0(e.amount), kind: e.kind === 'income' ? 'income' : 'payment',
      ...(e.dateMode !== 'exact' ? { dateMode: e.dateMode } : {}), ...(e.note ? { note: e.note } : {}), ...(e.debtId ? { debtId: e.debtId } : {}),
    })),
    expensesFrom: from,
    expenses: s.expenses.filter(e => e.date >= from).map(e => ({ id: e.id, date: e.date, amount: e.amount, category: e.category, ...(e.note ? { note: e.note } : {}), source: e.source })),
    reserve: r0(s.reserve),
    savings: r0(s.savings),
    card: s.cardBalance ? { amount: r0(s.cardBalance.amount), date: s.cardBalance.date } : null,
    weeks: Object.values(s.closures).sort((a, b) => b.monday.localeCompare(a.monday)).slice(0, 8)
      .map(w => ({ monday: w.monday, limit: r0(w.limit), spent: r0(w.spent), left: r0(w.left), transferred: r0(w.transferred) })),
    checklist: s.checklist.map(c => ({ ...c, done: s.checks[c.id]?.done ?? !!c.done })),
    strategy: s.strategy,
    rules: s.rules,
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

export type SectionId = 'limits' | 'fixed' | 'incomes' | 'debts' | 'events' | 'calendar' | 'expenses' | 'money' | 'checklist' | 'strategy';

export interface ExchangeSection {
  id: SectionId;
  title: string;
  lines: string[];
}

interface Ctx { now: string; newId: () => string; at: string }
type Step = (f: ExchangeFile, s: ExchangeState, ctx: Ctx) => { lines: string[]; patch: Partial<ExchangeState> };

const money = (n: number) => rub(n);
const arrow = (a: string, b: string) => `${a} → ${b}`;

const stepLimits: Step = (f, s) => {
  const L = f.limits;
  const lines: string[] = [];
  const patch: Partial<ExchangeState> = {};
  if (!L) return { lines, patch };
  if (Array.isArray(L.weekly)) {
    const next = L.weekly.filter(w => isDate(w.from) && isDate(w.to) && isNum(w.amount)).sort((a, b) => a.from.localeCompare(b.from));
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
  const base = s.plan ?? DEFAULT_PLAN;
  let plan: PlanConfig = base;
  const touch = (p: Partial<PlanConfig>) => { plan = { ...plan, ...p }; };
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
      if (i >= 0) { lines.push(`Удалить: ${ddmm(list[i].date)} ${list[i].title}`); list = list.filter((_, k) => k !== i); }
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
    if (p.done === true) {
      const paid = isNum(p.paid) ? p.paid : mark?.done && mark.amount != null ? mark.amount : isNum(p.amount) ? p.amount : e.amount;
      if (!mark?.done || Math.abs((mark.amount ?? e.amount) - paid) >= 1) {
        marks[e.key] = { ...mark, done: true, amount: paid, at: ctx.at };
        mc = true;
        lines.push(`${name}: ${e.kind === 'income' ? 'пришло' : 'оплачено'} ${money(paid)}`);
      }
    } else if (p.done === false && mark?.done) {
      delete marks[e.key];
      mc = true;
      lines.push(`${name}: снять отметку`);
    }
    if (p.done !== true) {
      const o: { amount?: number; date?: string } = { ...overrides[e.key] };
      const changes: string[] = [];
      if (isNum(p.amount) && Math.abs(p.amount - e.amount) >= 1) { o.amount = p.amount; changes.push(`сумма ${arrow(money(e.amount), money(p.amount))}`); }
      if (isDate(p.date) && p.date !== e.date) { o.date = p.date; changes.push(`дата ${arrow(ddmm(e.date), ddmm(p.date))}`); }
      if (changes.length) { overrides[e.key] = o; oc = true; lines.push(`${name}: ${changes.join(', ')}`); }
    }
  }
  return { lines, patch: { ...(mc ? { marks } : {}), ...(oc ? { overrides } : {}) } };
};

const SOURCES: Source[] = ['life', 'reserve', 'credit'];
const SOURCE_NAME: Record<Source, string> = { life: 'карта жизни', reserve: 'резерв', credit: 'кредитка' };
const catName = (c: string) => CATEGORY[c as CategoryId]?.short ?? c;

const stepExpenses: Step = (f, s, ctx) => {
  const lines: string[] = [];
  if (!f.expenses) return { lines, patch: {} };
  let list = [...s.expenses];
  const validCat = (c?: string): c is CategoryId => !!c && c in CATEGORY;
  for (const p of f.expenses) {
    const i = p.id ? list.findIndex(x => x.id === p.id) : -1;
    if (p.delete) {
      if (i >= 0) { const e = list[i]; lines.push(`Удалить: ${ddmm(e.date)} ${e.note || catName(e.category)}, ${money(e.amount)}`); list = list.filter((_, k) => k !== i); }
      continue;
    }
    if (i >= 0) {
      const cur = list[i];
      const changes: string[] = [];
      const next: Expense = { ...cur };
      if (isNum(p.amount) && Math.abs(p.amount - cur.amount) >= 0.01) { changes.push(arrow(money(cur.amount), money(p.amount))); next.amount = p.amount; }
      if (isDate(p.date) && p.date !== cur.date) { changes.push(`дата ${arrow(ddmm(cur.date), ddmm(p.date))}`); next.date = p.date; }
      if (validCat(p.category) && p.category !== cur.category) { changes.push(`${catName(cur.category)} → ${catName(p.category)}`); next.category = p.category; }
      if (p.note != null && p.note !== (cur.note ?? '')) { changes.push(`«${p.note}»`); next.note = p.note || undefined; }
      if (p.source && SOURCES.includes(p.source) && p.source !== cur.source) { changes.push(SOURCE_NAME[p.source]); next.source = p.source; }
      if (changes.length) { list[i] = next; lines.push(`${ddmm(cur.date)} ${cur.note || catName(cur.category)}: ${changes.join(', ')}`); }
      continue;
    }
    if (!isDate(p.date) || !isNum(p.amount) || p.amount <= 0) continue;
    const dup = list.some(x => x.date === p.date && Math.abs(x.amount - p.amount!) < 1 && ((x.note ?? '') === (p.note ?? '') || x.category === p.category));
    if (dup) { lines.push(`Уже есть: ${ddmm(p.date)} ${p.note || catName(p.category ?? '')}, ${money(p.amount)}`); continue; }
    const category: CategoryId = validCat(p.category) ? p.category : (p.note && categorize(p.note)) || 'shopping';
    list.push({
      id: ctx.newId(), date: p.date, amount: p.amount, category, ...(p.note ? { note: p.note } : {}),
      source: p.source && SOURCES.includes(p.source) ? p.source : 'life', origin: 'chat', createdAt: ctx.at,
    });
    lines.push(`Новая: ${ddmm(p.date)} ${catName(category)}${p.note ? ` (${p.note})` : ''}, ${money(p.amount)}`);
  }
  const changed = lines.some(l => !l.startsWith('Уже есть'));
  return { lines, patch: changed ? { expenses: list.sort((a, b) => a.date.localeCompare(b.date)) } : {} };
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
    if (i < 0) {
      if (!p.title) continue;
      list.push({ id: p.id, title: p.title, ...(p.note ? { note: p.note } : {}), ...(p.due ? { due: p.due } : {}) });
      lc = true;
      lines.push(`Новый пункт: ${p.title}${p.due ? `, срок ${p.due}` : ''}`);
    } else {
      const cur = list[i];
      const changes: string[] = [];
      if (p.title && p.title !== cur.title) changes.push(`«${p.title}»`);
      if (p.due !== undefined && p.due !== cur.due) changes.push(`срок ${p.due || 'без срока'}`);
      if (p.note !== undefined && p.note !== cur.note) changes.push('пояснение');
      if (changes.length) {
        list[i] = { ...cur, ...(p.title ? { title: p.title } : {}), ...(p.due !== undefined ? { due: p.due || undefined } : {}), ...(p.note !== undefined ? { note: p.note || undefined } : {}) };
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
  if (Array.isArray(f.rules) && !same(f.rules, s.rules)) {
    patch.rules = f.rules.filter(r => typeof r === 'string' && r.trim());
    lines.push(`Правила: ${patch.rules.length}`);
  }
  return { lines, patch };
};

const STEPS: [SectionId, string, Step][] = [
  ['limits', 'Лимиты', stepLimits],
  ['fixed', 'Обязательные платежи', stepFixed],
  ['incomes', 'Поступления по шаблону', stepIncomes],
  ['debts', 'Долги', stepDebts],
  ['events', 'Разовые платежи и поступления', stepEvents],
  ['calendar', 'Отметки и точные суммы', stepCalendar],
  ['expenses', 'Траты', stepExpenses],
  ['money', 'Резерв, копилка, карта', stepMoney],
  ['checklist', 'Чек-лист', stepChecklist],
  ['strategy', 'Стратегия и правила', stepStrategy],
];

function run(f: ExchangeFile, s: ExchangeState, now: string, only: Set<SectionId> | null, newId: () => string) {
  const ctx: Ctx = { now, newId, at: new Date().toISOString() };
  let state = s;
  const patch: Partial<ExchangeState> = {};
  const sections: ExchangeSection[] = [];
  for (const [id, title, step] of STEPS) {
    if (only && !only.has(id)) continue;
    const r = step(f, state, ctx);
    if (r.lines.length) sections.push({ id, title, lines: r.lines });
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

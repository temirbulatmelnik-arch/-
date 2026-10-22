// Обновление плана без потери данных: из новой редакции зашифрованного плана или из ответа чата «Финансы».
// Меняется стратегия (этапы, лимиты, правила, чек-лист, календарь), а журнал трат, отметки, резерв и копилка остаются.
import { addDays, plural, today } from './dates';
import type { PlanConfig } from './plan';
import type { CalEvent, ChecklistItem, Debt, EventMark, FixedItem, IncomeTemplate, PlanSeed, StrategySection, WeeklyOverride } from './types';

/** Часть состояния, которую трогает обновление плана */
export interface PlanState {
  debts: Debt[];
  incomes: IncomeTemplate[];
  fixed: FixedItem[];
  oneOff: CalEvent[];
  templateFrom: string;
  weeklyOverrides: WeeklyOverride[];
  planTrajectory: [string, number][];
  baselineTrajectory: [string, number][];
  plan: PlanConfig | null;
  marks: Record<string, EventMark>;
  overrides: Record<string, { amount?: number; date?: string }>;
  checklist: ChecklistItem[];
  strategy: StrategySection[];
  rules: string[];
  reserve: number;
}

/** Новая редакция плана от разработчика: статичные поля долгов обновляются, остатки и отметки — с телефона */
export function mergeSeed(s: PlanState, seed: PlanSeed): Partial<PlanState> {
  const local = new Map(s.debts.map(d => [d.id, d]));
  const debts = seed.debts.map(d => {
    const l = local.get(d.id);
    if (!l) return d;
    // остаток, закрытие и дата обновления — то, что человек вёл в приложении
    return { ...d, balance: l.balance, closed: l.closed, closedOn: l.closedOn, updatedAt: l.updatedAt, rule: d.rule.type === 'annuity' && l.rule.type === 'annuity' ? l.rule : d.rule };
  });
  for (const l of s.debts) if (!seed.debts.some(d => d.id === l.id)) debts.push(l);
  return {
    debts,
    incomes: seed.incomes,
    fixed: seed.fixed,
    oneOff: seed.oneOff,
    templateFrom: seed.templateFrom,
    weeklyOverrides: seed.weeklyOverrides ?? s.weeklyOverrides,
    planTrajectory: seed.planTrajectory,
    baselineTrajectory: seed.baselineTrajectory,
    plan: seed.plan ?? s.plan,
    // отметки из плана добавляются, но не перетирают сделанные на телефоне
    marks: { ...(seed.marks ?? {}), ...s.marks },
    checklist: seed.checklist ?? s.checklist,
    strategy: seed.strategy ?? s.strategy,
    rules: seed.rules ?? s.rules,
  };
}

/* ---------- Формат обмена с чатом «Финансы» ---------- */

export interface ChatPlan {
  app: 'kurs-plan';
  version: 1;
  date?: string;
  summary?: string;
  strategy?: StrategySection[];
  checklist?: ChecklistItem[];
  rules?: string[];
  phases?: PlanConfig['phases'];
  categories?: PlanConfig['categories'];
  bonusRules?: PlanConfig['bonusRules'];
  shortfallOverrides?: PlanConfig['shortfallOverrides'];
  weeklyOverrides?: WeeklyOverride[];
  debts?: (Partial<Pick<Debt, 'name' | 'short' | 'balance' | 'rate' | 'dueDay' | 'targetClose' | 'note' | 'limit' | 'order' | 'phase'>> & { id: string; minPayment?: number; closed?: boolean })[];
  fixed?: FixedItem[];
  incomes?: IncomeTemplate[];
  /** разовые платежи и поступления */
  events?: { date: string; title: string; amount: number; kind?: 'payment' | 'income'; debtId?: string; dateMode?: CalEvent['dateMode']; note?: string }[];
  /** точная сумма или дата конкретного платежа по долгу: месяц YYYY-MM */
  payments?: { debtId: string; month: string; amount?: number; date?: string }[];
  reserve?: number;
}

/** Достаёт JSON из ответа чата: целиком, из блока ```json или первый {...} с "kurs-plan" */
export function parseChatPlan(text: string): ChatPlan | null {
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/g;
  for (let m = fence.exec(text); m; m = fence.exec(text)) candidates.push(m[1]);
  candidates.push(text);
  const i = text.indexOf('{'), j = text.lastIndexOf('}');
  if (i >= 0 && j > i) candidates.push(text.slice(i, j + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim());
      if (v && v.app === 'kurs-plan') return v as ChatPlan;
    } catch { /* следующий кандидат */ }
  }
  return null;
}

const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
};

/** Что изменится — списком для подтверждения */
export function describeChatPlan(p: ChatPlan, s: PlanState): string[] {
  const out: string[] = [];
  if (p.strategy) out.push(`Стратегия: ${p.strategy.length} разделов`);
  if (p.checklist) {
    const fresh = p.checklist.filter(c => !s.checklist.some(x => x.id === c.id)).length;
    out.push(`Чек-лист: ${p.checklist.length} ${plural(p.checklist.length, 'пункт', 'пункта', 'пунктов')}${fresh ? `, новых — ${fresh}` : ''}`);
  }
  if (p.rules) out.push(`Правила: ${p.rules.length}`);
  if (p.phases) out.push(`Этапы плана: ${p.phases.length}`);
  if (p.categories) out.push('Лимиты категорий');
  if (p.bonusRules) out.push(`Решения по премиям: ${Object.keys(p.bonusRules).join(', ')}`);
  if (p.weeklyOverrides) out.push('Особые недельные лимиты');
  for (const d of p.debts ?? []) {
    const l = s.debts.find(x => x.id === d.id);
    const parts = [
      d.balance != null && `остаток ${Math.round(l?.balance ?? 0)} → ${Math.round(d.balance)}`,
      d.rate != null && `ставка ${(d.rate * 100).toFixed(1).replace('.', ',').replace(',0', '')}%`,
      d.dueDay != null && `день платежа ${d.dueDay}`,
      d.minPayment != null && `ближайший платёж ${d.minPayment}`,
      d.targetClose && `закрыть ${d.targetClose}`,
      d.closed && 'закрыт',
    ].filter(Boolean);
    out.push(`${l ? l.short : `Новый долг «${d.name ?? d.id}»`}: ${parts.join(', ') || 'описание'}`);
  }
  if (p.fixed) out.push(`Обязательные платежи: ${p.fixed.map(f => `${f.name} ${f.day}-го`).join(', ')}`);
  if (p.incomes) out.push(`Поступления по шаблону: ${p.incomes.length}`);
  for (const e of p.events ?? []) out.push(`${e.kind === 'income' ? 'Поступление' : 'Платёж'} ${e.date}: ${e.title} — ${e.amount}`);
  for (const x of p.payments ?? []) out.push(`Платёж ${x.debtId} за ${x.month}: ${[x.amount != null && `сумма ${x.amount}`, x.date && `дата ${x.date}`].filter(Boolean).join(', ')}`);
  if (p.reserve != null) out.push(`Резерв: ${Math.round(s.reserve)} → ${Math.round(p.reserve)}`);
  return out;
}

export function applyChatPlan(p: ChatPlan, s: PlanState): Partial<PlanState> {
  const patch: Partial<PlanState> = {};
  if (p.strategy) patch.strategy = p.strategy;
  if (p.rules) patch.rules = p.rules;
  if (p.checklist) patch.checklist = p.checklist;
  if (p.phases || p.categories || p.bonusRules || p.shortfallOverrides) {
    const base = s.plan ?? ({} as PlanConfig);
    patch.plan = {
      ...base,
      ...(p.phases ? { phases: p.phases } : {}),
      ...(p.categories ? { categories: { ...base.categories, ...p.categories } } : {}),
      ...(p.bonusRules ? { bonusRules: { ...base.bonusRules, ...p.bonusRules } } : {}),
      ...(p.shortfallOverrides ? { shortfallOverrides: { ...base.shortfallOverrides, ...p.shortfallOverrides } } : {}),
    };
  }
  if (p.weeklyOverrides) patch.weeklyOverrides = p.weeklyOverrides;
  if (p.fixed) patch.fixed = p.fixed;
  if (p.incomes) patch.incomes = p.incomes;
  if (p.reserve != null) patch.reserve = p.reserve;

  const overrides = { ...s.overrides };
  if (p.debts) {
    const debts = [...s.debts];
    for (const d of p.debts) {
      const i = debts.findIndex(x => x.id === d.id);
      const { minPayment, closed, ...fields } = d;
      if (i >= 0) {
        const cur = debts[i];
        debts[i] = {
          ...cur, ...fields,
          ...(closed ? { closed: true, balance: 0, closedOn: cur.closedOn ?? today() } : {}),
          ...(d.balance != null ? { updatedAt: new Date().toISOString(), closed: d.balance <= 0.5 || !!closed } : {}),
        };
      } else if (d.name && d.balance != null && d.rate != null) {
        debts.push({
          id: d.id, name: d.name, short: d.short ?? d.name, kind: 'card', balance: d.balance, startBalance: d.balance, rate: d.rate,
          dueDay: d.dueDay ?? 1, rule: minPayment ? { type: 'fixed', amount: minPayment } : { type: 'interestPlus', share: 0.03 },
          frozen: true, order: d.order ?? debts.length + 1, phase: d.phase, closed: false, targetClose: d.targetClose, note: d.note,
        });
      }
      if (minPayment != null && i >= 0) {
        // ближайший месяц, где по долгу есть платёж
        const month = today().slice(0, 7);
        overrides[`pay:${d.id}:${month}`] = { ...overrides[`pay:${d.id}:${month}`], amount: minPayment };
      }
    }
    patch.debts = debts;
  }
  for (const x of p.payments ?? []) {
    overrides[`pay:${x.debtId}:${x.month}`] = { ...overrides[`pay:${x.debtId}:${x.month}`], ...(x.amount != null ? { amount: x.amount } : {}), ...(x.date ? { date: x.date } : {}) };
  }
  if (p.debts || p.payments) patch.overrides = overrides;
  if (p.events) {
    const fresh: CalEvent[] = p.events.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.amount > 0).map(e => ({
      key: `chat:${hash(`${e.date}|${e.title}|${e.amount}`)}`, date: e.date, dateMode: e.dateMode ?? 'exact', kind: e.kind ?? 'payment',
      title: e.title, amount: e.amount, debtId: e.debtId, note: e.note,
    }));
    patch.oneOff = [...s.oneOff.filter(o => !fresh.some(f => f.key === o.key)), ...fresh];
  }
  return patch;
}

/** Проверка срока пункта чек-листа: «горит» за 7 дней и просрочен */
export function checklistDue(item: ChecklistItem, now: string): 'overdue' | 'soon' | 'later' | null {
  if (!item.due) return null;
  const due = item.due.length === 7 ? `${item.due}-28` : item.due;
  if (due < now) return 'overdue';
  if (due <= addDays(now, 7)) return 'soon';
  return 'later';
}

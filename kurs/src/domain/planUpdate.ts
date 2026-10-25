// Обновление плана без потери данных: из новой редакции зашифрованного плана (ответы чата — domain/exchange.ts).
// Меняется стратегия (этапы, лимиты, правила, чек-лист, календарь), а журнал трат, отметки, резерв и копилка остаются.
import { addDays } from './dates';
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

/** Проверка срока пункта чек-листа: «горит» за 7 дней и просрочен */
export function checklistDue(item: ChecklistItem, now: string): 'overdue' | 'soon' | 'later' | null {
  if (!item.due) return null;
  const due = item.due.length === 7 ? `${item.due}-28` : item.due;
  if (due < now) return 'overdue';
  if (due <= addDays(now, 7)) return 'soon';
  return 'later';
}

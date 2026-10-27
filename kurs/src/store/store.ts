// Всё хранится только на телефоне (localStorage). Никаких аккаунтов и серверов.
// Резервная копия — файл JSON (Настройки → Данные), календарь — файл .ics.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MODEL } from '../domain/models';
import { annuity } from '../domain/calendar';
import { addDays, monthKey, monthsBetween, today } from '../domain/dates';
import { setPlanSource, totalDebt, type PlanConfig } from '../domain/plan';
import { mergeSeed } from '../domain/planUpdate';
import { fixDefaultCategories } from '../domain/categorize';
import { dropChatTwins } from '../domain/exchange';
import type { CalEvent, CardBalance, ChecklistItem, Debt, DebtSnapshot, EventMark, Expense, FixedItem, IncomeTemplate, PlanSeed, ReserveMove, Settings, StrategySection, WeekClosure, WeeklyOverride, WishItem } from '../domain/types';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  apiKey: '',
  model: DEFAULT_MODEL,
  hideAmounts: false,
  remindDays: [3, 1, 0],
  remindTime: '10:00',
  badge: false,
};

interface Data {
  ready: boolean;
  asOf: string;
  debts: Debt[];
  incomes: IncomeTemplate[];
  fixed: FixedItem[];
  oneOff: CalEvent[];
  templateFrom: string;
  weeklyOverrides: WeeklyOverride[];
  planTrajectory: [string, number][];
  baselineTrajectory: [string, number][];
  reserve: number;
  reserveLog: ReserveMove[];
  expenses: Expense[];
  marks: Record<string, EventMark>;
  wishes: WishItem[];
  snapshots: DebtSnapshot[];
  overrides: Record<string, { amount?: number; date?: string }>;
  /** цифры плана из зашифрованного файла; null — нейтральные по умолчанию */
  plan: PlanConfig | null;
  /** редакция загруженного плана и код к нему — чтобы подтягивать новые редакции без потери данных */
  planRev: number;
  planCode: string;
  checklist: ChecklistItem[];
  strategy: StrategySection[];
  rules: string[];
  /** отметки чек-листа на телефоне */
  checks: Record<string, { done: boolean; at: string }>;
  /** копилка недельных остатков — отдельный счёт */
  savings: number;
  savingsLog: ReserveMove[];
  /** закрытые недели по понедельнику */
  closures: Record<string, WeekClosure>;
  /** остаток на зарплатной карте — для прогноза денег по дням */
  cardBalance: CardBalance | null;
  settings: Settings;
}

interface Actions {
  loadSeed: (seed: PlanSeed, code?: string) => void;
  /** новая редакция плана: стратегия меняется, данные остаются */
  updateFromSeed: (seed: PlanSeed, code: string) => void;
  /** обновление плана из чата «Финансы» */
  /** изменения из файла обмена с чатом: резерв и копилка пишутся в журнал, долги — в снимок месяца */
  applySync: (patch: Partial<Data>) => void;
  toggleCheck: (id: string) => void;
  closeWeek: (c: Omit<WeekClosure, 'at'>) => void;
  reopenWeek: (monday: string) => void;
  moveSavings: (amount: number, note: string) => void;
  setCardBalance: (b: CardBalance | null) => void;
  setFixed: (list: FixedItem[]) => void;
  clearOverride: (key: string) => void;
  startEmpty: () => void;
  addExpenses: (items: Omit<Expense, 'id' | 'createdAt'>[]) => void;
  updateExpense: (id: string, patch: Partial<Expense>) => void;
  removeExpense: (id: string) => void;
  /** отметить событие календаря; для платежа по долгу остаток уменьшается на оценку погашения */
  markEvent: (e: CalEvent, done: boolean, amount?: number) => void;
  updateDebt: (id: string, patch: Partial<Debt>) => void;
  /** точная сумма/дата платежа из банка */
  setOverride: (key: string, o: { amount?: number; date?: string }) => void;
  addDebt: (d: Debt) => void;
  removeDebt: (id: string) => void;
  /** досрочное погашение; fromReserve — деньги взяты из резерва */
  prepay: (id: string, amount: number, fromReserve: boolean, note?: string) => void;
  /** премия: резерв становится reserveAfter, остальное — досрочно по списку */
  applyBonus: (opts: { amount: number; reserveAfter: number; allocations: { debtId: string; amount: number }[]; title: string; eventKey?: string }) => void;
  moveReserve: (amount: number, note: string) => void;
  setReserve: (balance: number, note: string) => void;
  addWish: (w: Omit<WishItem, 'id' | 'createdAt'>) => void;
  resolveWish: (id: string, r: WishItem['resolved']) => void;
  setSettings: (patch: Partial<Settings>) => void;
  importData: (data: unknown) => boolean;
  exportData: () => string;
  reset: () => void;
}

export type State = Data & Actions;

/** сколько повторов трат из чата убрало обновление данных — App покажет это сообщением один раз */
export let cleanedTwins = 0;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const nowIso = () => new Date().toISOString();

const EMPTY: Data = {
  ready: false, asOf: today(), debts: [], incomes: [], fixed: [], oneOff: [], templateFrom: monthKey(today()),
  weeklyOverrides: [], planTrajectory: [], baselineTrajectory: [], reserve: 0, reserveLog: [], expenses: [], marks: {}, wishes: [], snapshots: [], overrides: {}, plan: null,
  planRev: 0, planCode: '', checklist: [], strategy: [], rules: [], checks: {}, savings: 0, savingsLog: [], closures: {}, cardBalance: null,
  settings: DEFAULT_SETTINGS,
};

/** Снимок общего долга за текущий месяц — для графика «план против факта» */
function withSnapshot(debts: Debt[], snapshots: DebtSnapshot[]): { debts: Debt[]; snapshots: DebtSnapshot[] } {
  const month = monthKey(today());
  return { debts, snapshots: [...snapshots.filter(s => s.month !== month), { month, total: Math.round(totalDebt(debts)) }].sort((a, b) => a.month.localeCompare(b.month)) };
}

/** Применить изменение к долгу: закрыт при нуле, аннуитету (Сплит) пересчитать платёж после досрочки */
// Пополнение карты жизни берётся из резерва: отметка в календаре сдвигает резерв на разницу с прежней отметкой.
function topUpMove(s: Data, key: string, amount: number, note = 'Долил карту жизни до недельного лимита'): Partial<Pick<Data, 'reserve' | 'reserveLog'>> {
  const prev = s.marks[key]?.done ? s.marks[key].amount ?? 0 : 0;
  const diff = amount - prev;
  if (!diff) return {};
  return { reserve: s.reserve - diff, reserveLog: [...s.reserveLog, { id: uid(), date: today(), amount: -diff, note }] };
}

function patchDebt(d: Debt, balance: number, recalc = false): Debt {
  const b = Math.max(0, Math.round(balance * 100) / 100);
  const closed = b <= 0.5;
  let rule = d.rule;
  if (recalc && !closed && rule.type === 'annuity') {
    const left = monthsBetween(monthKey(today()), monthKey(rule.endDate));
    rule = { ...rule, amount: annuity(b, d.rate, Math.max(1, left)) };
  }
  return { ...d, balance: b, closed, closedOn: closed ? (d.closedOn ?? today()) : undefined, rule, updatedAt: nowIso() };
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      loadSeed: (seed, code = '') => set(s => ({
        ...EMPTY,
        settings: s.settings,
        ready: true,
        planRev: seed.rev ?? 1,
        planCode: code,
        checklist: seed.checklist ?? [],
        strategy: seed.strategy ?? [],
        rules: seed.rules ?? [],
        asOf: seed.asOf,
        plan: seed.plan ?? null,
        debts: seed.debts,
        incomes: seed.incomes,
        fixed: seed.fixed,
        oneOff: seed.oneOff,
        templateFrom: seed.templateFrom,
        weeklyOverrides: seed.weeklyOverrides ?? [],
        planTrajectory: seed.planTrajectory,
        baselineTrajectory: seed.baselineTrajectory,
        reserve: seed.reserve,
        reserveLog: [{ id: uid(), date: seed.asOf, amount: seed.reserve, note: 'Начальный остаток резерва' }],
        marks: seed.marks ?? {},
        snapshots: [{ month: monthKey(seed.asOf), total: Math.round(totalDebt(seed.debts)) }],
      })),

      startEmpty: () => set(s => ({ ...EMPTY, settings: s.settings, ready: true })),

      updateFromSeed: (seed, code) => set(s => ({ ...mergeSeed(s, seed), planRev: seed.rev ?? s.planRev, planCode: code })),
      applySync: patch => set(s => {
        const next: Partial<Data> = { ...patch };
        if (patch.reserve != null && patch.reserve !== s.reserve) {
          next.reserveLog = [...s.reserveLog, { id: uid(), date: today(), amount: patch.reserve - s.reserve, note: 'Сверка из чата «Финансы»' }];
        }
        if (patch.savings != null && patch.savings !== s.savings) {
          next.savingsLog = [...s.savingsLog, { id: uid(), date: today(), amount: patch.savings - s.savings, note: 'Сверка из чата «Финансы»' }];
        }
        return patch.debts ? { ...next, ...withSnapshot(patch.debts, s.snapshots) } : next;
      }),
      toggleCheck: id => set(s => {
        const base = s.checklist.find(c => c.id === id)?.done ?? false;
        const cur = s.checks[id]?.done ?? base;
        return { checks: { ...s.checks, [id]: { done: !cur, at: nowIso() } } };
      }),
      closeWeek: c => set(s => {
        // воскресное пополнение: из резерва на карту жизни; в календаре отмечается пополнение следующей недели
        const top = c.topUp ?? 0;
        const key = `wk:${addDays(c.monday, 7)}`;
        return {
          closures: { ...s.closures, [c.monday]: { ...c, at: nowIso() } },
          ...(c.transferred > 0 ? { savings: s.savings + c.transferred, savingsLog: [...s.savingsLog, { id: uid(), date: today(), amount: c.transferred, note: 'Остаток недели' }] } : {}),
          ...(top > 0 ? { ...topUpMove(s, key, top), marks: { ...s.marks, [key]: { done: true, amount: top, at: nowIso() } } } : {}),
        };
      }),
      reopenWeek: monday => set(s => {
        const c = s.closures[monday];
        if (!c) return {};
        const closures = { ...s.closures };
        delete closures[monday];
        const key = `wk:${addDays(monday, 7)}`;
        const marks = { ...s.marks };
        delete marks[key];
        return {
          closures,
          ...(c.transferred > 0 ? { savings: s.savings - c.transferred, savingsLog: [...s.savingsLog, { id: uid(), date: today(), amount: -c.transferred, note: 'Неделя открыта заново' }] } : {}),
          ...(s.marks[key]?.done ? { marks, ...topUpMove(s, key, 0, 'Неделя открыта заново: пополнение отменено') } : {}),
        };
      }),
      moveSavings: (amount, note) => set(s => ({ savings: s.savings + amount, savingsLog: [...s.savingsLog, { id: uid(), date: today(), amount, note }] })),
      setCardBalance: b => set({ cardBalance: b }),
      setFixed: list => set({ fixed: list }),
      clearOverride: key => set(s => {
        const overrides = { ...s.overrides };
        delete overrides[key];
        return { overrides };
      }),

      addExpenses: items => set(s => ({
        expenses: [...s.expenses, ...items.map(i => ({ ...i, id: uid(), createdAt: nowIso() }))].sort((a, b) => a.date.localeCompare(b.date)),
      })),
      updateExpense: (id, patch) => set(s => ({ expenses: s.expenses.map(e => (e.id === id ? { ...e, ...patch } : e)) })),
      removeExpense: id => set(s => ({ expenses: s.expenses.filter(e => e.id !== id) })),

      markEvent: (e, done, amount) => set(s => {
        const prev = s.marks[e.key];
        const marks = { ...s.marks };
        let debts = s.debts;
        const debt = e.debtId ? s.debts.find(d => d.id === e.debtId) : undefined;
        if (done) {
          const paid = amount ?? e.amount;
          marks[e.key] = { done: true, amount: paid, at: nowIso(), prevBalance: debt?.balance };
          if (e.kind === 'weekly') return { marks, ...topUpMove(s, e.key, paid) };
          if (debt && e.kind === 'payment' && !prev?.done) {
            // погашение основного долга ≈ платёж минус проценты за месяц; закрывающий платёж обнуляет долг
            const interest = debt.rule.type === 'schedule' ? 0 : (debt.balance * debt.rate) / 12;
            const closing = e.key.endsWith(':close') || paid >= debt.balance - 1;
            debts = s.debts.map(d => (d.id === debt.id ? patchDebt(d, closing ? 0 : d.balance + interest - paid) : d));
          }
        } else {
          delete marks[e.key];
          if (e.kind === 'weekly') return { marks, ...topUpMove(s, e.key, 0, 'Пополнение карты отменено') };
          if (debt && prev?.prevBalance != null) debts = s.debts.map(d => (d.id === debt.id ? { ...patchDebt(d, prev.prevBalance!), closedOn: undefined } : d));
        }
        return { marks, ...withSnapshot(debts, s.snapshots) };
      }),

      updateDebt: (id, patch) => set(s => {
        const debts = s.debts.map(d => {
          if (d.id !== id) return d;
          const next = { ...d, ...patch };
          return patch.balance != null ? patchDebt(next, patch.balance) : next;
        });
        return withSnapshot(debts, s.snapshots);
      }),
      setOverride: (key, o) => set(s => ({ overrides: { ...s.overrides, [key]: { ...s.overrides[key], ...o } } })),
      addDebt: d => set(s => withSnapshot([...s.debts, d], s.snapshots)),
      removeDebt: id => set(s => withSnapshot(s.debts.filter(d => d.id !== id), s.snapshots)),

      prepay: (id, amount, fromReserve, note) => set(s => {
        const debt = s.debts.find(d => d.id === id);
        if (!debt) return {};
        const debts = s.debts.map(d => (d.id === id ? patchDebt(d, d.balance - amount, true) : d));
        return {
          ...withSnapshot(debts, s.snapshots),
          ...(fromReserve ? {
            reserve: s.reserve - amount,
            reserveLog: [...s.reserveLog, { id: uid(), date: today(), amount: -amount, note: note ?? `Досрочно в ${debt.short}` }],
          } : {}),
        };
      }),

      applyBonus: ({ amount, reserveAfter, allocations, title, eventKey }) => set(s => {
        let debts = s.debts;
        for (const a of allocations) debts = debts.map(d => (d.id === a.debtId ? patchDebt(d, d.balance - a.amount, true) : d));
        const sent = allocations.reduce((t, a) => t + a.amount, 0);
        const names = allocations.map(a => s.debts.find(d => d.id === a.debtId)?.short).filter(Boolean).join(', ');
        const marks = eventKey ? { ...s.marks, [eventKey]: { done: true, amount, at: nowIso() } } : s.marks;
        return {
          ...withSnapshot(debts, s.snapshots),
          marks,
          reserve: reserveAfter,
          reserveLog: [...s.reserveLog, { id: uid(), date: today(), amount: reserveAfter - s.reserve, note: `${title}: ${sent ? `в долг ${Math.round(sent)} (${names}), ` : ''}остальное в резерв` }],
        };
      }),

      moveReserve: (amount, note) => set(s => ({ reserve: s.reserve + amount, reserveLog: [...s.reserveLog, { id: uid(), date: today(), amount, note }] })),
      setReserve: (balance, note) => set(s => ({ reserve: balance, reserveLog: [...s.reserveLog, { id: uid(), date: today(), amount: balance - s.reserve, note }] })),

      addWish: w => set(s => ({ wishes: [...s.wishes, { ...w, id: uid(), createdAt: nowIso() }] })),
      resolveWish: (id, r) => set(s => ({ wishes: s.wishes.map(w => (w.id === id ? { ...w, resolved: r, resolvedAt: nowIso() } : w)) })),

      setSettings: patch => set(s => ({ settings: { ...s.settings, ...patch } })),

      exportData: () => {
        const { settings, planCode: _code, ...rest } = pickData(get());
        // ключ API и код плана в резервную копию не кладём: файл может попасть в облако или к другим людям
        return JSON.stringify({ app: 'kurs', version: 2, exportedAt: nowIso(), ...rest, settings: { ...settings, apiKey: '' } }, null, 1);
      },
      importData: raw => {
        const d = raw as Partial<Data> & { app?: string };
        if (!d || d.app !== 'kurs' || !Array.isArray(d.debts) || !Array.isArray(d.expenses)) return false;
        set(s => ({ ...EMPTY, ...pickData({ ...EMPTY, ...d } as Data), fixed: withIds(d.fixed ?? []), ready: true, planCode: s.planCode, settings: { ...DEFAULT_SETTINGS, ...d.settings, apiKey: s.settings.apiKey } }));
        return true;
      },
      reset: () => set({ ...EMPTY }),
    }),
    {
      name: 'kurs',
      version: 4,
      partialize: s => pickData(s),
      // версия 1: обязательные платежи без id — добавляем, остальное новые поля берут значения по умолчанию;
      // версия 2: файл из чата задваивал траты, уже внесённые под другим названием, — убираем копии один раз;
      // версия 3: подпись банка «Транспорт» записывалась в «кафе и досуг» — поправляем категорию
      migrate: (persisted, version) => {
        const p = persisted as Partial<Data>;
        let expenses = p.expenses;
        if (version < 3 && expenses) {
          const r = dropChatTwins(expenses);
          expenses = r.expenses;
          cleanedTwins = r.removed.length;
        }
        if (version < 4 && expenses) expenses = fixDefaultCategories(expenses);
        return { ...p, expenses, fixed: withIds(p.fixed ?? []) } as State;
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<Data> | undefined;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p?.settings } };
      },
    },
  ),
);

// расчёты плана (этапы, лимиты) читают цифры прямо из хранилища
setPlanSource(() => useStore.getState().plan);

function withIds(list: (Omit<FixedItem, 'id'> & { id?: string })[]): FixedItem[] {
  return list.map((f, i) => ({ ...f, id: f.id ?? `fixed-${i}` }));
}

function pickData(s: Data): Data {
  const keys = Object.keys(EMPTY) as (keyof Data)[];
  return Object.fromEntries(keys.map(k => [k, s[k] ?? EMPTY[k]])) as unknown as Data;
}

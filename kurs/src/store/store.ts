import { allocatePayrollReceipt, payrollReceiptParts } from '../domain/payrollReceipts';
// Всё хранится только на телефоне (localStorage). Никаких аккаунтов и серверов.
// Резервная копия — файл JSON (Настройки → Данные), календарь — файл .ics.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { accountOptions, appendOperations, cents, kopecks, bookOperationAllowed, cashAccount, linkedExpenseId, expenseOperation, EMPTY_BOOK, LIFE_ACCOUNT, RESERVE_ACCOUNT, reversibleOperation, reviseOperations, validAmount, validDate, validSplitDebit, validSplitPlan, validPayoffTerms, type PayoffTerms, type AccountBook, type AccountOperation, type BankBalance, type BankImportBatch, type CashAccount, type SplitDebit, type SplitPlan } from '../domain/accounts';
import { DEFAULT_MODEL } from '../domain/models';
import { DEFAULT_PREPARATION_TIME, moscowClock, paymentBudget, paymentShares, partialPayments, weeklyTopUp, type FundingMode } from '../domain/funds';
import { coverageInput, safePrepayment } from '../domain/coverage';
import { annuity, cashIncomeEvent, eventsBetween } from '../domain/calendar';
import { addDays, monthKey, monthsBetween, toKey, today, weekStart } from '../domain/dates';
import { setPlanSource, totalDebt, weeklyLimit, type PlanConfig } from '../domain/plan';
import { validPayroll, type PayrollProfile } from '../domain/payroll';
import { mergeSeed } from '../domain/planUpdate';
import type { Bridge } from '../domain/bridge';
import { fixDefaultCategories } from '../domain/categorize';
import { dropChatTwins, exchangeRevision } from '../domain/exchange';
import { canVoidOperation, freshReserve, heldKeys, ledger, reserveAnchor, type Checkup } from '../domain/ledger';
import type { CalEvent, CalendarOverride, CardBalance, ChecklistItem, Debt, DebtSnapshot, EventMark, Expense, FixedItem, IncomeTemplate, MemoryRule, PlanSeed, ReserveMove, Settings, StrategySection, WeekClosure, WeeklyOverride, WishItem } from '../domain/types';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  apiKey: '',
  model: DEFAULT_MODEL,
  hideAmounts: false,
  remindDays: [3, 1, 0],
  remindTime: '10:00',
  badge: false,
  preparationTime: DEFAULT_PREPARATION_TIME,
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
  overrides: Record<string, CalendarOverride>;
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
  /** мост на кредитке до премии; null — нет */
  bridge: Bridge | null;
  /** память продавцов: название → категория, «это я» или «пропускать» */
  merchantMemory: Record<string, MemoryRule>;
  /** воскресные сверки с банком: журнал и точка отсчёта учёта по счетам */
  checkups: Checkup[];
  accountBook: AccountBook;
  work: PayrollProfile | null;
  /** последние импорты из чата со снимком данных до них — чтобы откатить неверный блок */
  imports: ImportRecord[];
  exchangePatchIds: string[];
  settings: Settings;
}

interface Actions {
  loadSeed: (seed: PlanSeed, code?: string) => void;
  /** новая редакция плана: стратегия меняется, данные остаются */
  updateFromSeed: (seed: PlanSeed, code: string) => void;
  /** обновление плана из чата «Финансы» */
  /** изменения из файла обмена с чатом: резерв и копилка пишутся в журнал, долги — в снимок месяца */
  /** summary — запомнить импорт и снимок данных до него (хранятся последние 5) */
  applySync: (patch: Partial<Data>, summary?: string) => void;
  saveCashAccount: (id: string, name: string, amount?: number) => void;
  fundPayment: (id: string, mode: FundingMode, keys: string[], eventDate: string, target: string, amount: number, date: string) => boolean;
  keepIncomeForWeek: (id: string, amount: number, date: string) => boolean;
  voidOperation: (id: string) => boolean;
  sweepIncome: (id: string, accountId: string, amount: number, date: string) => boolean;
  returnEarmark: (id: string, accountId: string, key: string, amount: number, date: string) => boolean;
  confirmWeeklyTransfer: (key: string, amount: number, date?: string) => boolean;
  savePayoffTerms: (id: string, terms: PayoffTerms) => boolean;
  saveOperation: (op: AccountOperation) => boolean;
  linkPayrollReceipt: (id: string, keys: string[]) => boolean;
  linkPaymentExpense: (operationId: string, expenseId: string, budgetScope: 'weekly' | 'separate' | 'unknown') => boolean;
  setPaymentFunding: (operationId: string, scope: 'weekly' | 'separate') => boolean;
  setPaymentAccount: (key: string, accountId: string) => void;
  saveSplitPlan: (plan: SplitPlan) => void;
  saveSplitDebit: (debit: SplitDebit) => void;
  saveWork: (work: PayrollProfile) => boolean;
  setStress: (stress: AccountBook['stress']) => void;
  /** запомнить снимок данных до импорта из банка — откатить можно так же, как импорт из чата */
  beginImport: (summary: string) => void;
  applyBankImport: (revision: string, summary: string, batch: BankImportBatch | undefined, apply: (state: State) => void) => boolean;
  /** запомнить продавца; null — забыть */
  remember: (key: string, rule: MemoryRule | null) => void;
  /** вернуть данные к снимку до импорта; этот и более поздние импорты уходят из журнала */
  rollbackImport: (id: string) => void;
  toggleCheck: (id: string) => void;
  closeWeek: (c: Omit<WeekClosure, 'at'>) => void;
  /** воскресная сверка: остатки из банка становятся точкой отсчёта, пополнение и перевод в резерв — ровно один раз */
  checkup: (c: Omit<Checkup, 'id' | 'at' | 'date' | 'after'>, closure: Omit<WeekClosure, 'at' | 'topUp'> | null) => void;
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
  markEvent: (e: CalEvent, done: boolean, amount?: number, paidFrom?: EventMark['paidFrom'], details?: { accountId?: string; bankAt?: string; externalId?: string; bankVerified?: boolean; budgetScope?: 'weekly' | 'separate' | 'unknown'; partialId?: string; principal?: number; interest?: number; fee?: number; paidDate?: string; payrollActual?: { gross?: number; tax?: number; otherWithheld?: number } }) => void;
  updateDebt: (id: string, patch: Partial<Debt>) => void;
  /** точная сумма/дата платежа из банка */
  setOverride: (key: string, o: Pick<CalendarOverride, 'amount' | 'date' | 'prepareOn'>) => void;
  addDebt: (d: Debt) => void;
  removeDebt: (id: string) => void;
  /** досрочное погашение; fromReserve — деньги взяты из резерва */
  prepay: (id: string, amount: number, accountId: string, parts: { principal: number; interest?: number; fee?: number; bankConfirmed?: true }) => boolean;
  /** премия: резерв становится reserveAfter, остальное — досрочно по списку */
  applyBonus: (opts: { id: string; amount: number; accountId: string; title: string; eventKey?: string; date?: string }) => boolean;
  /** card — перевод между картой и резервом: на сколько изменилась карта */
  /** card — на сколько изменилась карта (перевод между картой и резервом); forKeys — платежи, под которые перевели */
  moveReserve: (amount: number, note: string, card?: number, forKeys?: string[]) => void;
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

export interface ImportRecord {
  id: string;
  at: string;
  summary: string;
  revision?: string;
  afterRevision?: string;
  snapshot: Omit<Data, 'imports' | 'settings' | 'planCode' | 'ready'>;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const nowIso = () => new Date().toISOString();

const confirmation = (date: string) => ({
  date, createdAt: nowIso(), at: date === moscowClock().date ? nowIso() : undefined,
  origin: 'manual' as const, status: 'confirmed' as const, fundingSource: 'own' as const,
});

/** Persist deterministic links while older backups can still reconstruct the same entries. */
function withExpenses(book: AccountBook, expenses: Expense[]): AccountBook {
  const explicit = book.operations.filter(op => !op.legacyExpense);
  const linked = new Set(explicit.map(linkedExpenseId));
  const entries = expenses.filter(e => e.amount > 0 && !linked.has(e.id)).map(e => expenseOperation(e, book));
  return { ...book, operations: [...explicit, ...entries] };
}

const includedAt = (expenses: Expense[], date: string) => expenses.filter(e => e.date <= date).map(e => e.id);

const operationIdsAt = (book: AccountBook, date: string) =>
  book.operations.filter(op => op.status === 'confirmed' && op.date <= date).map(op => op.id);

function captureCardBalance(balance: CardBalance, expenses: Expense[], book: AccountBook): CardBalance {
  if (balance.at || balance.kind && balance.operationIds) return balance;
  return { ...balance, ...(balance.date === today() ? { at: nowIso() } : {}),
    includedExpenseIds: balance.includedExpenseIds ?? includedAt(expenses, balance.date), operationIds: balance.operationIds ?? operationIdsAt(book, balance.date) };
}

/** Старые файлы обмена сохраняли время импорта только в журнале. */
function restoreCardTime(balance: CardBalance | null, imports: ImportRecord[]): CardBalance | null {
  if (!balance || balance.at || balance.kind || balance.source !== 'manual') return balance;
  const entry = [...imports].reverse().find(({ snapshot }) => {
    const prior = snapshot.cardBalance;
    return !prior || prior.date !== balance.date || prior.amount !== balance.amount || prior.source !== balance.source;
  });
  if (!entry || toKey(new Date(entry.at)) !== balance.date) return balance;
  return { ...balance, at: entry.at };
}

const EMPTY: Data = {
  ready: false, asOf: today(), debts: [], incomes: [], fixed: [], oneOff: [], templateFrom: monthKey(today()),
  weeklyOverrides: [], planTrajectory: [], baselineTrajectory: [], reserve: 0, reserveLog: [], expenses: [], marks: {}, wishes: [], snapshots: [], overrides: {}, plan: null,
  planRev: 0, planCode: '', checklist: [], strategy: [], rules: [], checks: {}, savings: 0, savingsLog: [], closures: {}, cardBalance: null, bridge: null, checkups: [], merchantMemory: {}, imports: [],
  settings: DEFAULT_SETTINGS, accountBook: { ...EMPTY_BOOK, paymentRouting: 'life' }, work: null, exchangePatchIds: [],
};

/** Снимок общего долга за текущий месяц — для графика «план против факта» */
function withSnapshot(debts: Debt[], snapshots: DebtSnapshot[]): { debts: Debt[]; snapshots: DebtSnapshot[] } {
  const month = monthKey(today());
  return { debts, snapshots: [...snapshots.filter(s => s.month !== month), { month, total: Math.round(totalDebt(debts)) }].sort((a, b) => a.month.localeCompare(b.month)) };
}

/** Применить изменение к долгу: закрыт при нуле, аннуитету (Сплит) пересчитать платёж после досрочки */
function bankDebt(debt: Debt, amount: number, s: Data): Debt {
  const now = new Date();
  const date = toKey(now);
  const next = patchDebt(debt, amount);
  return { ...next, updatedAt: now.toISOString(), bankBalance: {
    amount: next.balance, date, at: now.toISOString(),
    includedIds: [...operationIdsAt(s.accountBook, date), ...s.expenses.filter(e => e.creditCard === debt.id && e.date <= date).map(e => e.id)],
  } };
}

// Пополнение карты жизни берётся из резерва: отметка в календаре сдвигает резерв на разницу с прежней отметкой.
function topUpMove(s: Data, key: string, amount: number, note = 'Долил карту жизни до недельного лимита'): Partial<Pick<Data, 'reserve' | 'reserveLog'>> {
  const prev = s.marks[key]?.done ? s.marks[key].amount ?? 0 : 0;
  const diff = amount - prev;
  if (!diff) return {};
  return { reserve: s.reserve - diff, reserveLog: [...s.reserveLog, { id: uid(), date: today(), at: nowIso(), amount: -diff, note }] };
}

function patchDebt(d: Debt, balance: number, recalc = false): Debt {
  const b = Math.max(0, Math.round(balance * 100) / 100);
  const closed = b <= 0.5 && (d.kind !== 'card' || d.closed);
  let rule = d.rule;
  if (recalc && !closed && rule.type === 'annuity') {
    const left = monthsBetween(monthKey(today()), monthKey(rule.endDate));
    rule = { ...rule, amount: annuity(b, d.rate, Math.max(1, left)) };
  }
  return { ...d, balance: b, closed, closedOn: closed ? (d.closedOn ?? today()) : undefined, rule, updatedAt: nowIso() };
}

export const useStore = create<State>()(
  persist(
    (commit, read) => {
      let staged: State | undefined;
      const get = () => staged ?? read();
      const set = (change: Partial<State> | ((state: State) => Partial<State>)) => {
        if (staged) staged = { ...staged, ...(typeof change === 'function' ? change(staged) : change) };
        else commit(change);
      };
      return {
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
      applySync: (patch, summary) => set(s => {
        const next: Partial<Data> = { ...patch };
        if (patch.cardBalance) next.cardBalance = captureCardBalance(patch.cardBalance, patch.expenses ?? s.expenses, patch.accountBook ?? s.accountBook);
        if (!patch.reserveLog && patch.reserve != null && patch.reserve !== s.reserve) {
          next.reserveLog = [...s.reserveLog, { id: uid(), date: today(), at: nowIso(), abs: true, operationIds: operationIdsAt(patch.accountBook ?? s.accountBook, today()), amount: patch.reserve - s.reserve, note: 'Сверка из чата «Финансы»' }];
        }
        if (patch.savings != null && patch.savings !== s.savings) {
          next.savingsLog = [...s.savingsLog, { id: uid(), date: today(), amount: patch.savings - s.savings, note: 'Сверка из чата «Финансы»' }];
        }
        if (patch.debts) Object.assign(next, withSnapshot(patch.debts, s.snapshots));
        if (patch.expenses || patch.accountBook && s.accountBook.operations.some(op => op.legacyExpense)) {
          next.accountBook = withExpenses(next.accountBook ?? s.accountBook, next.expenses ?? s.expenses);
        }
        if (summary != null) {
          const { imports, settings, planCode, ready, ...snapshot } = pickData(s);
          void settings; void planCode; void ready;
          next.imports = [...imports, { id: uid(), at: nowIso(), summary, revision: exchangeRevision(s), afterRevision: exchangeRevision({ ...s, ...next }), snapshot }].slice(-5);
        }
        return next;
      }),
      saveCashAccount: (id, name, amount) => set(s => {
        if (!id || [LIFE_ACCOUNT, RESERVE_ACCOUNT].includes(id) || !name.trim() || (amount != null && !validAmount(amount))) return {};
        const date = today();
        const previous = s.accountBook.accounts.find(a => a.id === id);
        const balance: BankBalance | undefined = amount == null ? previous?.balance : {
          amount, date, at: nowIso(),
          includedIds: [...operationIdsAt(s.accountBook, date), ...s.expenses.filter(e => cashAccount(e) === id && e.date <= date).map(e => e.id)],
        };
        const account: CashAccount = { id, name: name.trim(), balance };
        return { accountBook: { ...s.accountBook, accounts: [...s.accountBook.accounts.filter(a => a.id !== id), account] } };
      }),
      fundPayment: (id, mode, keys, eventDate, target, amount, date) => {
        const s = get();
        if (!validDate(eventDate) || !validDate(date) || date > moscowClock().date || !validAmount(amount) ||
            cents(amount) <= 0 || target === RESERVE_ACCOUNT || (target === LIFE_ACCOUNT && ['via', 'forward', 'existing'].includes(mode))) return false;
        const events = eventsBetween(s, eventDate, eventDate).filter(e => keys.includes(e.key) && e.kind === 'payment' &&
          !e.projection && e.accountId === target && !s.marks[e.key]?.done);
        if (!events.length || events.length !== keys.length) return false;
        const led = ledger({ ...s, now: moscowClock().date });
        const source = mode === 'allocate' || mode === 'existing' ? target : mode === 'forward' ? LIFE_ACCOUNT : RESERVE_ACCOUNT;
        const destination = mode === 'via' ? LIFE_ACCOUNT : target;
        const physical = source === LIFE_ACCOUNT ? led.card : led.cashAccounts.find(a => a.id === source)?.expected;
        const held = led.heldForPayments.filter(row => row.accountId === source).reduce((sum, row) => sum + row.amount, 0);
        const pending = led.pendingSweepToReserve[source] ?? 0;
        const available = mode === 'allocate' ? Math.min(pending, (physical ?? 0) - held)
          : mode === 'existing' ? Math.max(0, (physical ?? 0) - held - pending)
            : mode === 'forward' ? Math.max(0, (physical ?? 0) - pending - (led.lifeAvailable ?? 0) - led.unassignedOnCard) : led.reserve;
        if (cents(amount) > cents(available)) return false;
        if (s.accountBook.paymentRouting === 'life' && mode === 'reserve' &&
            cents(amount) > events.reduce((total, event) => total + Math.max(0, cents(event.amount) -
              cents(led.heldForPayments.find(row => row.key === event.key && row.accountId === target)?.amount ?? 0)), 0)) return false;
        const shares = paymentShares(events, led.heldForPayments, amount, target, mode);
        if (!shares?.length) return false;
        const base = { id, amount: kopecks(amount), accountId: source, ...confirmation(date) };
        return s.saveOperation(mode === 'allocate' || mode === 'existing' ? { ...base, type: 'allocation', shares, ...(mode === 'existing' ? { existingCash: true } : {}) } :
          { ...base, type: 'transfer', purpose: 'prepare', toAccountId: destination, shares });
      },
      sweepIncome: (id, accountId, amount, date) => {
        const s = get();
        const led = ledger({ ...s, now: moscowClock().date });
        const physical = accountId === LIFE_ACCOUNT ? led.card : led.cashAccounts.find(a => a.id === accountId)?.expected;
        const held = led.heldForPayments.filter(row => row.accountId === accountId).reduce((sum, row) => sum + row.amount, 0);
        if (!validDate(date) || date > moscowClock().date || !validAmount(amount) || cents(amount) <= 0 ||
            cents(amount) > cents(Math.min(led.pendingSweepToReserve[accountId] ?? 0, (physical ?? 0) - held))) return false;
        return s.saveOperation({ id, accountId, toAccountId: RESERVE_ACCOUNT, type: 'transfer', purpose: 'sweep',
          amount: kopecks(amount), ...confirmation(date) });
      },
      keepIncomeForWeek: (id, amount, date) => {
        const s = get();
        const now = moscowClock().date;
        const led = ledger({ ...s, now });
        const limit = weeklyLimit(s.debts, weekStart(now), s.weeklyOverrides);
        if (!validDate(date) || date > now || !validAmount(amount) || cents(amount) <= 0 || led.lifeAvailable == null ||
            cents(amount) > cents(Math.min(weeklyTopUp(limit, led.lifeAvailable), led.pendingSweepToReserve[LIFE_ACCOUNT] ?? 0)) ||
            led.allocationShortfall > 0) return false;
        return s.saveOperation({ id, accountId: LIFE_ACCOUNT, amount: kopecks(amount), type: 'allocation', toWeekly: true,
          ...confirmation(date) });
      },
      voidOperation: id => {
        const s = get();
        const op = s.accountBook.operations.find(row => row.id === id);
        if (!op || op.status !== 'confirmed' || !reversibleOperation(op) || !canVoidOperation(s, op, moscowClock().date)) return false;
        const marks = { ...s.marks };
        if (op.eventKey) delete marks[op.eventKey];
        const operations = appendOperations(s.accountBook.operations, [{ ...op, status: 'voided' }]);
        set({ accountBook: reviseOperations(s.accountBook, operations, nowIso(), 'Отмена подтверждения'), marks });
        return true;
      },
      returnEarmark: (id, accountId, key, amount, date) => {
        const s = get();
        const led = ledger({ ...s, now: moscowClock().date });
        const held = led.heldForPayments.find(row => row.key === key && row.accountId === accountId);
        if (!held || !validDate(date) || date > moscowClock().date || !validAmount(amount) ||
            cents(amount) <= 0 || cents(amount) > cents(held.amount)) return false;
        return s.saveOperation({ id, accountId, toAccountId: RESERVE_ACCOUNT, type: 'transfer', purpose: 'return',
          amount: kopecks(amount), shares: [{ key, amount: kopecks(amount) }], ...confirmation(date) });
      },
      confirmWeeklyTransfer: (key, amount, date = moscowClock().date) => {
        const s = get();
        const monday = key.slice(3);
        const now = moscowClock().date;
        if (!key.startsWith('wk:') || !validDate(monday) || !validDate(date) || date > now ||
            s.marks[key]?.done || !validAmount(amount) || cents(amount) <= 0) return false;
        const led = ledger({ ...s, now });
        if (led.lifeAvailable == null || cents(amount) > cents(led.reserve)) return false;
        const limit = weeklyLimit(s.debts, monday, s.weeklyOverrides);
        const topUp = weeklyTopUp(limit, led.lifeAvailable);
        if (s.accountBook.paymentRouting === 'life' && cents(amount) !== cents(topUp)) return false;
        const id = s.accountBook.operations.some(op => op.id === key) ? uid() : key;
        const op: AccountOperation = { id, type: 'transfer', purpose: 'weekly', eventKey: key,
          accountId: RESERVE_ACCOUNT, toAccountId: LIFE_ACCOUNT, amount: kopecks(amount), ...confirmation(date),
          weeklyExcess: Math.max(0, kopecks(amount - topUp)) };
        const operations = appendOperations(s.accountBook.operations, [op]);
        if (operations === s.accountBook.operations) return false;
        set({ accountBook: { ...s.accountBook, operations },
          marks: { ...s.marks, [key]: { done: true, amount: op.amount, paidDate: date, at: nowIso() } } });
        return true;
      },
      savePayoffTerms: (id, terms) => {
        const s = get();
        if (!s.debts.some(d => d.id === id) || !validPayoffTerms(terms)) return false;
        set({ accountBook: { ...s.accountBook, payoffTerms: { ...s.accountBook.payoffTerms, [id]: terms } } });
        return true;
      },
      saveOperation: op => {
        const s = get();
        if (!bookOperationAllowed(op, s.accountBook, s.debts, s.expenses)) return false;
        if (op.status === 'confirmed' && op.date > moscowClock().date) return false;
        if (op.eventKey && op.type === 'loan_disbursement' && !s.marks[op.eventKey]?.done) return false;
        const operations = appendOperations(s.accountBook.operations, [op]);
        if (operations === s.accountBook.operations) return false;
        const marks = { ...s.marks };
        if (op.eventKey && op.status === 'confirmed' && !('authorization' in op && op.authorization) && !marks[op.eventKey]?.done) {
          marks[op.eventKey] = { done: true, at: op.createdAt ?? nowIso(), paidDate: op.date, amount: op.amount,
            ...(op.type === 'expense' || op.type === 'debt_payment' ? { paidFrom: op.accountId === LIFE_ACCOUNT ? 'card' : 'reserve' } : {}) };
        }
        set({ accountBook: reviseOperations(s.accountBook, operations, nowIso(), 'Уточнение операции'), marks });
        return true;
      },
      linkPayrollReceipt: (id, keys) => {
        const s = get();
        const actual = s.work?.actual;
        const receipt = s.accountBook.operations.find(op => op.id === id);
        if (!actual || !receipt || receipt.date > today() || keys.some(key => s.marks[key]?.done)) return false;
        const parts = keys.map(key => ({ key, amount: actual[key]?.net ?? 0 }));
        const operations = allocatePayrollReceipt(s.accountBook.operations, actual, id, parts);
        if (!operations) return false;
        const marks = { ...s.marks };
        const at = nowIso();
        for (const part of parts) marks[part.key] = { done: true, paidDate: receipt.date, at, amount: part.amount };
        set({ marks, accountBook: reviseOperations(s.accountBook, operations, at, 'Связь банка с расчётным листком') });
        return true;
      },
      setPaymentAccount: (key, accountId) => set(s => {
        const paymentAccounts = { ...s.accountBook.paymentAccounts };
        if (!accountId) delete paymentAccounts[key];
        else if (accountOptions(s.accountBook).some(a => a.id === accountId)) paymentAccounts[key] = accountId;
        return { accountBook: { ...s.accountBook, paymentAccounts } };
      }),
      saveSplitPlan: plan => set(s => (validSplitPlan(plan, s.debts) ? {
        accountBook: { ...s.accountBook, splitPlans: [...s.accountBook.splitPlans.filter(p => p.id !== plan.id), plan] },
      } : {})),
      saveSplitDebit: debit => set(s => (validSplitDebit(debit, s.accountBook, s.debts) && !s.marks[`split-debit:${debit.id}`]?.done && !debit.replacesKeys.some(k => s.marks[k]?.done) ? {
        accountBook: { ...s.accountBook, splitDebits: [...s.accountBook.splitDebits.filter(d => d.id !== debit.id), debit] },
      } : {})),
      saveWork: work => {
        if (!validPayroll(work) || (work.accountId && !accountOptions(get().accountBook).some(a => a.id === work.accountId))) return false;
        set({ work });
        return true;
      },
      setStress: stress => set(s => ({ accountBook: { ...s.accountBook, stress } })),
      beginImport: summary => set(s => {
        const { imports, settings, planCode, ready, ...snapshot } = pickData(s);
        void settings; void planCode; void ready;
        return { imports: [...imports, { id: uid(), at: nowIso(), summary, revision: exchangeRevision(s), snapshot }].slice(-5) };
      }),
      applyBankImport: (revision, summary, batch, apply) => {
        const current = get();
        if (staged || exchangeRevision(current) !== revision ||
            batch && current.accountBook.importBatches?.some(row => row.fileHash === batch.fileHash)) return false;
        staged = current;
        let next: State;
        try {
          apply(staged);
          next = staged;
        } catch { return false; } finally { staged = undefined; }
        if (exchangeRevision(next) === revision && next.merchantMemory === current.merchantMemory) return false;
        const accountBook = batch ? { ...next.accountBook, importBatches: [...next.accountBook.importBatches ?? [], batch] } : next.accountBook;
        const { imports, settings, planCode, ready, ...snapshot } = pickData(current);
        void settings; void planCode; void ready;
        const afterRevision = exchangeRevision({ ...next, accountBook });
        commit({ ...next, accountBook, imports: [...imports, { id: uid(), at: nowIso(), summary, revision, afterRevision, snapshot }].slice(-5) });
        return true;
      },
      remember: (key, rule) => set(s => {
        const merchantMemory = { ...s.merchantMemory };
        if (rule) merchantMemory[key] = rule; else delete merchantMemory[key];
        return { merchantMemory };
      }),
      rollbackImport: id => set(s => {
        const i = s.imports.findIndex(r => r.id === id);
        if (i < 0) return {};
        const last = s.imports.at(-1);
        if (last?.afterRevision && last.afterRevision !== exchangeRevision(s)) return {};
        const snapshot = s.imports[i].snapshot;
        const imports = s.imports.slice(0, i);
        return { ...snapshot, imports, exchangePatchIds: snapshot.exchangePatchIds ?? [], accountBook: { ...(snapshot.accountBook ?? EMPTY_BOOK), paymentRouting: 'life' }, work: snapshot.work ?? null, cardBalance: restoreCardTime(snapshot.cardBalance, imports) };
      }),
      toggleCheck: id => set(s => {
        const base = s.checklist.find(c => c.id === id)?.done ?? false;
        const cur = s.checks[id]?.done ?? base;
        return { checks: { ...s.checks, [id]: { done: !cur, at: nowIso() } } };
      }),
      closeWeek: c => set(s => {
        // воскресное пополнение: из резерва на карту жизни; в календаре отмечается пополнение следующей недели
        const key = `wk:${addDays(c.monday, 7)}`;
        const top = s.accountBook.operations.some(op => op.eventKey === key) ? 0 : c.topUp ?? 0;
        // резерв уже пришёл из банка в воскресенье или позже — пополнение в нём есть, второй раз не вычитаем
        const fresh = freshReserve(s.reserveLog, addDays(c.monday, 6)) && !s.marks[key]?.done;
        return {
          closures: { ...s.closures, [c.monday]: { ...c, at: nowIso() } },
          ...(c.transferred > 0 ? { savings: s.savings + c.transferred, savingsLog: [...s.savingsLog, { id: uid(), date: today(), amount: c.transferred, note: 'Остаток недели' }] } : {}),
          ...(top > 0 ? { ...(fresh ? {} : topUpMove(s, key, top)), marks: { ...s.marks, [key]: { done: true, amount: top, at: nowIso() } } } : {}),
        };
      }),
      checkup: (c, closure) => set(s => {
        const at = nowIso();
        const date = moscowClock().date;
        const key = `wk:${addDays(c.monday, 7)}`;
        const topUp = s.marks[key]?.done ? 0 : c.topUp;
        if (topUp > c.actual.reserve || topUp < 0 || c.toReserve < 0 || c.toReserve > c.actual.card) return {};
        const after = { card: kopecks(c.actual.card + topUp - c.toReserve), reserve: kopecks(c.actual.reserve - topUp + c.toReserve) };
        const led = ledger({ ...s, now: date });
        const nextLimit = weeklyLimit(s.debts, addDays(c.monday, 7), s.weeklyOverrides);
        const discrepancy = led.card == null ? 0 : Math.max(0, kopecks(c.actual.card - led.card));
        const unmatchedOnCard = kopecks(led.unmatchedOnCard + discrepancy);
        const available = Math.max(0, kopecks(c.actual.card - led.heldOnCard - led.incomeOnCard - led.unassignedOnCard - discrepancy));
        const entries: AccountOperation[] = [];
        if (s.accountBook.paymentRouting === 'life' && topUp > 0 && cents(topUp) !== cents(weeklyTopUp(nextLimit, available))) return {};
        const weeklyId = s.accountBook.operations.some(op => op.id === key) ? uid() : key;
        if (topUp > 0) entries.push({ ...confirmation(date), id: weeklyId, eventKey: key, amount: topUp, accountId: RESERVE_ACCOUNT,
          toAccountId: LIFE_ACCOUNT, type: 'transfer', purpose: 'weekly', weeklyExcess: Math.max(0, kopecks(topUp - weeklyTopUp(nextLimit, available))) });
        if (c.toReserve > 0) entries.push({ ...confirmation(date), id: uid(), amount: c.toReserve, accountId: LIFE_ACCOUNT,
          toAccountId: RESERVE_ACCOUNT, type: 'transfer', purpose: 'sweep' });
        const accountBook = { ...s.accountBook, operations: appendOperations(s.accountBook.operations, entries) };
        const includedExpenseIds = includedAt(s.expenses, date);
        const operationIds = operationIdsAt(accountBook, date);
        const entry: Checkup = { ...c, topUp, id: uid(), at, date, after, operationIds, ...(unmatchedOnCard > 0 ? { unmatchedOnCard } : {}) };
        const marks = topUp > 0 ? { ...s.marks, [key]: { done: true, amount: topUp, at, paidDate: date } } : s.marks;
        const closures = closure && !s.closures[c.monday] ? { ...s.closures, [c.monday]: { ...closure, topUp: c.topUp, at } } : s.closures;
        const note = [c.topUp > 0 ? `на карту ${Math.round(c.topUp)}` : '', c.toReserve > 0 ? `с карты ${Math.round(c.toReserve)}` : ''].filter(Boolean).join(', ');
        // долги кредиток — из банка: кредитка моста и остальные, сверенные в тот же раз
        let debts = s.debts;
        const owe = (id: string, balance: number) => { debts = debts.map(d => (d.id === id ? bankDebt(d, balance, s) : d)); };
        if (c.creditCard && c.actual.credit != null) owe(c.creditCard, c.actual.credit);
        for (const k of c.cards ?? []) owe(k.id, k.actual);
        return {
          accountBook,
          checkups: [...s.checkups, entry].slice(-26),
          marks,
          closures,
          reserve: after.reserve,
          reserveLog: [...s.reserveLog, { id: uid(), date, at, abs: true, operationIds, amount: after.reserve - s.reserve, note: `Сверка с банком${note ? `: ${note}` : ''}` }],
          cardBalance: { amount: after.card, date, source: 'manual' as const, at, includedExpenseIds, operationIds, ...(unmatchedOnCard > 0 ? { unmatchedOnCard } : {}) },
          ...(debts !== s.debts ? withSnapshot(debts, s.snapshots) : {}),
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
          ...(s.marks[key]?.done && !s.accountBook.operations.some(op => op.eventKey === key) ? { marks, ...topUpMove(s, key, 0, 'Неделя открыта заново: пополнение отменено') } : {}),
        };
      }),
      moveSavings: (amount, note) => set(s => ({ savings: s.savings + amount, savingsLog: [...s.savingsLog, { id: uid(), date: today(), amount, note }] })),
      setCardBalance: b => set(s => {
        if (!b) return { cardBalance: null };
        const led = ledger(s);
        const unmatched = b.date === moscowClock().date && led.card != null
          ? kopecks(led.unmatchedOnCard + Math.max(0, b.amount - led.card)) : 0;
        return { cardBalance: captureCardBalance({ ...b, ...(unmatched > 0 ? { unmatchedOnCard: unmatched } : {}) }, s.expenses, s.accountBook) };
      }),
      setFixed: list => set({ fixed: list }),
      clearOverride: key => set(s => {
        const overrides = { ...s.overrides };
        delete overrides[key];
        return { overrides };
      }),

      addExpenses: items => set(s => {
        const expenses = [...s.expenses, ...items.filter(i => validAmount(i.amount) && i.amount > 0 && validDate(i.date))
          .map(i => ({ ...i, id: uid(), createdAt: nowIso() }))].sort((a, b) => a.date.localeCompare(b.date));
        return { expenses, accountBook: withExpenses(s.accountBook, expenses) };
      }),
      updateExpense: (id, patch) => set(s => {
        const current = s.expenses.find(e => e.id === id);
        const linked = s.accountBook.operations.some(op => !op.legacyExpense && linkedExpenseId(op) === id);
        if (!current || linked) return {};
        const next = { ...current, ...patch, id: current.id, createdAt: current.createdAt };
        const refunds = s.accountBook.operations.filter(op => op.type === 'refund' && op.expenseId === id && op.status === 'confirmed');
        if (!validAmount(next.amount) || next.amount <= 0 || !validDate(next.date) ||
            refunds.some(op => op.date < next.date || next.source !== current.source || cashAccount(next) !== cashAccount(current) || next.creditCard !== current.creditCard) ||
            refunds.reduce((sum, op) => sum + cents(op.amount), 0) > cents(next.amount)) return {};
        const expenses = s.expenses.map(e => e.id === id ? next : e);
        return { expenses, accountBook: withExpenses({ ...s.accountBook,
          expenseChanges: [...(s.accountBook.expenseChanges ?? []), { at: nowIso(), before: current, after: next }] }, expenses) };
      }),
      removeExpense: id => set(s => {
        if (s.accountBook.operations.some(op => !op.legacyExpense && (linkedExpenseId(op) === id ||
            op.type === 'refund' && op.expenseId === id && op.status === 'confirmed'))) return {};
        const current = s.expenses.find(e => e.id === id);
        if (!current) return {};
        const expenses = s.expenses.filter(e => e.id !== id);
        return { expenses, accountBook: withExpenses({ ...s.accountBook,
          expenseChanges: [...(s.accountBook.expenseChanges ?? []), { at: nowIso(), before: current }] }, expenses) };
      }),
      linkPaymentExpense: (operationId, expenseId, budgetScope) => {
        const s = get();
        const op = s.accountBook.operations.find(row => row.id === operationId);
        const expense = s.expenses.find(row => row.id === expenseId);
        if (op?.type !== 'expense' || !op.eventKey || op.expenseId || op.status !== 'confirmed' || !expense ||
            cents(op.amount) !== cents(expense.amount) || op.date !== expense.date ||
            s.accountBook.operations.some(row => !row.legacyExpense && linkedExpenseId(row) === expenseId)) return false;
        const budget = paymentBudget(op.amount, op.budget?.prepared ?? 0, budgetScope);
        const operations = s.accountBook.operations.map(row => row.id === operationId
          ? { ...op, expenseId, note: expense.note ?? op.note, category: expense.category, budget } : row);
        set({ accountBook: withExpenses(reviseOperations(s.accountBook, operations, nowIso(), 'Сверка расхода и платежа'), s.expenses) });
        return true;
      },
      setPaymentFunding: (operationId, scope) => {
        const s = get();
        const op = s.accountBook.operations.find(row => row.id === operationId);
        if (!op || op.status !== 'confirmed' || (op.type !== 'expense' && op.type !== 'debt_payment') || !op.budget?.unknown) return false;
        const budget = { ...op.budget, unknown: 0, [scope]: kopecks(op.budget[scope] + op.budget.unknown) };
        const operations = s.accountBook.operations.map(row => row.id === operationId ? { ...op, budget } : row);
        set({ accountBook: reviseOperations(s.accountBook, operations, nowIso(), 'Уточнение бюджета платежа') });
        return true;
      },

      markEvent: (e, done, amount, paidFrom, details) => {
        const state = get();
        if (payrollReceiptParts(state.accountBook.operations).has(e.key)) return;
        if (done && e.kind === 'weekly' && state.accountBook.paymentRouting === 'life' && details?.paidDate) {
          state.confirmWeeklyTransfer(e.key, amount ?? e.amount, details?.paidDate);
          return;
        }
        const payment = state.accountBook.operations.find(op => op.eventKey === e.key && op.status === 'confirmed');
        if (!done && payment && reversibleOperation(payment)) { state.voidOperation(payment.id); return; }
        set(s => {
          const prev = s.marks[e.key];
          const linked = s.accountBook.operations.find(op => op.eventKey === e.key && op.status === 'confirmed');
          if (linked?.type === 'loan_disbursement' || (linked?.type === 'transfer' && linked.purpose === 'weekly') || s.accountBook.historicalLoans?.some(loan => loan.eventKey === e.key) ||
              (done && (e.payroll?.documented && !details?.bankVerified || e.projection === 'internal_transfer'))) return {};
          const singleCard = s.accountBook.paymentRouting === 'life';
          if (done && details?.externalId && s.accountBook.operations.some(op => op.externalId === details.externalId)) return {};
          if (done && e.economicType === 'loan_disbursement') return {};
          const marks = { ...s.marks };
          let debts = s.debts;
          let accountBook = s.accountBook;
          let work = s.work;
          const debt = e.debtId ? s.debts.find(d => d.id === e.debtId) : undefined;
          if (done) {
            if (prev?.done && e.kind !== 'weekly') return {};
            const paid = amount ?? e.amount;
            if (!validAmount(paid) || paid < 0) return {};
            const at = nowIso();
            const date = details?.paidDate ?? moscowClock().date;
            if (!validDate(date) || date > moscowClock().date) return {};
            const from = singleCard ? details?.externalId && details.accountId === RESERVE_ACCOUNT ? 'reserve' : 'card' : paidFrom ?? (heldKeys(s.reserveLog, s.marks).has(e.key) ? 'card' : 'reserve');
            marks[e.key] = { done: true, amount: paid, at, paidDate: date, ...(e.kind === 'payment' ? { paidFrom: from } : {}) };
            if (e.kind === 'weekly') return { marks, ...topUpMove(s, e.key, paid) };
            const accountId = singleCard && !details?.externalId ? LIFE_ACCOUNT : details?.accountId ?? e.accountId ?? (from === 'card' ? LIFE_ACCOUNT : RESERVE_ACCOUNT);
            const bookedAt = details?.bankAt ?? (!details?.externalId && date === moscowClock().date ? at : undefined);
            const held = e.kind === 'payment' ? ledger({ ...s, now: moscowClock().date }).heldForPayments
              .find(row => row.key === e.key && row.accountId === accountId)?.amount ?? 0 : 0;
            const budget = paymentBudget(paid, held, details?.budgetScope ?? (accountId === RESERVE_ACCOUNT ? 'separate' : 'unknown'));
            const partialId = e.kind === 'payment' ? details?.partialId : undefined;
            const previouslyPaid = partialPayments(accountBook.operations).get(e.key) ?? 0;
            if (partialId && (cents(paid) <= 0 || cents(paid) >= cents(e.amount))) return {};
            const link = { ...(partialId ? { id: partialId, partialFor: e.key } : { id: uid(), eventKey: e.key }), externalId: details?.externalId };
            if (e.kind === 'payment') {
              if (partialId) delete marks[e.key];
              else if (previouslyPaid) marks[e.key].amount = kopecks(paid + previouslyPaid / 100);
            }
            if (e.kind === 'payment' && (debt || e.key.startsWith('split-debit:'))) {
              const op: AccountOperation = {
                ...link, type: 'debt_payment', debtId: debt?.id, accountId, amount: paid,
                date, at: bookedAt, createdAt: at, origin: 'manual', status: 'confirmed', fundingSource: 'unknown', budget,
                principal: details?.principal, interest: details?.interest, fee: details?.fee,
              };
              if (!bookOperationAllowed(op, accountBook, debts, s.expenses)) return {};
              const operations = appendOperations(accountBook.operations, [op]);
              if (operations === accountBook.operations) return {};
              accountBook = { ...accountBook, operations };
            }
            if (e.kind === 'payment' && !debt && !e.key.startsWith('split-debit:') && (singleCard || details?.accountId)) {
              const op: AccountOperation = { ...link, type: 'expense', amount: paid,
                accountId, date, at: bookedAt, createdAt: at, origin: 'manual', status: 'confirmed', fundingSource: 'unknown', budget };
              if (!bookOperationAllowed(op, accountBook, debts, s.expenses)) return {};
              const operations = appendOperations(accountBook.operations, [op]);
              if (operations === accountBook.operations) return {};
              accountBook = { ...accountBook, operations };
            }
            if (cashIncomeEvent(e) && (singleCard || e.accountId || e.nominalDate || e.incomeKind)) {
              const op: AccountOperation = { ...link, type: 'income', amount: paid,
                accountId: details?.externalId ? accountId : singleCard ? LIFE_ACCOUNT : e.accountId ?? LIFE_ACCOUNT, date, at: bookedAt, createdAt: at, origin: 'manual', status: 'confirmed', fundingSource: 'own', pendingSweep: true };
              if (!bookOperationAllowed(op, accountBook, debts, s.expenses)) return {};
              const operations = appendOperations(accountBook.operations, [op]);
              if (operations === accountBook.operations) return {};
              accountBook = { ...accountBook, operations };
              if (work && e.nominalDate) {
                const key = e.incomeKind === 'salary' || e.incomeKind === 'advance' || e.incomeKind === 'bonusMonthly'
                  ? `inc:${e.incomeKind}:${monthKey(e.nominalDate)}` : e.key;
                const updated = { ...work, actual: { ...work.actual, [key]: { ...work.actual?.[key], ...details?.payrollActual, expectedNet: e.amount, asOf: date,
                  ...(details?.payrollActual ? { verifiedBy: 'Расчётный листок' } : {}) } } };
                if (!validPayroll(updated)) return {};
                work = updated;
              }
            }
          } else {
            delete marks[e.key];
            if (e.kind === 'weekly') return { marks, ...topUpMove(s, e.key, 0, 'Пополнение карты отменено') };
            if (linked) {
              const led = ledger(s);
              const ref = linked.accountId === LIFE_ACCOUNT ? led.cardFrom?.at :
                linked.accountId === RESERVE_ACCOUNT ? reserveAnchor(s.reserveLog)?.at :
                s.accountBook.accounts.find(a => a.id === linked.accountId)?.balance?.at;
              if (ref && linked.date <= ref.slice(0, 10) && (!linked.at || Date.parse(ref) > Date.parse(linked.at))) return {};
              if (linked.type === 'income' && linked.pendingSweep && (led.pendingSweepToReserve[linked.accountId] ?? 0) < linked.amount) return {};
              if (debt?.bankBalance?.at && Date.parse(debt.bankBalance.at) >= Date.parse(linked.at ?? '')) return {};
              accountBook = reviseOperations(accountBook, accountBook.operations.filter(op => op.id !== linked.id), nowIso(), 'Отмена банковского подтверждения');
            } else if (debt && prev?.prevBalance != null && (!debt.updatedAt || !debt.bankBalance)) {
              debts = s.debts.map(d => (d.id === debt.id ? { ...patchDebt(d, prev.prevBalance!), closedOn: undefined } : d));
            }
          }
          return { marks, accountBook, work, ...withSnapshot(debts, s.snapshots) };
        });
      },

      updateDebt: (id, patch) => set(s => {
        const debts = s.debts.map(d => {
          if (d.id !== id) return d;
          const next = { ...d, ...patch };
          return patch.balance != null ? bankDebt(next, patch.balance, s) : next;
        });
        return withSnapshot(debts, s.snapshots);
      }),
      setOverride: (key, o) => set(s => ({ overrides: { ...s.overrides, [key]: { ...s.overrides[key], ...o } } })),
      addDebt: d => set(s => withSnapshot([...s.debts, d], s.snapshots)),
      removeDebt: id => set(s => withSnapshot(s.debts.filter(d => d.id !== id), s.snapshots)),

      prepay: (id, amount, accountId, parts) => {
        const s = get();
        const debt = s.debts.find(d => d.id === id);
        const date = moscowClock().date;
        if (!debt || debt.closed || !validAmount(amount) || amount <= 0 ||
            s.accountBook.operations.some(op => op.type === 'debt_payment' && op.status === 'confirmed' &&
              !op.eventKey && !op.partialFor && op.debtId === id && op.date === date && op.accountId === accountId &&
              cents(op.amount) === cents(amount))) return false;
        if (!parts.bankConfirmed) {
          const led = ledger({ ...s, now: date });
          if (debt.noPrepay || parts.principal > led.debtBalances[id].estimated ||
              amount > safePrepayment(coverageInput(s, led), date, accountId)) return false;
        }
        const { principal, interest, fee } = parts;
        return s.saveOperation({ principal, interest, fee, id: uid(), debtId: id, amount, accountId, type: 'debt_payment',
          date, at: nowIso(), origin: 'manual', status: 'confirmed', fundingSource: 'unknown', note: 'Досрочное погашение' });
      },

      applyBonus: ({ id, amount, accountId, title, eventKey, date = moscowClock().date }) => {
        const s = get();
        if (date > moscowClock().date || (eventKey && s.marks[eventKey]?.done) ||
            (!eventKey && s.accountBook.operations.some(op => op.type === 'income' && op.status === 'confirmed' &&
              !op.eventKey && op.date === date && op.note === title && cents(op.amount) === cents(amount)))) return false;
        const at = nowIso();
        const op: AccountOperation = { id, amount, accountId: s.accountBook.paymentRouting === 'life' ? LIFE_ACCOUNT : accountId, eventKey, date, at, type: 'income',
          origin: 'manual', status: 'confirmed', fundingSource: 'own', pendingSweep: true, note: title };
        if (!bookOperationAllowed(op, s.accountBook, s.debts, s.expenses)) return false;
        const operations = appendOperations(s.accountBook.operations, [op]);
        if (operations === s.accountBook.operations) return false;
        const marks = eventKey ? { ...s.marks, [eventKey]: { done: true, amount, at, paidDate: date } } : s.marks;
        set({ marks, accountBook: { ...s.accountBook, operations } });
        return true;
      },

      moveReserve: (amount, note, card, forKeys) => {
        if (!validAmount(amount) || !cents(amount)) return;
        const s = get();
        const base = { id: uid(), amount: kopecks(Math.abs(amount)), note, ...confirmation(today()) };
        if (card && cents(card) === -cents(amount) && !forKeys?.length) {
          s.saveOperation({ ...base, type: 'transfer', accountId: card > 0 ? RESERVE_ACCOUNT : LIFE_ACCOUNT,
            toAccountId: card > 0 ? LIFE_ACCOUNT : RESERVE_ACCOUNT, purpose: card > 0 ? 'unassigned' : 'sweep' });
        } else if (!card) {
          s.saveOperation({ ...base, accountId: RESERVE_ACCOUNT, type: amount < 0 ? 'expense' : 'adjustment', fundingSource: 'unknown' });
        }
      },
      setReserve: (balance, note) => set(s => ({ reserve: balance, reserveLog: [...s.reserveLog, { id: uid(), date: today(), at: nowIso(), abs: true, operationIds: operationIdsAt(s.accountBook, today()), amount: balance - s.reserve, note }] })),

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
        set(s => ({ ...EMPTY, ...pickData({ ...EMPTY, ...d } as Data), fixed: withIds(d.fixed ?? []),
          accountBook: withExpenses({ ...(d.accountBook ?? EMPTY_BOOK), paymentRouting: 'life' }, d.expenses!),
          cardBalance: restoreCardTime(d.cardBalance ?? null, d.imports ?? []), ready: true, planCode: s.planCode,
          settings: { ...DEFAULT_SETTINGS, ...d.settings, apiKey: s.settings.apiKey } }));
        return true;
      },
      reset: () => set({ ...EMPTY }),
      };
    },
    {
      name: 'kurs',
      version: 9,
      partialize: s => pickData(s),
      // версия 1: обязательные платежи без id — добавляем, остальное новые поля берут значения по умолчанию;
      // версия 2: файл из чата задваивал траты, уже внесённые под другим названием, — убираем копии один раз;
      // версия 3: подпись банка «Транспорт» записывалась в «кафе и досуг» — поправляем категорию
      migrate: (persisted, version) => {
        const p = persisted as Partial<Data>;
        if (version === 8) {
          const raw = window.localStorage.getItem('kurs');
          if (raw) {
            const key = 'kurs:before-0.9.0';
            try {
              if (window.localStorage.getItem(key) == null) window.localStorage.setItem(key, raw);
            } catch { /* The additive adapter also reads the previous format directly. */ }
          }
        }
        if (version < 8) {
          try {
            const backup = 'kurs:before-0.7.1';
            const raw = window.localStorage.getItem('kurs');
            if (raw && !window.localStorage.getItem(backup)) window.localStorage.setItem(backup, raw);
            if (version < 6 && raw && !window.localStorage.getItem('kurs:before-0.6.0')) window.localStorage.setItem('kurs:before-0.6.0', raw);
          } catch { /* The additive change also works if the browser lacks room for a second copy. */ }
        }
        let expenses = p.expenses;
        if (version < 3 && expenses) {
          const r = dropChatTwins(expenses);
          expenses = r.expenses;
          cleanedTwins = r.removed.length;
        }
        if (version < 4 && expenses) expenses = fixDefaultCategories(expenses);
        const accountBook = { ...(p.accountBook ?? EMPTY_BOOK), paymentRouting: 'life' as const };
        return { ...p, expenses: expenses ?? [], accountBook: version === 8 ? withExpenses(accountBook, expenses ?? []) : accountBook,
          fixed: withIds(p.fixed ?? []) } as State;
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<Data> | undefined;
        return { ...current, ...p, cardBalance: restoreCardTime(p?.cardBalance ?? null, p?.imports ?? []), settings: { ...DEFAULT_SETTINGS, ...p?.settings } };
      },
    },
  ),
);

// расчёты плана (этапы, лимиты) читают цифры прямо из хранилища
setPlanSource(() => useStore.getState().plan);

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', event => {
    if (event.key === 'kurs' && event.newValue) void useStore.persist.rehydrate();
  });
}

function withIds(list: (Omit<FixedItem, 'id'> & { id?: string })[]): FixedItem[] {
  return list.map((f, i) => ({ ...f, id: f.id ?? `fixed-${i}` }));
}

function pickData(s: Data): Data {
  const keys = Object.keys(EMPTY) as (keyof Data)[];
  return Object.fromEntries(keys.map(k => [k, s[k] ?? EMPTY[k]])) as unknown as Data;
}

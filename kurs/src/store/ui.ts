import { budgetExpenses } from '../domain/accounts';
// Состояние интерфейса: какая вкладка и какие листы открыты. Не сохраняется.
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { CalendarInput } from '../domain/calendar';
import type { Scenario } from '../domain/coverage';
import { today } from '../domain/dates';
import { moscowClock, type HeldPayment, type PaymentPreparation } from '../domain/funds';
import type { CalEvent, CategoryId, Expense, Source } from '../domain/types';
import { useStore } from './store';

export type Tab = 'week' | 'payments' | 'plan' | 'budget';
export type PlanView = 'debts' | 'checklist' | 'strategy';
export type PayView = 'month' | 'cover' | 'list';

export interface AddPrefill {
  amount?: number;
  category?: CategoryId;
  note?: string;
  wishId?: string;
  source?: Source;
  date?: string;
  creditCard?: string;
  /** редактирование существующей траты */
  edit?: Expense;
}

interface Ui {
  tab: Tab;
  add: AddPrefill | null;
  scan: boolean;
  settings: boolean;
  event: CalEvent | null;
  /** премия: событие календаря или ручной ввод */
  bonus: { event?: CalEvent } | null;
  debt: string | null;
  reserve: boolean;
  /** итоги недели: понедельник закрываемой недели */
  week: string | null;
  /** копилка недельных остатков */
  savings: boolean;
  /** обмен с чатом «Финансы» */
  sync: boolean;
  /** обязательные платежи */
  fixed: boolean;
  /** остаток на зарплатной карте */
  card: boolean;
  /** «В долг»: заёмные деньги — мост на кредитке */
  loan: boolean;
  /** перевод из резерва на карту под платежи: окно «другая сумма» */
  transfer: { kind: 'payment'; plan: PaymentPreparation } | { kind: 'sweep'; accountId: string; amount: number }
    | { kind: 'return'; held: HeldPayment } | null;
  /** код для новой редакции плана */
  unlock: boolean;
  /** раздел «Плана»: долги, чек-лист, стратегия */
  planView: PlanView;
  /** пункт, к которому перейти и подсветить (чек-лист) */
  focus: string | null;
  /** раздел настроек, к которому прокрутить */
  paymentQueue: boolean;
  paymentReviewDate?: string;
  historyRange?: { from: string; to: string };
  settingsFocus: 'reminders' | 'backup' | null;
  /** файл обмена, доставленный с сайта: открыть в окне обмена */
  inbox: { id: string; text: string } | null;
  /** окно трат за сегодня (нажатие на кольцо дня) */
  today: boolean;
  /** «Банк и чат»: выписка, сверка, обмен с чатом, премия — в одном месте */
  hub: boolean;
  finance: boolean;
  financeView?: 'accounts' | 'journal' | 'split';
  workSheet: boolean;
  /** знакомство с новым интерфейсом */
  tour: boolean;
  /** вид «Платежей»: месяц, хватит ли, список */
  payView: PayView;
  scenario: Scenario;
  /** воскресная сверка с банком: понедельник закрываемой недели */
  checkup: string | null;
  /** раскрытая карточка в стопке «Недели»; null — выбрать по обстановке */
  stackOpen: string | null;
  pwaUpdateReady: boolean;
  toast: string | null;
  /** «Отменить» в сообщении: вернуть как было (5 секунд после записи или отметки) */
  undo: (() => void) | null;
  setTab: (t: Tab) => void;
  set: (p: Partial<Omit<Ui, 'set' | 'setTab'>>) => void;
}

export const useUi = create<Ui>()(set => ({
  tab: 'week', add: null, scan: false, settings: false, event: null, bonus: null, debt: null, reserve: false,
  paymentQueue: false, week: null, savings: false, sync: false, fixed: false, card: false, loan: false, transfer: null, unlock: false, planView: 'debts', focus: null, settingsFocus: null, inbox: null, checkup: null, hub: false, finance: false, workSheet: false, tour: false, payView: 'month', scenario: 'base', today: false, stackOpen: null, pwaUpdateReady: false, toast: null, undo: null,
  // прокрутку каждой вкладки помнит App (useTabScroll)
  setTab: tab => set(s => tab === 'payments' && s.tab !== tab ? { tab, payView: 'month' } : { tab }),
  set: p => set(p),
}));

export const toast = (text: string, undo?: () => void) => useUi.getState().set({ toast: text, undo: undo ?? null });

/** Сделать действие с данными и показать сообщение с «Отменить»: траты, отметки, долги и резерв вернутся как были */
export function withUndo(text: string | (() => string), action: () => void) {
  const s = useStore.getState();
  const before = { expenses: s.expenses, marks: s.marks, debts: s.debts, reserve: s.reserve, reserveLog: s.reserveLog, accountBook: s.accountBook };
  action();
  toast(typeof text === 'function' ? text() : text, () => { useStore.setState(before); toast('Отменено'); });
}

/** Сегодняшняя дата; обновляется, когда приложение снова открыли (оно могло висеть в фоне со вчера) */
export function useToday(): string {
  const [d, setD] = useState(today);
  useEffect(() => {
    const upd = () => setD(today());
    document.addEventListener('visibilitychange', upd);
    const t = setInterval(upd, 60_000);
    return () => { document.removeEventListener('visibilitychange', upd); clearInterval(t); };
  }, []);
  return d;
}

export function useMoscowClock() {
  const [value, setValue] = useState(() => moscowClock());
  useEffect(() => {
    const refresh = () => setValue(moscowClock());
    const timer = setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return value;
}

export function useCal(): CalendarInput {
  const [debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides, bridge, accountBook, work, marks] = useStore(useShallow(s => [s.debts, s.incomes, s.fixed, s.oneOff, s.templateFrom, s.weeklyOverrides, s.overrides, s.bridge, s.accountBook, s.work, s.marks] as const));
  return useMemo(() => ({ debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides, bridge, accountBook, work, marks }), [debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides, bridge, accountBook, work, marks]);
}


export function useBudgetExpenses() {
  const [expenses, book] = useStore(useShallow(s => [s.expenses, s.accountBook] as const));
  return useMemo(() => budgetExpenses(expenses, book), [expenses, book]);
}

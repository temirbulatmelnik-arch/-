// Состояние интерфейса: какая вкладка и какие листы открыты. Не сохраняется.
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { CalendarInput } from '../domain/calendar';
import { today } from '../domain/dates';
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
  /** код для новой редакции плана */
  unlock: boolean;
  /** раздел «Плана»: долги, чек-лист, стратегия */
  planView: PlanView;
  /** пункт, к которому перейти и подсветить (чек-лист) */
  focus: string | null;
  /** раздел настроек, к которому прокрутить */
  settingsFocus: 'reminders' | 'backup' | null;
  /** файл обмена, доставленный с сайта: открыть в окне обмена */
  inbox: { id: string; text: string } | null;
  /** окно трат за сегодня (нажатие на кольцо дня) */
  today: boolean;
  /** «Банк и чат»: выписка, сверка, обмен с чатом, премия — в одном месте */
  hub: boolean;
  /** знакомство с новым интерфейсом */
  tour: boolean;
  /** вид «Платежей»: месяц, хватит ли, список */
  payView: PayView;
  /** воскресная сверка с банком: понедельник закрываемой недели */
  checkup: string | null;
  /** раскрытая карточка в стопке «Недели»; null — выбрать по обстановке */
  stackOpen: string | null;
  toast: string | null;
  setTab: (t: Tab) => void;
  set: (p: Partial<Omit<Ui, 'set' | 'setTab'>>) => void;
}

export const useUi = create<Ui>()(set => ({
  tab: 'week', add: null, scan: false, settings: false, event: null, bonus: null, debt: null, reserve: false,
  week: null, savings: false, sync: false, fixed: false, card: false, loan: false, unlock: false, planView: 'debts', focus: null, settingsFocus: null, inbox: null, checkup: null, hub: false, tour: false, payView: 'month', today: false, stackOpen: null, toast: null,
  // прокрутку каждой вкладки помнит App (useTabScroll)
  setTab: tab => set({ tab }),
  set: p => set(p),
}));

export const toast = (text: string) => useUi.getState().set({ toast: text });

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

export function useCal(): CalendarInput {
  const [debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides, bridge] = useStore(useShallow(s => [s.debts, s.incomes, s.fixed, s.oneOff, s.templateFrom, s.weeklyOverrides, s.overrides, s.bridge] as const));
  return useMemo(() => ({ debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides, bridge }), [debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides, bridge]);
}

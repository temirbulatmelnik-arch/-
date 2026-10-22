// Состояние интерфейса: какая вкладка и какие листы открыты. Не сохраняется.
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { CalendarInput } from '../domain/calendar';
import { today } from '../domain/dates';
import type { CalEvent, CategoryId, Expense } from '../domain/types';
import { useStore } from './store';

export type Tab = 'week' | 'calendar' | 'debts' | 'budget';

export interface AddPrefill {
  amount?: number;
  category?: CategoryId;
  note?: string;
  wishId?: string;
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
  toast: string | null;
  setTab: (t: Tab) => void;
  set: (p: Partial<Omit<Ui, 'set' | 'setTab'>>) => void;
}

export const useUi = create<Ui>()(set => ({
  tab: 'week', add: null, scan: false, settings: false, event: null, bonus: null, debt: null, reserve: false, toast: null,
  setTab: tab => { set({ tab }); window.scrollTo({ top: 0 }); },
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
  const [debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides] = useStore(useShallow(s => [s.debts, s.incomes, s.fixed, s.oneOff, s.templateFrom, s.weeklyOverrides, s.overrides]));
  return useMemo(() => ({ debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides }), [debts, incomes, fixed, oneOff, templateFrom, weeklyOverrides, overrides]);
}

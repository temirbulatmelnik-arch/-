// Траты за сегодня: окно по нажатию на кольцо дня и тело карточки «Сегодня» на «Неделе».
// Сверху — сколько потрачено из лимита дня и что это значит, ниже — траты дня; то, что не входит в лимит (резерв,
// обязательные платежи), — отдельно.
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ExpenseRow } from '../components/rows';
import { Money, PrimaryButton, Sheet } from '../components/ui';
import { dayMonth, plural, weekdayFull } from '../domain/dates';
import { countsWeekly, dayBudget, type DayBudget } from '../domain/summary';
import type { Expense } from '../domain/types';
import { useStore } from '../store/store';
import { useToday, useUi } from '../store/ui';

export function useTodaySpends() {
  const now = useToday();
  const [expenses, debts, overrides] = useStore(useShallow(s => [s.expenses, s.debts, s.weeklyOverrides] as const));
  return useMemo(() => {
    const list = expenses.filter(e => e.date === now).reverse();
    return { now, budget: dayBudget(expenses, debts, overrides, now), counted: list.filter(countsWeekly), outside: list.filter(e => !countsWeekly(e)) };
  }, [expenses, debts, overrides, now]);
}

/** Что значит сегодняшняя цифра — одной фразой */
export function dayNote(b: DayBudget): { text: string; over: boolean } {
  if (b.exhausted) return { text: 'Недельный лимит исчерпан, до понедельника только необходимое.', over: true };
  const r = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  if (b.left < 0 && b.nextWeek) return { text: `Перерасход ${r(-b.left)}. С понедельника новая неделя: ${r(b.tomorrow)} в день.`, over: true };
  if (b.left < 0) return { text: `Перерасход ${r(-b.left)}, поэтому с завтра лимит ${r(b.tomorrow)} в день.`, over: true };
  return {
    text: `Осталось ${r(b.left)}. Лимит дня — остаток недели на утро (${r(b.morning)}), разделённый на ${b.daysLeft} ${plural(b.daysLeft, 'день', 'дня', 'дней')} до воскресенья.`,
    over: false,
  };
}

export function TodayDetails({ summary }: { summary?: boolean }) {
  const { budget: b, counted, outside } = useTodaySpends();
  const set = useUi(s => s.set);
  const note = dayNote(b);
  const edit = (e: Expense) => set({ today: false, add: { edit: e } });
  const share = b.day > 0 ? Math.min(1, b.spentToday / b.day) : b.spentToday > 0 ? 1 : 0;
  return (
    <div>
      {summary ? (
        <div className="mx-4 rounded-2xl bg-surface-2 p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <Money value={b.spentToday} className={`figure text-[24px] leading-none ${note.over ? 'text-neg' : ''}`} />
            <span className="text-[13px] text-muted">из <Money value={b.day} /> на день</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
            <div className={`h-full rounded-full ${note.over ? 'bg-gradient-to-r from-warn to-neg' : 'bg-sea'}`} style={{ width: `${share * 100}%` }} />
          </div>
          <p className={`mt-2.5 text-[13px] leading-snug ${note.over ? 'text-neg' : 'text-muted'}`}>{note.text}</p>
        </div>
      ) : (
        <p className={`px-4 text-[13px] leading-snug ${note.over ? 'text-neg' : 'text-muted'}`}>{note.text}</p>
      )}
      {counted.length > 0
        ? <div className="divide-hair mt-1">{counted.map(e => <ExpenseRow key={e.id} e={e} onClick={() => edit(e)} />)}</div>
        : <p className="px-4 pt-3 text-[14px] text-muted">Сегодня трат пока нет.</p>}
      {outside.length > 0 && (
        <>
          <div className="px-4 pt-4 text-[13px] text-muted">Не входит в лимит дня</div>
          <div className="divide-hair opacity-80">{outside.map(e => <ExpenseRow key={e.id} e={e} onClick={() => edit(e)} />)}</div>
        </>
      )}
    </div>
  );
}

export function TodaySheet() {
  const open = useUi(s => s.today);
  const set = useUi(s => s.set);
  const now = useToday();
  return (
    <Sheet compact open={open} onClose={() => set({ today: false })} title={`${weekdayFull(now).replace(/^./, c => c.toUpperCase())}, ${dayMonth(now)}`} subtitle="траты сегодня"
      footer={<PrimaryButton tone="ink" onClick={() => set({ today: false, add: {} })}><Plus size={19} strokeWidth={2} /> Записать трату</PrimaryButton>}>
      <div className="-mx-4"><TodayDetails summary /></div>
    </Sheet>
  );
}

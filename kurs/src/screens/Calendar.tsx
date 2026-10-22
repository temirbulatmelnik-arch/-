import { BellRing } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EventRow } from '../components/rows';
import { IconButton, ScreenHeader, Segmented } from '../components/ui';
import { eventsBetween } from '../domain/calendar';
import { addDays, addMonths, monthKey, monthName } from '../domain/dates';
import { rub } from '../domain/money';
import type { CalEvent } from '../domain/types';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';
import { exportCalendar } from './reminders';

type Filter = 'all' | 'payment' | 'income';

export function Calendar() {
  const now = useToday();
  const cal = useCal();
  const [marks, markEvent] = useStore(useShallow(s => [s.marks, s.markEvent]));
  const set = useUi(s => s.set);
  const [filter, setFilter] = useState<Filter>('all');
  const [months, setMonths] = useState(3);
  const [weekly, setWeekly] = useState(false);

  const groups = useMemo(() => {
    const to = `${addMonths(monthKey(now), months - 1)}-31`;
    const list = eventsBetween(cal, addDays(now, -20), to)
      .filter(e => (filter === 'all' ? weekly || e.kind !== 'weekly' : e.kind === filter))
      // прошедшие и отмеченные события старше недели не показываем — только неотмеченные долги
      .filter(e => e.date >= addDays(now, -7) || (!marks[e.key]?.done && e.kind === 'payment'));
    const map = new Map<string, CalEvent[]>();
    for (const e of list) map.set(monthKey(e.date), [...(map.get(monthKey(e.date)) ?? []), e]);
    return [...map.entries()];
  }, [cal, now, months, filter, weekly, marks]);

  const toggle = (e: CalEvent) => {
    if (marks[e.key]?.done) markEvent(e, false);
    else set({ event: e });
  };

  return (
    <div>
      <ScreenHeader title="Платежи" overline="Календарь" action={
        <IconButton onClick={() => exportCalendar()} label="Напоминания в календарь iPhone" className="bg-surface"><BellRing size={20} /></IconButton>
      } />
      <div className="space-y-2 px-4">
        <Segmented<Filter> value={filter} onChange={setFilter} options={[{ id: 'all', label: 'Всё' }, { id: 'payment', label: 'Платежи' }, { id: 'income', label: 'Поступления' }]} />
        {filter === 'all' && (
          <button type="button" onClick={() => setWeekly(!weekly)} className="text-[13px] font-semibold text-muted">
            {weekly ? 'Скрыть понедельники' : 'Показать понедельники (недельный лимит)'}
          </button>
        )}
      </div>

      {groups.map(([m, list]) => {
        const pay = list.filter(e => e.kind === 'payment').reduce((s, e) => s + (marks[e.key]?.amount ?? e.amount), 0);
        const inc = list.filter(e => e.kind === 'income').reduce((s, e) => s + (marks[e.key]?.amount ?? e.amount), 0);
        return (
          <section key={m}>
            <div className="mt-6 mb-2 flex items-end justify-between px-5">
              <h2 className="text-[19px] font-extrabold capitalize">{monthName(m)}</h2>
              <div className="text-right text-[12.5px] font-semibold">
                {pay > 0 && <span className="text-muted">−{rub(pay)}</span>}
                {inc > 0 && <span className="ml-2 text-accent">+{rub(inc)}</span>}
              </div>
            </div>
            <div className="card mx-4 divide-y divide-line overflow-hidden">
              {list.map(e => <EventRow key={e.key} e={e} mark={marks[e.key]} now={now} onClick={() => set({ event: e })} onToggle={() => toggle(e)} />)}
            </div>
          </section>
        );
      })}

      <div className="px-4 pt-4">
        <button type="button" onClick={() => setMonths(months + 3)} className="h-12 w-full rounded-2xl bg-surface-2 text-[15px] font-semibold">Показать ещё 3 месяца</button>
        <p className="px-2 pt-3 text-center text-[12px] leading-snug text-faint">«до 16.11» — можно внести раньше, «~10.11» — дата примерная. Суммы по кредиткам с января — оценка: проценты + доля долга. Точную сумму пришлёт банк — загрузите скриншот, и приложение обновит её.</p>
      </div>
    </div>
  );
}

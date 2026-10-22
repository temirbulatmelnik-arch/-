import { BellRing, ChevronLeft, ChevronRight, Repeat, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EventRow } from '../components/rows';
import { Bar, Empty, IconButton, Money, ScreenHeader } from '../components/ui';
import { cashFlow } from '../domain/cashflow';
import { eventGroup, eventsBetween, type EventGroup } from '../domain/calendar';
import { addDays, addMonths, dayMonth, ddmm, lastDay, monthKey, monthName, weekday } from '../domain/dates';
import type { CalEvent } from '../domain/types';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';
import { exportCalendar } from './reminders';

type Filter = 'all' | 'debt' | 'fixed' | 'income';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Всё' }, { id: 'debt', label: 'Кредиты' }, { id: 'fixed', label: 'Обязательные' }, { id: 'income', label: 'Поступления' },
];
const matches = (f: Filter, g: EventGroup) => (f === 'all' ? g !== 'weekly' : f === 'fixed' ? g === 'fixed' || g === 'other' : g === f);

export function Payments() {
  const now = useToday();
  const cal = useCal();
  const [marks, markEvent, cardBalance, reserve] = useStore(useShallow(s => [s.marks, s.markEvent, s.cardBalance, s.reserve] as const));
  const set = useUi(s => s.set);
  const [month, setMonth] = useState(monthKey(now));
  const [filter, setFilter] = useState<Filter>('all');
  const [mondays, setMondays] = useState(false);

  const from = `${month}-01`, to = `${month}-${String(lastDay(month)).padStart(2, '0')}`;
  const events = useMemo(() => eventsBetween(cal, from, to), [cal, from, to]);
  // неоплаченные платежи прошлых месяцев — наверху текущего
  const overdue = useMemo(() => (month === monthKey(now) ? eventsBetween(cal, addDays(from, -60), addDays(from, -1)).filter(e => e.kind === 'payment' && !marks[e.key]?.done) : []), [cal, from, month, now, marks]);
  const flow = useMemo(() => (cardBalance ? cashFlow(cal, marks, cardBalance, addDays(cardBalance.date, 75)) : null), [cal, marks, cardBalance]);

  const payments = events.filter(e => e.kind === 'payment');
  const amount = (e: CalEvent) => (marks[e.key]?.done && marks[e.key].amount != null ? marks[e.key].amount! : e.amount);
  const total = payments.reduce((s, e) => s + amount(e), 0);
  const paid = payments.filter(e => marks[e.key]?.done).reduce((s, e) => s + amount(e), 0);
  const incomes = events.filter(e => e.kind === 'income').reduce((s, e) => s + amount(e), 0);
  const byGroup = (g: EventGroup) => payments.filter(e => eventGroup(e) === g).reduce((s, e) => s + amount(e), 0);

  const visible = events.filter(e => matches(filter, eventGroup(e)) || (mondays && e.kind === 'weekly' && filter === 'all'));
  const days = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of visible) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [visible]);

  // минимум денег на карте в выбранном месяце
  const monthMin = flow?.points.filter(p => p.event.date >= from && p.event.date <= to && !p.overdue).reduce<typeof flow.points[number] | null>((m, p) => (!m || p.balance < m.balance ? p : m), null);

  const toggle = (e: CalEvent) => (marks[e.key]?.done ? markEvent(e, false) : set({ event: e }));

  return (
    <div>
      <ScreenHeader title="Платежи" overline="Календарь" action={
        <div className="flex gap-2">
          <IconButton onClick={() => set({ fixed: true })} label="Обязательные платежи"><Repeat size={17} strokeWidth={1.5} /></IconButton>
          <IconButton onClick={() => exportCalendar()} label="Напоминания в календарь iPhone"><BellRing size={17} strokeWidth={1.5} /></IconButton>
        </div>
      } />

      <div className="mx-4 flex items-center justify-between">
        <IconButton onClick={() => setMonth(addMonths(month, -1))} label="Предыдущий месяц"><ChevronLeft size={18} strokeWidth={1.5} /></IconButton>
        <button type="button" onClick={() => setMonth(monthKey(now))} className="text-[17px] font-medium capitalize">{monthName(month)}</button>
        <IconButton onClick={() => setMonth(addMonths(month, 1))} label="Следующий месяц"><ChevronRight size={18} strokeWidth={1.5} /></IconButton>
      </div>

      <section className="black-card mx-4 mt-4 px-6 py-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-card-muted">Платежей в месяце</span>
          <span className="text-[12.5px] text-card-muted">оплачено <Money value={paid} className="text-card" /></span>
        </div>
        <Money value={total} className="figure mt-1 block text-[44px] leading-none" />
        <Bar value={total ? paid / total : 0} tone="card" className="mt-5" />
        <div className="mt-4 grid grid-cols-3 gap-2 text-[12px] text-card-muted">
          <div>Кредиты<Money value={byGroup('debt')} className="mt-0.5 block text-[14px] text-card" /></div>
          <div>Обязательные<Money value={byGroup('fixed') + byGroup('other')} className="mt-0.5 block text-[14px] text-card" /></div>
          <div>Поступления<Money value={incomes} sign className="mt-0.5 block text-[14px] text-[#a9d8b8]" /></div>
        </div>
      </section>

      <button type="button" onClick={() => set({ card: true })} className="card mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 p-4 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2"><WalletCards size={18} strokeWidth={1.5} /></span>
        {cardBalance ? (
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-muted">Зарплатная карта на {ddmm(cardBalance.date)}</span>
              <Money value={cardBalance.amount} className="text-[16px] font-medium" />
            </span>
            {monthMin && (monthMin.balance < 0 ? (
              // нехватку зарплаты по плану закрывает резерв: показываем, сколько из него уйдёт и сколько останется
              <span className={`mt-0.5 block text-[12.5px] leading-snug ${reserve + monthMin.balance < 0 ? 'text-neg' : reserve + monthMin.balance < 20_000 ? 'text-warn' : 'text-muted'}`}>
                Из резерва понадобится <Money value={-monthMin.balance} /> к {dayMonth(monthMin.event.date)}, {reserve + monthMin.balance < 0 ? <>не хватит даже с резервом: <Money value={-(reserve + monthMin.balance)} /></> : <>в нём останется <Money value={reserve + monthMin.balance} /></>}
              </span>
            ) : (
              <span className="mt-0.5 block text-[12.5px] text-muted">Минимум в месяце <Money value={monthMin.balance} /> — {dayMonth(monthMin.event.date)}, резерв не нужен</span>
            ))}
          </span>
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium">Остаток на зарплатной карте</span>
            <span className="block text-[12.5px] text-muted">Укажите — покажу по дням, хватит ли денег до поступлений.</span>
          </span>
        )}
        <ChevronRight size={16} className="shrink-0 text-faint" />
      </button>

      <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map(f => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${filter === f.id ? 'border-ink bg-ink text-bg' : 'border-line text-muted'}`}>{f.label}</button>
        ))}
        {filter === 'all' && (
          <button type="button" onClick={() => setMondays(!mondays)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${mondays ? 'border-brass text-brass' : 'border-line text-muted'}`}>Понедельники</button>
        )}
      </div>

      {overdue.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 px-5 text-[13px] font-medium text-neg">Не отмечены в прошлом месяце</div>
          <div className="card divide-hair mx-4 overflow-hidden">
            {overdue.map(e => <EventRow key={e.key} e={e} mark={marks[e.key]} now={now} onClick={() => set({ event: e })} onToggle={() => toggle(e)} />)}
          </div>
        </section>
      )}

      {days.length === 0 && <div className="mt-5 px-4"><Empty>В этом месяце ничего нет.</Empty></div>}
      {days.map(([date, list]) => {
        const bal = flow?.byDay[date];
        const isToday = date === now;
        return (
          <section key={date} className="mt-5">
            <div className="mb-2 flex items-baseline justify-between px-5">
              <div className="flex items-baseline gap-2">
                <span className={`text-[20px] font-light tabular-nums ${isToday ? 'text-brass' : ''}`}>{date.slice(8)}</span>
                <span className="text-[12.5px] text-muted">{isToday ? 'сегодня' : weekday(date)}</span>
              </div>
              {bal != null && date >= now && (
                <span className={`text-[12px] ${bal + reserve < 0 ? 'text-neg' : bal < 0 ? 'text-warn' : 'text-faint'}`}>{bal < 0 ? <>с резервом ≈ <Money value={bal + reserve} /></> : <>на карте ≈ <Money value={bal} /></>}</span>
              )}
            </div>
            <div className="card divide-hair mx-4 overflow-hidden">
              {list.map(e => <EventRow key={e.key} e={e} mark={marks[e.key]} now={now} showDate={false} onClick={() => set({ event: e })} onToggle={() => toggle(e)} />)}
            </div>
          </section>
        );
      })}

      <p className="px-6 pt-5 text-center text-[11.5px] leading-snug text-faint">
        «до» — можно внести раньше, «~» — дата примерная. Суммы кредиток — оценка, пока не указана точная: откройте платёж и внесите сумму и дату из приложения банка.
      </p>
    </div>
  );
}

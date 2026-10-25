import { BellRing, ChevronLeft, ChevronRight, Repeat, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LevelChart, MonthGrid, verdict, type DayMoney } from '../components/MoneyLevel';
import { SkyButton, SkyHeader } from '../components/Petersburg';
import { EventRow } from '../components/rows';
import { Bar, Empty, IconButton, Money } from '../components/ui';
import { cashFlow, dailyLevels, LOW_WATER } from '../domain/cashflow';
import { eventGroup, eventsBetween, type EventGroup } from '../domain/calendar';
import { addDays, addMonths, dayMonth, ddmm, lastDay, monthKey, monthName, weekday, weekdayFull } from '../domain/dates';
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
  const [topUps, setTopUps] = useState(false);

  const from = `${month}-01`, to = `${month}-${String(lastDay(month)).padStart(2, '0')}`;
  const events = useMemo(() => eventsBetween(cal, from, to), [cal, from, to]);
  const [selected, setSelected] = useState(now);
  useEffect(() => {
    // в другом месяце — первый день, где что-то происходит
    setSelected(month === monthKey(now) ? now : events.find(e => e.kind !== 'weekly')?.date ?? from);
  }, [month]);

  // неоплаченные платежи прошлых месяцев — наверху текущего
  const overdue = useMemo(() => (month === monthKey(now) ? eventsBetween(cal, addDays(from, -60), addDays(from, -1)).filter(e => e.kind === 'payment' && !marks[e.key]?.done) : []), [cal, from, month, now, marks]);
  const flow = useMemo(() => {
    if (!cardBalance) return null;
    const until = addDays(cardBalance.date, 75);
    return cashFlow(cal, marks, cardBalance, until > to ? until : to);
  }, [cal, marks, cardBalance, to]);

  const amount = (e: CalEvent) => (marks[e.key]?.done && marks[e.key].amount != null ? marks[e.key].amount! : e.amount);
  const payments = events.filter(e => e.kind === 'payment');
  const total = payments.reduce((s, e) => s + amount(e), 0);
  const paid = payments.filter(e => marks[e.key]?.done).reduce((s, e) => s + amount(e), 0);
  const incomes = events.filter(e => e.kind === 'income').reduce((s, e) => s + amount(e), 0);
  const byGroup = (g: EventGroup) => payments.filter(e => eventGroup(e) === g).reduce((s, e) => s + amount(e), 0);

  // день за днём: что уходит, что приходит, сколько на карте и в резерве к вечеру.
  // Остаток карты не указан — считаем от нуля на сегодня: вода всё равно показывает, где тонко.
  const days = useMemo<DayMoney[]>(() => {
    const totals = dailyLevels(cal, marks, cardBalance ?? { amount: 0, date: now, source: 'manual' }, reserve, from, to);
    return Array.from({ length: lastDay(month) }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      const list = events.filter(e => e.date === date);
      const pays = list.filter(e => e.kind === 'payment');
      return {
        date,
        out: list.filter(e => e.kind !== 'income').reduce((s, e) => s + amount(e), 0),
        in: list.filter(e => e.kind === 'income').reduce((s, e) => s + amount(e), 0),
        paid: pays.length > 0 && pays.every(e => marks[e.key]?.done),
        total: totals[date],
        past: date < now,
      };
    });
  }, [cal, cardBalance, reserve, now, from, to, month, events, marks]);
  const top = Math.max(LOW_WATER * 1.25, ...days.map(d => d.total ?? 0));
  const said = verdict(days);
  const sel = days.find(d => d.date === selected);
  // когда зарплатная карта уходит в минус, разницу закрывает резерв
  const cardMin = flow?.points.filter(p => p.event.date >= from && p.event.date <= to && p.event.date >= now && !p.overdue)
    .reduce<typeof flow.points[number] | null>((m, p) => (!m || p.balance < m.balance ? p : m), null);

  const dayEvents = events.filter(e => e.date === selected);
  const visible = events.filter(e => matches(filter, eventGroup(e)) || (topUps && e.kind === 'weekly' && filter === 'all'));
  const byDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of visible) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [visible]);

  const toggle = (e: CalEvent) => (marks[e.key]?.done ? markEvent(e, false) : set({ event: e }));
  const shift = (n: 1 | -1) => setMonth(addMonths(month, n));

  return (
    <div>
      <SkyHeader
        title={<button type="button" onClick={() => setMonth(monthKey(now))} className="text-left first-letter:uppercase">{monthName(month)}</button>}
        subtitle={<>уйдёт <Money value={total} />, придёт <Money value={incomes} /></>}
        action={
          <div className="flex gap-2">
            <SkyButton onClick={() => shift(-1)} label="Предыдущий месяц"><ChevronLeft size={18} strokeWidth={1.7} /></SkyButton>
            <SkyButton onClick={() => shift(1)} label="Следующий месяц"><ChevronRight size={18} strokeWidth={1.7} /></SkyButton>
          </div>
        } />

      <section className="mt-3 px-3">
        <MonthGrid month={month} days={days} top={top} now={now} selected={selected} onSelect={setSelected} onSwipe={shift} />
      </section>

      <section className="mx-4 mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-medium">Деньги на карте и в резерве</span>
          {sel?.total != null && <span className="font-display text-[13px] font-medium whitespace-nowrap">{Number(selected.slice(8))}-го <Money value={sel.total} /></span>}
        </div>
        <p className={`mt-0.5 text-[13px] leading-snug ${said?.startsWith('Не хватит') ? 'text-neg' : 'text-muted'}`}>
          {said ?? 'Месяц прошёл: так было по календарю.'}
        </p>
        <div className="mt-2"><LevelChart month={month} days={days} top={top} selected={selected} onSelect={setSelected} /></div>
        {cardBalance ? (
          <>
            <button type="button" onClick={() => set({ card: true })} className="mt-2 flex w-full items-center gap-2 text-left text-[12.5px] text-muted">
              <WalletCards size={15} strokeWidth={1.5} className="shrink-0" />
              <span className="min-w-0 flex-1">
                Зарплатная карта <Money value={cardBalance.amount} className="text-ink" /> на {ddmm(cardBalance.date)}, резерв <Money value={reserve} className="text-ink" />
                {cardMin && cardMin.balance < 0 && <>. К {dayMonth(cardMin.event.date)} из резерва понадобится <Money value={-cardMin.balance} /></>}
              </span>
              <ChevronRight size={15} className="shrink-0 text-faint" />
            </button>
          </>
        ) : (
          <button type="button" onClick={() => set({ card: true })} className="card mt-3 flex w-full items-center gap-3 p-4 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sea/12 text-sea"><WalletCards size={18} strokeWidth={1.5} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium">Остаток на зарплатной карте</span>
              <span className="block text-[12.5px] leading-snug text-muted">Пока считаю, что на карте 0 ₽, а вода — это резерв и всё, что придёт. Укажите остаток — расчёт станет точным.</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-faint" />
          </button>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-2 px-5 font-display text-[16px] font-medium">{dayMonth(selected)}, {weekdayFull(selected)}</div>
        {dayEvents.length ? (
          <div className="card divide-hair mx-4 overflow-hidden">
            {dayEvents.map(e => <EventRow key={e.key} e={e} mark={marks[e.key]} now={now} showDate={false} onClick={() => set({ event: e })} onToggle={() => toggle(e)} />)}
          </div>
        ) : <p className="px-5 text-[14px] text-muted">Ничего не уходит и не приходит.</p>}
      </section>

      {overdue.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 px-5 text-[13px] font-medium text-neg">Не отмечены в прошлом месяце</div>
          <div className="card divide-hair mx-4 overflow-hidden">
            {overdue.map(e => <EventRow key={e.key} e={e} mark={marks[e.key]} now={now} onClick={() => set({ event: e })} onToggle={() => toggle(e)} />)}
          </div>
        </section>
      )}

      <section className="card mx-4 mt-6 p-4">
        <div className="flex items-baseline justify-between text-[13px] text-muted">
          <span>Платежей в месяце</span>
          <span>оплачено <Money value={paid} className="text-ink" /></span>
        </div>
        <Money value={total} className="figure mt-1 block text-[28px] leading-none" />
        <Bar value={total ? paid / total : 0} className="mt-4" />
        <div className="mt-4 grid grid-cols-3 gap-2 text-[12px] text-muted">
          <div>Кредиты<Money value={byGroup('debt')} className="mt-0.5 block text-[14px] text-ink" /></div>
          <div>Обязательные<Money value={byGroup('fixed') + byGroup('other')} className="mt-0.5 block text-[14px] text-ink" /></div>
          <div>Поступления<Money value={incomes} sign className="mt-0.5 block text-[14px] text-pos" /></div>
        </div>
      </section>

      <div className="mt-8 mb-3 flex items-center justify-between gap-3 px-5">
        <h2 className="text-[15px] font-medium">Все платежи месяца</h2>
        <div className="flex gap-2">
          <IconButton onClick={() => set({ fixed: true })} label="Обязательные платежи"><Repeat size={17} strokeWidth={1.5} /></IconButton>
          <IconButton onClick={() => exportCalendar()} label="Напоминания в календарь iPhone"><BellRing size={17} strokeWidth={1.5} /></IconButton>
        </div>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">
        {FILTERS.map(f => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${filter === f.id ? 'border-ink bg-ink text-bg' : 'border-line text-muted'}`}>{f.label}</button>
        ))}
        {filter === 'all' && (
          <button type="button" onClick={() => setTopUps(!topUps)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${topUps ? 'border-sea text-sea' : 'border-line text-muted'}`}>Пополнения карты</button>
        )}
      </div>

      {byDate.length === 0 && <div className="mt-5 px-4"><Empty>В этом месяце ничего нет.</Empty></div>}
      {byDate.map(([date, list]) => {
        const bal = flow?.byDay[date];
        const isToday = date === now;
        return (
          <section key={date} className="mt-5">
            <div className="mb-2 flex items-baseline justify-between px-5">
              <div className="flex items-baseline gap-2">
                <span className={`font-display text-[18px] tabular-nums ${isToday ? 'text-sea' : ''}`}>{Number(date.slice(8))}</span>
                <span className="text-[12.5px] text-muted">{isToday ? 'сегодня' : weekday(date)}</span>
              </div>
              {bal != null && date >= now && (
                <span className={`text-[12px] ${bal + reserve < 0 ? 'text-neg' : bal < 0 ? 'text-warn' : 'text-muted'}`}>{bal < 0 ? <>с резервом ≈ <Money value={bal + reserve} /></> : <>на карте ≈ <Money value={bal} /></>}</span>
              )}
            </div>
            <div className="card divide-hair mx-4 overflow-hidden">
              {list.map(e => <EventRow key={e.key} e={e} mark={marks[e.key]} now={now} showDate={false} onClick={() => set({ event: e })} onToggle={() => toggle(e)} />)}
            </div>
          </section>
        );
      })}

      <p className="px-6 pt-5 text-center text-[11.5px] leading-snug text-muted">
        «до» — можно внести раньше, «~» — дата примерная. Суммы кредиток — оценка, пока не указана точная: откройте платёж и внесите сумму и дату из приложения банка.
      </p>
    </div>
  );
}

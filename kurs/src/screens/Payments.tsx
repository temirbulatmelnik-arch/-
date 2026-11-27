import { ForecastNotice } from '../components/ForecastNotice';
import { bankProvenEvents, coverageDayDetails, horizonUnverified, monthEventTotals, needsPaymentReview, SCENARIO_LABEL } from '../domain/financialView';
import { RESERVE_ACCOUNT } from '../domain/accounts';
import { CalendarFunding, CalendarProof } from '../components/rows';
// «Платежи» — хватит ли денег на всё, что спишется. Три вида, листаются пальцем:
// «Месяц» — календарь с водой и линия денег, выбранный день; «Хватит ли» — счета и прогноз покрытия до премии;
// «Список» — все платежи месяца по датам, отметка «оплачено» свайпом вправо.
import { BellRing, ChevronLeft, ChevronRight, PencilLine, ReceiptText, Repeat, Scale } from 'lucide-react';
import { Hold } from '../components/Hold';
import { motion } from 'motion/react';
import { haptic } from '../components/haptics';
import { startTransition, useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CoverageCard, useCoverage } from '../components/Coverage';
import { Flip, item, list as listAnim, Pager, Roll, SwipeRow, useEnter } from '../components/motion';
import { LevelChart, MonthGrid, monthHeight, Weekdays, type DayMoney } from '../components/MoneyLevel';
import { SkyButton, SkyHeader } from '../components/Petersburg';
import { EventRow } from '../components/rows';
import { runQuick } from '../components/TabBar';
import { Empty, IconButton, Money, Sheet } from '../components/ui';
import { monthDays, NARROW, reserveByDay } from '../domain/coverage';
import { actionableEvent, eventGroup, eventsBetween, type EventGroup } from '../domain/calendar';
import { addDays, addMonths, dayMonth, ddmm, lastDay, monthKey, monthName, plural, weekday, weekdayFull } from '../domain/dates';
import type { CalEvent, EventMark } from '../domain/types';
import { useStore } from '../store/store';
import { useCal, useToday, useUi, type PayView } from '../store/ui';
import { useLedger } from './Checkup';
import { exportCalendar } from './reminders';

type Filter = 'all' | 'debt' | 'fixed' | 'income';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Всё' }, { id: 'debt', label: 'Кредиты' }, { id: 'fixed', label: 'Обязательные' }, { id: 'income', label: 'Поступления' },
];
const matches = (f: Filter, g: EventGroup) => (f === 'all' ? g !== 'weekly' : f === 'fixed' ? g === 'fixed' || g === 'other' : g === f);

interface MonthData { month: string; events: CalEvent[]; days: DayMoney[] }

/** События и дни месяцев — запомнены по месяцу: при листании соседний месяц становится текущим тем же объектом,
 *  и его 30 ячеек не перерисовываются. Дни — неоплаченное дня и резерв к вечеру по прогнозу покрытия */
function useMonths(months: readonly string[], cal: ReturnType<typeof useCal>, marks: Record<string, EventMark>, cov: ReturnType<typeof useCoverage>['cov'], now: string): MonthData[] {
  const cache = useRef(new Map<string, { deps: readonly unknown[]; data: MonthData }>());
  const deps = [cal, marks, cov, now] as const;
  const out = months.map(m => {
    const hit = cache.current.get(m);
    if (hit && hit.deps.every((d, i) => d === deps[i])) return hit.data;
    const events = eventsBetween(cal, `${m}-01`, `${m}-${String(lastDay(m)).padStart(2, '0')}`);
    const data = { month: m, events, days: monthDays(events, marks, cov, m, now) };
    cache.current.set(m, { deps, data });
    return data;
  });
  for (const k of [...cache.current.keys()]) if (!months.includes(k)) cache.current.delete(k);
  return out;
}

export function Payments() {
  const now = useToday();
  const cal = useCal();
  const marks = useStore(s => s.marks);
  // прогноз покрытия — тот же, что в «Хватит ли» и в status.coverage: остаток дня в календаре — его резерв к вечеру
  const { input, cov } = useCoverage();
  const scenario = useUi(s => s.scenario);
  const operations = useStore(s => s.accountBook.operations);
  const proven = useMemo(() => bankProvenEvents(operations), [operations]);
  const led = useLedger();
  const statuses = new Map<string, 'Обеспечено' | 'Нужны деньги' | 'Нужна сверка'>();
  for (const row of cov.paymentFunding ?? []) {
    statuses.set(row.key, !row.accountId || row.available == null ? 'Нужна сверка'
      : (led.heldForPayments.find(payment => payment.key === row.key && payment.accountId === row.accountId)?.amount ?? 0) >= row.amount
        ? 'Обеспечено' : 'Нужны деньги');
  }
  const set = useUi(s => s.set);
  const view = useUi(s => s.payView);
  const [month, setMonth] = useState(monthKey(now));
  // месяц и соседи по бокам ленты: соседние собраны заранее, листание не ждёт расчёта
  const keys = useMemo(() => [addMonths(month, -1), month, addMonths(month, 1)] as const, [month]);
  const [prev, cur, next] = useMonths(keys, cal, marks, cov, now);
  const { events } = cur;
  // выбранный день живёт в своём месяце; в другом месяце — сегодня или первый день, где что-то происходит.
  // Считается при отрисовке, а не эффектом: новый месяц сразу приходит с выбранным днём, без второй перерисовки
  const [picked, setPicked] = useState(now);
  const selected = monthKey(picked) === month ? picked : month === monthKey(now) ? now : events.find(e => e.kind !== 'weekly')?.date ?? `${month}-01`;

  const totals = monthEventTotals(events, marks, proven, now);
  const reviewCount = events.filter(event => needsPaymentReview(event, marks[event.key], now)).length;
  // смена месяца — переход (startTransition): соседний месяц уже на экране, а сборка нового дальнего соседа, линии и
  // заголовка идёт кусками между кадрами и не держит палец, если сразу листать дальше
  const shift = useCallback((n: 1 | -1) => startTransition(() => setMonth(m => addMonths(m, n))), []);
  // стрелки листают ту же ленту, что и палец; лента скрыта (другой вид) — месяц меняется сразу
  const flip = useRef<((dir: 1 | -1) => boolean) | null>(null);
  const [cover, setCover] = useState(false);
  const arrow = (n: 1 | -1) => { if (!(view !== 'list' && flip.current?.(n))) shift(n); };

  return (
    <CalendarFunding.Provider value={statuses}><CalendarProof.Provider value={proven}><div>
      <SkyHeader compact
        title={<button type="button" onClick={() => setMonth(monthKey(now))} className="text-left first-letter:uppercase">{monthName(month)}</button>}
        subtitle={<button type="button" className="min-h-11 text-left font-medium" onClick={() => { setMonth(monthKey(now)); setPicked(now); }}>Сегодня</button>}
        action={
          <div className="flex gap-2">
            <SkyButton onClick={() => arrow(-1)} label="Предыдущий месяц"><ChevronLeft size={18} strokeWidth={1.7} /></SkyButton>
            <SkyButton onClick={() => arrow(1)} label="Следующий месяц"><ChevronRight size={18} strokeWidth={1.7} /></SkyButton>
          </div>
        } />
      <div className="mx-4 mt-3"><ForecastNotice cov={cov} scenario={scenario} verified={!horizonUnverified(input)} onOpen={() => setCover(true)} /></div>
      {!!reviewCount && <button type="button" className="mx-4 min-h-11 text-[13px] text-warn" onClick={() => set({ paymentQueue: true, paymentReviewDate: month })}>
        Нужна сверка · {reviewCount} {plural(reviewCount, 'платёж', 'платежа', 'платежей')}
      </button>}
      <div className="mx-4 mt-3 grid grid-cols-2 gap-2 text-[13px]">
        <button type="button" className="min-h-11 rounded-xl bg-surface px-2 text-sea" onClick={() => set({ paymentQueue: true })}>Все платежи</button>
        <button type="button" className="min-h-11 rounded-xl bg-surface px-2 text-sea" onClick={() => set({ workSheet: true })}>Работа и доходы</button>
      </div>
      <Pager<PayView> className="mt-3" value={view === 'list' ? 'list' : 'month'} onChange={v => set({ payView: v })} pages={[
        { id: 'month', label: 'Месяц', render: () => <MonthView months={[prev, cur, next]} selected={selected} onSelect={setPicked} onShift={shift} flip={flip} /> },
        { id: 'list', label: 'Лента', render: () => <ListView month={month} events={events} totals={totals} /> },
      ]} />
      <Sheet open={cover || view === 'cover'} onClose={() => { setCover(false); if (view === 'cover') set({ payView: 'month' }); }} title="Хватит ли резерва" subtitle="Остатки и обязательства по дням">
        {(cover || view === 'cover') && <div className="-mx-5"><CoverView /></div>}
      </Sheet>
    </div></CalendarProof.Provider></CalendarFunding.Provider>
  );
}

function SwipeEvent({ e, mark, now, showDate = false }: { e: CalEvent; mark?: EventMark; now: string; showDate?: boolean }) {
  const set = useUi(s => s.set);
  const open = () => set({ event: e });
  const row = <EventRow e={e} mark={mark} now={now} showDate={showDate} onClick={open} />;
  if (!actionableEvent(e)) return row;
  const label = mark?.done ? 'Детали записи' : 'Проверить и подтвердить';
  return <Hold preview={<div className="pointer-events-none">{row}</div>} actions={[{ label, icon: <PencilLine size={17} />, onSelect: open }]}>
    <SwipeRow left={{ label, icon: <PencilLine size={17} />, tone: 'ink', onAction: open }}>{row}</SwipeRow>
  </Hold>;
}

/** Высота воды в ячейках: от наибольшего резерва месяца, но не ниже четырёх запасов */
const topOf = (days: DayMoney[]) => Math.max(NARROW * 4, ...days.map(d => d.total ?? 0));

function MonthView({ months, selected, onSelect, onShift, flip }: {
  /** предыдущий, текущий и следующий месяцы — лента календаря */
  months: readonly [MonthData, MonthData, MonthData];
  selected: string; onSelect: (d: string) => void; onShift: (n: 1 | -1) => void;
  flip: { current: ((dir: 1 | -1) => boolean) | null };
}) {
  const now = useToday();
  const marks = useStore(s => s.marks);
  const { cov } = useCoverage();
  const { month, days, events } = months[1];
  const top = topOf(days);
  const sel = days.find(d => d.date === selected);
  const [opened, setOpened] = useState<string | null>(null);
  const open = useCallback((date: string) => { setOpened(date); haptic(); }, []);
  // водой наполняется только первый показанный месяц; соседние приезжают налитыми
  const first = useRef(month);
  const byKey = new Map(months.map(m => [m.month, m]));
  const keys = useMemo(() => [months[0].month, month, months[2].month] as const, [months[0].month, month, months[2].month]);
  return (
    <>
      <section className="mt-3 px-3" data-noswipe>
        <p className="mb-2 text-xs text-muted">− списания и + поступления по календарю · уровень воды — прогноз резерва</p><Weekdays />
        {/* лента месяцев: идёт за пальцем, соседние месяцы уже собраны по бокам */}
        <Flip className="-mx-3 mt-1.5" keys={keys} heightOf={monthHeight} onShift={onShift} control={flip} render={(k, slot) => {
          const m = byKey.get(k)!;
          return <MonthGrid month={k} days={m.days} top={topOf(m.days)} now={now} selected={slot === 0 ? selected : ''} still={k !== first.current}
            onSelect={onSelect} onOpen={open} />;
        }} />
      </section>
      <section className="mx-4 mt-5" data-noswipe>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-medium">Резерв после переводов</span>
          {sel?.total != null && <span className="font-display text-[13px] font-medium whitespace-nowrap">{Number(selected.slice(8))}-го <Roll value={sel.total} /></span>}
        </div>
        <div className="mt-2"><LevelChart month={month} days={days} top={top} selected={selected} onSelect={onSelect} /></div>
      </section>
      <button type="button" className="mx-4 mt-2 min-h-11 text-left text-[13px] text-sea" onClick={() => open(selected)}>События {dayMonth(selected)}</button>
      <DayCard date={opened} cov={cov} day={days.find(d => d.date === opened)} events={events.filter(e => e.date === opened)}
        marks={marks} now={now} onClose={() => setOpened(null)} />
    </>
  );
}

function DayCard({ date, cov, day, events, marks, now, onClose }: {
  date: string | null; cov: ReturnType<typeof useCoverage>['cov']; day?: DayMoney;
  events: CalEvent[]; marks: Record<string, EventMark>; now: string; onClose: () => void;
}) {
  const scenario = useUi(s => s.scenario);
  const summary = date ? coverageDayDetails(cov, date) : null;
  const reserve = date ? cov.accountByDay?.[date]?.[RESERVE_ACCOUNT] : null;
  const reserveLow = date ? cov.reserveLowByDay?.[date] : null;
  return <Sheet open={!!date} title={date ? dayMonth(date) : 'День календаря'} subtitle={date ? weekdayFull(date) : undefined} onClose={onClose}>
    {date && <div className="space-y-3">
      {summary && <details className="card px-3 py-1">
        <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-medium">{SCENARIO_LABEL[scenario]} прогноз · всего своих денег <Money value={summary.end} kopecks /></summary>
        <dl className="space-y-1.5 border-t border-line py-3 text-[13px]">
          {([['На начало дня', summary.start], ['Внешние поступления', summary.income], ['Внешние расходы', -summary.out],
            ['Минимум внутри дня', summary.low], ['Резерв после переводов', reserve ?? day?.total], ['Минимум резерва внутри дня', reserveLow]] as [string, number | null | undefined][]).filter(([, value]) => value != null).map(([label, value]) =>
            <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd><Money value={value!} kopecks /></dd></div>)}
        </dl>
        <p className="pb-3 text-xs text-muted">Когда время неизвестно, обязательства идут раньше поступлений. Переводы между своими счетами меняют остатки счетов.</p>
      </details>}
      {events.length || day?.extra.length ? <div className="card divide-y divide-line">
        {events.map(event => <SwipeEvent key={event.key} e={event} mark={marks[event.key]} now={now} />)}
        {day?.extra.map(row => <div key={row.title} className="flex justify-between gap-3 p-3 text-sm">
          <span>{row.title}</span><Money value={-row.delta} kopecks />
        </div>)}
      </div> : <p className="text-sm text-muted">В этот день событий нет.</p>}
    </div>}
  </Sheet>;
}

function AccTile({ label, value, hint, onClick, tone }: { label: string; value: number | null; hint?: ReactNode; onClick: () => void; tone: string }) {
  return (
    <motion.button variants={item} type="button" whileTap={{ scale: 0.96 }} onClick={onClick}
      className="flex min-w-0 flex-col items-start rounded-[20px] border px-3 py-3 text-left" style={{ background: `var(--stack-${tone})`, borderColor: `var(--stack-${tone}-line)` }}>
      <span className="truncate text-[11.5px]" style={{ color: `var(--stack-${tone}-kicker)` }}>{label}</span>
      {value == null ? <span className="mt-1 text-[13px] text-muted">нет данных</span> : <span className="figure mt-1 text-[17px] leading-tight"><Roll value={value} /></span>}
      {hint && <span className="mt-0.5 text-[11px] leading-tight text-muted">{hint}</span>}
    </motion.button>
  );
}

function CoverView() {
  const now = useToday();
  const cal = useCal();
  const [marks, checkups] = useStore(useShallow(s => [s.marks, s.checkups] as const));
  const set = useUi(s => s.set);
  const led = useLedger();
  const last = checkups.at(-1);
  // неоплаченные платежи прошлых месяцев — сразу видно
  const overdue = useMemo(() => eventsBetween(cal, addDays(now, -60), addDays(now, -1)).filter(e => needsPaymentReview(e, marks[e.key], now)), [cal, now, marks]);
  return (
    <>
      <CoverageCard />

      <motion.section className="mx-4 mt-6" variants={listAnim} initial={false} animate="show">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <span className="text-[14px] font-medium">Счета по учёту</span>
          <span className="text-[12px] text-muted">{last ? `сверено ${ddmm(last.date)}` : 'сверки не было'}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <AccTile label="Карта ВТБ" value={led.card} tone="today" onClick={() => set({ card: true })} />
          <AccTile label="Резерв" value={led.reserve} tone="money" hint={led.incomeOnCard > 0 ? <>+<Money value={led.incomeOnCard} /> ждут перевода</> : undefined} onClick={() => set({ reserve: true })} />
          <AccTile label={led.creditCard ? `${led.creditCard.short}, долг` : 'Кредитка'} value={led.credit} tone="ahead" onClick={() => led.creditCard && set({ debt: led.creditCard.id })} />
        </div>
        <motion.button variants={item} type="button" whileTap={{ scale: 0.98 }} onClick={() => runQuick('checkup')}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-line bg-surface text-[14px] font-medium">
          <Scale size={17} strokeWidth={1.6} className="text-sea" /> Сверить с банком
        </motion.button>
      </motion.section>


      {overdue.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 px-5 text-[13px] font-medium text-neg">Прошедший срок · требуется сверка</div>
          <div className="card divide-hair mx-4 overflow-hidden">
            {overdue.map(e => <SwipeEvent key={e.key} e={e} mark={marks[e.key]} now={now} showDate />)}
          </div>
        </section>
      )}
    </>
  );
}

function ListView({ month, events, totals }: { month: string; events: CalEvent[]; totals: ReturnType<typeof monthEventTotals> }) {
  const now = useToday();
  const enter = useEnter();
  const marks = useStore(s => s.marks);
  const set = useUi(s => s.set);
  const [filter, setFilter] = useState<Filter>('all');
  const [topUps, setTopUps] = useState(false);
  const to = `${month}-${String(lastDay(month)).padStart(2, '0')}`;
  // резерв к вечеру по датам — тот же прогноз покрытия, что в календаре и в «Хватит ли»
  const { cov } = useCoverage();
  const levels = useMemo(() => reserveByDay(cov, `${month}-01`, to), [cov, month, to]);
  const visible = events.filter(e => matches(filter, eventGroup(e)) || (topUps && e.kind === 'weekly' && filter === 'all'));
  // лента дней: платежи, поступления и траты идут вместе. Траты — одной строкой на день (сумма и сколько «в долг»)
  const expenses = useStore(s => s.expenses);
  const spentBy = useMemo(() => {
    const map = new Map<string, { sum: number; loan: number; n: number }>();
    for (const e of expenses) {
      if (monthKey(e.date) !== month) continue;
      const d = map.get(e.date) ?? { sum: 0, loan: 0, n: 0 };
      d.sum += e.amount; d.n++; if (e.source === 'credit') d.loan += e.amount;
      map.set(e.date, d);
    }
    return map;
  }, [expenses, month]);
  const byDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of visible) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    if (filter === 'all') for (const d of spentBy.keys()) if (!map.has(d)) map.set(d, []);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, spentBy, filter]);

  return (
    <>
      <section className="card mx-4 mt-3 p-3" aria-label="Итоги месяца">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted">
          {([['Оплачено по банку', totals.paid], ['Записано вручную', totals.recorded], ['Предстоит', totals.upcoming],
            ['Нужно проверить', totals.review], ['Доходы по банку', totals.incomeBank], ['Ожидаемые доходы', totals.income],
            ['Поступления записаны вручную', totals.incomeRecorded], ['Начислено по листку', totals.incomeDocumented],
            ['Условные поступления', totals.conditional]] as const).filter(([label, value]) => value > 0 || label === 'Предстоит')
            .map(([label, value]) => <div key={label}>{label}<Money value={value} kopecks className="block text-sm text-ink" /></div>)}
        </div>
      </section>
      <div className="mt-5 flex items-center gap-2 px-4" data-noswipe>
        <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {FILTERS.map(f => (
            <motion.button key={f.id} type="button" whileTap={{ scale: 0.95 }} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={`relative shrink-0 rounded-full border min-h-11 px-3.5 py-2 text-[13px] font-medium transition-colors duration-200 ${filter === f.id ? 'border-transparent bg-ink text-bg' : 'border-line text-muted'}`}>
              <span className="relative">{f.label}</span>
            </motion.button>
          ))}
          {filter === 'all' && (
            <button type="button" onClick={() => setTopUps(!topUps)}
              className={`shrink-0 rounded-full border min-h-11 px-3.5 py-2 text-[13px] font-medium ${topUps ? 'border-sea text-sea' : 'border-line text-muted'}`}>Пополнения карты</button>
          )}
        </div>
        <IconButton onClick={() => set({ fixed: true })} label="Обязательные платежи"><Repeat size={17} strokeWidth={1.5} /></IconButton>
        <IconButton onClick={() => exportCalendar()} label="Напоминания в календарь iPhone"><BellRing size={17} strokeWidth={1.5} /></IconButton>
      </div>

      {byDate.length === 0 && <div className="mt-5 px-4"><Empty>В этом месяце ничего нет.</Empty></div>}
      <motion.div key={`${month}-${filter}-${topUps}`} variants={listAnim} initial={enter} animate="show">
        {byDate.map(([date, list]) => {
          const bal = levels[date];
          const isToday = date === now;
          const spent = spentBy.get(date);
          return (
            <motion.section key={date} variants={item} className="mt-5">
              <div className="mb-2 flex items-baseline justify-between px-5">
                <div className="flex items-baseline gap-2">
                  <span className={`font-display text-[18px] tabular-nums ${isToday ? 'text-sea' : ''}`}>{Number(date.slice(8))}</span>
                  <span className="text-[12.5px] text-muted">{isToday ? 'сегодня' : weekday(date)}</span>
                </div>
                {bal != null && date >= now && (
                  <span className={`text-[12px] ${bal < 0 ? 'text-neg' : bal < NARROW ? 'text-warn' : 'text-muted'}`}>в резерве ≈ <Money value={bal} /></span>
                )}
              </div>
              {(list.length > 0 || spent) && (
                <div className="card divide-hair mx-4 overflow-hidden">
                  {list.map(e => <SwipeEvent key={e.key} e={e} mark={marks[e.key]} now={now} />)}
                  {spent && filter === 'all' && (
                    <button type="button" onClick={() => (isToday ? set({ today: true }) : useUi.getState().setTab('budget'))} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
                      <span className="dot-tile size-10" style={{ '--c': 'var(--own)' } as CSSProperties}><ReceiptText size={18} strokeWidth={1.7} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-medium">Траты {isToday ? 'сегодня' : 'дня'}</span>
                        <span className="block text-[12px] text-muted">{spent.n} {plural(spent.n, 'запись', 'записи', 'записей')}{spent.loan > 0 && <span style={{ color: 'var(--loan)' }}>, в долг <Money value={spent.loan} /></span>}</span>
                      </span>
                      <Money value={spent.sum} className="shrink-0 text-[15px]" />
                    </button>
                  )}
                </div>
              )}
            </motion.section>
          );
        })}
      </motion.div>
      <p className="px-6 pt-5 text-center text-[11.5px] leading-snug text-muted">
        Нажмите на строку для сверки или подтверждения. «до» — можно внести раньше, «~» — дата примерная. Суммы кредиток — оценка, пока не внесена точная из приложения банка.
      </p>
    </>
  );
}


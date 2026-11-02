// «Платежи» — хватит ли денег на всё, что спишется. Три вида, листаются пальцем:
// «Месяц» — календарь с водой и линия денег, выбранный день; «Хватит ли» — счета и прогноз покрытия до премии;
// «Список» — все платежи месяца по датам, отметка «оплачено» свайпом вправо.
import { BellRing, CalendarArrowUp, Check, ChevronLeft, ChevronRight, PencilLine, Repeat, Scale, Undo2 } from 'lucide-react';
import { Hold } from '../components/Hold';
import { toast } from '../store/ui';
import { animate, AnimatePresence, motion, useMotionValue } from 'motion/react';
import { haptic } from '../components/haptics';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CoverageCard } from '../components/Coverage';
import { ease, item, list as listAnim, Pager, Roll, spring, SwipeRow, useEnter, usePan } from '../components/motion';
import { LevelChart, MonthGrid, verdict, type DayMoney } from '../components/MoneyLevel';
import { SkyButton, SkyHeader } from '../components/Petersburg';
import { EventRow } from '../components/rows';
import { runQuick } from '../components/TabBar';
import { Bar, Empty, IconButton, Money } from '../components/ui';
import { cashFlow, dailyLevels, LOW_WATER } from '../domain/cashflow';
import { eventGroup, eventsBetween, type EventGroup } from '../domain/calendar';
import { addDays, addMonths, dayMonth, ddmm, lastDay, monthKey, monthName, weekday, weekdayFull } from '../domain/dates';
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

export function Payments() {
  const now = useToday();
  const cal = useCal();
  const [marks, cardBalance, reserve] = useStore(useShallow(s => [s.marks, s.cardBalance, s.reserve] as const));
  const set = useUi(s => s.set);
  const view = useUi(s => s.payView);
  const [month, setMonth] = useState(monthKey(now));
  const from = `${month}-01`, to = `${month}-${String(lastDay(month)).padStart(2, '0')}`;
  const events = useMemo(() => eventsBetween(cal, from, to), [cal, from, to]);
  const [selected, setSelected] = useState(now);
  useEffect(() => {
    // в другом месяце — первый день, где что-то происходит
    setSelected(month === monthKey(now) ? now : events.find(e => e.kind !== 'weekly')?.date ?? from);
  }, [month]);

  const amount = (e: CalEvent) => (marks[e.key]?.done && marks[e.key].amount != null ? marks[e.key].amount! : e.amount);
  const total = events.filter(e => e.kind === 'payment').reduce((s, e) => s + amount(e), 0);
  const incomes = events.filter(e => e.kind === 'income').reduce((s, e) => s + amount(e), 0);

  // день за днём: что уходит, что приходит, сколько на карте и в резерве к вечеру
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
  const said = verdict(days);
  const shift = (n: 1 | -1) => setMonth(addMonths(month, n));

  return (
    <div>
      <SkyHeader
        title={<button type="button" onClick={() => setMonth(monthKey(now))} className="text-left first-letter:uppercase">{monthName(month)}</button>}
        subtitle={<>уйдёт <Roll value={total} />, придёт <Roll value={incomes} /></>}
        action={
          <div className="flex gap-2">
            <SkyButton onClick={() => shift(-1)} label="Предыдущий месяц"><ChevronLeft size={18} strokeWidth={1.7} /></SkyButton>
            <SkyButton onClick={() => shift(1)} label="Следующий месяц"><ChevronRight size={18} strokeWidth={1.7} /></SkyButton>
          </div>
        } />
      <Pager<PayView> className="mt-3" value={view} onChange={v => set({ payView: v })} pages={[
        { id: 'month', label: 'Месяц', render: () => <MonthView month={month} days={days} events={events} selected={selected} onSelect={setSelected} onShift={shift} said={said} /> },
        { id: 'cover', label: 'Хватит ли', render: () => <CoverView /> },
        { id: 'list', label: 'Список', render: () => <ListView month={month} events={events} total={total} incomes={incomes} /> },
      ]} />
    </div>
  );
}

/** Отметить или снять отметку; отметка открывает лист — там сумма и откуда оплачено */
function useToggle() {
  const [marks, markEvent] = useStore(useShallow(s => [s.marks, s.markEvent] as const));
  const set = useUi(s => s.set);
  return (e: CalEvent) => (marks[e.key]?.done ? markEvent(e, false) : set({ event: e }));
}

/** Строка платежа со свайпом вправо: «оплачено» (или «снять отметку») */
function SwipeEvent({ e, mark, now, showDate = false }: { e: CalEvent; mark?: EventMark; now: string; showDate?: boolean }) {
  const set = useUi(s => s.set);
  const toggle = useToggle();
  const done = !!mark?.done;
  const g = eventGroup(e);
  const label = done ? 'Снять отметку' : g === 'income' ? 'Пришло' : g === 'weekly' ? 'Долил' : 'Оплачено';
  const later = () => { useStore.getState().setOverride(e.key, { date: addDays(e.date, 1) }); toast(`${e.title}: перенесено на ${dayMonth(addDays(e.date, 1))}`); };
  return (
    <Hold preview={<div className="pointer-events-none"><EventRow e={e} mark={mark} now={now} showDate onClick={() => {}} /></div>} actions={[
      { label, icon: done ? <Undo2 size={17} /> : <Check size={17} />, onSelect: () => toggle(e) },
      { label: 'Сумма и дата', icon: <PencilLine size={17} />, onSelect: () => set({ event: e }) },
      ...(!done && e.kind === 'payment' ? [{ label: 'Перенести на завтра', icon: <CalendarArrowUp size={17} />, onSelect: later }] : []),
    ]}>
      <SwipeRow left={{ label, icon: done ? <Undo2 size={17} /> : <Check size={17} />, tone: done ? 'ink' : 'pos', onAction: () => toggle(e) }}>
        <EventRow e={e} mark={mark} now={now} showDate={showDate} onClick={() => set({ event: e })} onToggle={() => toggle(e)} />
      </SwipeRow>
    </Hold>
  );
}

function MonthView({ month, days, events, selected, onSelect, onShift, said }: {
  month: string; days: DayMoney[]; events: CalEvent[]; selected: string; onSelect: (d: string) => void; onShift: (n: 1 | -1) => void; said: string | null;
}) {
  const now = useToday();
  const marks = useStore(s => s.marks);
  const top = Math.max(LOW_WATER * 1.25, ...days.map(d => d.total ?? 0));
  const sel = days.find(d => d.date === selected);
  // открытый день и откуда он раскрывается (центр ячейки на экране)
  const [opened, setOpened] = useState<{ date: string; x: number; y: number } | null>(null);
  return (
    <>
      {/* вывод по воде в календаре: деньги на карте и в резерве день за днём */}
      {said && (
        <motion.p key={said} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className={`mx-4 mt-3 rounded-2xl px-4 py-2.5 text-[13.5px] leading-snug ${said.startsWith('Не хватит') ? 'bg-neg/10 text-neg' : /мало|тонк|ниже/.test(said) ? 'bg-warn/12 text-warn' : 'bg-pos/10 text-pos'}`}>{said}</motion.p>
      )}
      <section className="mt-3 px-3" data-noswipe>
        <motion.div key={month} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
          <MonthGrid month={month} days={days} top={top} now={now} selected={selected} onSelect={onSelect} onSwipe={onShift}
            onOpen={(d, r) => { setOpened({ date: d, x: r.left + r.width / 2, y: r.top + r.height / 2 }); haptic(); }} />
        </motion.div>
      </section>
      <section className="mx-4 mt-5" data-noswipe>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-medium">Деньги на карте и в резерве</span>
          {sel?.total != null && <span className="font-display text-[13px] font-medium whitespace-nowrap">{Number(selected.slice(8))}-го <Roll value={sel.total} /></span>}
        </div>
        <div className="mt-2"><LevelChart month={month} days={days} top={top} selected={selected} onSelect={onSelect} /></div>
      </section>
      <p className="px-5 pt-3 text-[12.5px] text-faint">Нажмите на день — он раскроется: что уходит, что приходит, сколько останется.</p>
      <AnimatePresence>
        {opened && <DayCard key={opened.date} date={opened.date} from={opened} day={days.find(d => d.date === opened.date)} events={events.filter(e => e.date === opened.date)} marks={marks} now={now} onClose={() => setOpened(null)} />}
      </AnimatePresence>
    </>
  );
}

/** Карточка дня: вырастает из нажатой ячейки и уходит обратно в неё (навык apple-design: из источника в источник).
 *  Масштаб от точки ячейки — только transform и opacity; общая layout-анимация motion обходила бы все элементы
 *  приложения на каждом кадре. Лежит ниже листов (z-48): платёж, открытый из дня, встаёт поверх него */
function DayCard({ date, from, day, events, marks, now, onClose }: { date: string; from: { x: number; y: number }; day?: DayMoney; events: CalEvent[]; marks: Record<string, EventMark>; now: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const low = day?.total != null && day.total < LOW_WATER;
  const level = day?.total == null ? 0 : Math.max(0.06, Math.min(1, Math.max(0, day.total) / Math.max(LOW_WATER * 4, day.total)));
  // смахнуть вниз — закрыть: карточка идёт за пальцем с сопротивлением
  const y = useMotionValue(0);
  const pan = usePan({
    axis: 'y',
    onMove: d => y.set(d > 0 ? d * 0.6 : d * 0.05),
    onEnd: (d, v) => { if (d * 0.6 > 80 || v > 400) onClose(); else animate(y, 0, spring); },
  });
  return (
    <motion.div className="fixed inset-0 z-[48]" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
      <motion.div className="absolute inset-0 bg-[rgba(4,14,22,.4)] backdrop-blur-[6px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="absolute inset-x-4 top-[18%] overflow-hidden rounded-[30px] bg-surface shadow-[0_30px_60px_-24px_rgba(4,14,22,.7)]"
        initial={{ opacity: 0, scale: 0.35 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.35, transition: { duration: 0.2, ease: ease.out } }}
        transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }}
        {...pan} style={{ y, transformOrigin: `${from.x - 16}px ${from.y - window.innerHeight * 0.18}px`, touchAction: 'pan-x' }}>
        {/* вода дня: сколько на карте и в резерве к вечеру — поднимается снизу (scaleY, на видеокарте) */}
        <motion.div className="pointer-events-none absolute inset-x-0 bottom-0 origin-bottom" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.9, delay: 0.15 }}
          style={{ height: `${level * 100}%`, background: `linear-gradient(180deg, var(${low ? '--water-low-a' : '--water-a'}), var(${low ? '--water-low-b' : '--water-b'}))` }} />
        <motion.div className="relative" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.2 } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div>
              <div className="font-display text-[44px] leading-none font-medium">{Number(date.slice(8))}</div>
              <div className="mt-1 text-[14px] text-muted first-letter:uppercase">{date === now ? 'сегодня, ' : ''}{weekdayFull(date)}, {dayMonth(date)}</div>
            </div>
            {day?.total != null && (
              <div className="text-right">
                <div className="text-[11.5px] text-muted">к вечеру на карте<br />и в резерве</div>
                <Money value={day.total} className={`figure mt-0.5 block text-[20px] ${day.total < 0 ? 'text-neg' : low ? 'text-warn' : ''}`} />
              </div>
            )}
          </div>
          <div className="mt-4 max-h-[46dvh] overflow-y-auto overscroll-contain px-2 pb-3">
            {events.length ? (
              <div className="divide-hair overflow-hidden rounded-[20px] bg-surface/90">
                {events.map(e => <SwipeEvent key={e.key} e={e} mark={marks[e.key]} now={now} />)}
              </div>
            ) : <p className="px-3 pb-3 text-[14.5px] text-muted">Ничего не уходит и не приходит.</p>}
            {events.some(e => !marks[e.key]?.done) && <p className="px-3 pt-2 text-[12px] text-faint">Сдвиньте строку вправо — отметить. Удержите — ещё действия.</p>}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
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
  const overdue = useMemo(() => eventsBetween(cal, addDays(now, -60), addDays(now, -1)).filter(e => e.kind === 'payment' && !marks[e.key]?.done), [cal, now, marks]);
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
          <div className="mb-2 px-5 text-[13px] font-medium text-neg">Не отмечены раньше</div>
          <div className="card divide-hair mx-4 overflow-hidden">
            {overdue.map(e => <SwipeEvent key={e.key} e={e} mark={marks[e.key]} now={now} showDate />)}
          </div>
        </section>
      )}
    </>
  );
}

function ListView({ month, events, total, incomes }: { month: string; events: CalEvent[]; total: number; incomes: number }) {
  const now = useToday();
  const enter = useEnter();
  const cal = useCal();
  const [marks, cardBalance, reserve] = useStore(useShallow(s => [s.marks, s.cardBalance, s.reserve] as const));
  const set = useUi(s => s.set);
  const [filter, setFilter] = useState<Filter>('all');
  const [topUps, setTopUps] = useState(false);
  const to = `${month}-${String(lastDay(month)).padStart(2, '0')}`;
  const flow = useMemo(() => {
    if (!cardBalance) return null;
    const until = addDays(cardBalance.date, 75);
    return cashFlow(cal, marks, cardBalance, until > to ? until : to);
  }, [cal, marks, cardBalance, to]);
  const amount = (e: CalEvent) => (marks[e.key]?.done && marks[e.key].amount != null ? marks[e.key].amount! : e.amount);
  const payments = events.filter(e => e.kind === 'payment');
  const paid = payments.filter(e => marks[e.key]?.done).reduce((s, e) => s + amount(e), 0);
  const byGroup = (g: EventGroup) => payments.filter(e => eventGroup(e) === g).reduce((s, e) => s + amount(e), 0);
  const visible = events.filter(e => matches(filter, eventGroup(e)) || (topUps && e.kind === 'weekly' && filter === 'all'));
  const byDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of visible) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [visible]);

  return (
    <>
      <section className="deep-card mx-4 mt-4 px-5 py-4">
        <div className="flex items-baseline justify-between text-[12.5px] text-card-muted">
          <span>Платежей в месяце</span>
          <span>оплачено <Money value={paid} className="text-card" /></span>
        </div>
        <span className="figure mt-1 block text-[30px] leading-none"><Roll value={total} /></span>
        <Bar value={total ? paid / total : 0} tone="card" onCard className="mt-4" />
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px] text-card-muted">
          <div>Кредиты<Money value={byGroup('debt')} className="mt-0.5 block text-[14px] text-card" /></div>
          <div>Обязательные<Money value={byGroup('fixed') + byGroup('other')} className="mt-0.5 block text-[14px] text-card" /></div>
          <div>Поступления<Money value={incomes} sign className="mt-0.5 block text-[14px] text-[#9ff0d4]" /></div>
        </div>
      </section>

      <div className="mt-5 flex items-center gap-2 px-4" data-noswipe>
        <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {FILTERS.map(f => (
            <motion.button key={f.id} type="button" whileTap={{ scale: 0.95 }} onClick={() => setFilter(f.id)}
              className={`relative shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors duration-200 ${filter === f.id ? 'border-transparent bg-ink text-bg' : 'border-line text-muted'}`}>
              <span className="relative">{f.label}</span>
            </motion.button>
          ))}
          {filter === 'all' && (
            <button type="button" onClick={() => setTopUps(!topUps)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-medium ${topUps ? 'border-sea text-sea' : 'border-line text-muted'}`}>Пополнения карты</button>
          )}
        </div>
        <IconButton onClick={() => set({ fixed: true })} label="Обязательные платежи"><Repeat size={17} strokeWidth={1.5} /></IconButton>
        <IconButton onClick={() => exportCalendar()} label="Напоминания в календарь iPhone"><BellRing size={17} strokeWidth={1.5} /></IconButton>
      </div>

      {byDate.length === 0 && <div className="mt-5 px-4"><Empty>В этом месяце ничего нет.</Empty></div>}
      <motion.div key={`${month}-${filter}-${topUps}`} variants={listAnim} initial={enter} animate="show">
        {byDate.map(([date, list]) => {
          const bal = flow?.byDay[date];
          const isToday = date === now;
          return (
            <motion.section key={date} variants={item} className="mt-5">
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
                {list.map(e => <SwipeEvent key={e.key} e={e} mark={marks[e.key]} now={now} />)}
              </div>
            </motion.section>
          );
        })}
      </motion.div>
      <p className="px-6 pt-5 text-center text-[11.5px] leading-snug text-muted">
        Сдвиньте строку вправо — отметить оплату. «до» — можно внести раньше, «~» — дата примерная. Суммы кредиток — оценка, пока не внесена точная из приложения банка.
      </p>
    </>
  );
}


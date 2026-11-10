// «Платежи» — хватит ли денег на всё, что спишется. Три вида, листаются пальцем:
// «Месяц» — календарь с водой и линия денег, выбранный день; «Хватит ли» — счета и прогноз покрытия до премии;
// «Список» — все платежи месяца по датам, отметка «оплачено» свайпом вправо.
import { BellRing, CalendarArrowUp, Check, ChevronLeft, ChevronRight, PencilLine, Repeat, Scale, Undo2 } from 'lucide-react';
import { Hold } from '../components/Hold';
import { toast } from '../store/ui';
import { animate, AnimatePresence, motion, useMotionValue } from 'motion/react';
import { haptic } from '../components/haptics';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CoverageCard, useCoverage } from '../components/Coverage';
import { ease, Flip, item, list as listAnim, Pager, Roll, spring, SwipeRow, useEnter, usePan } from '../components/motion';
import { LevelChart, MonthGrid, monthHeight, verdict, Weekdays, type DayMoney } from '../components/MoneyLevel';
import { SkyButton, SkyHeader } from '../components/Petersburg';
import { EventRow } from '../components/rows';
import { runQuick } from '../components/TabBar';
import { Bar, Empty, IconButton, Money } from '../components/ui';
import { weekMoney, type WeekMoney } from '../domain/bridge';
import { monthDays, NARROW, reserveByDay } from '../domain/coverage';
import { eventGroup, eventsBetween, type EventGroup } from '../domain/calendar';
import { addDays, addMonths, dayMonth, ddmm, lastDay, monthKey, monthName, weekday, weekdayFull, weekStart } from '../domain/dates';
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
  const { cov } = useCoverage();
  const set = useUi(s => s.set);
  const view = useUi(s => s.payView);
  const [month, setMonth] = useState(monthKey(now));
  // месяц и соседи по бокам ленты: соседние собраны заранее, листание не ждёт расчёта
  const keys = useMemo(() => [addMonths(month, -1), month, addMonths(month, 1)] as const, [month]);
  const [prev, cur, next] = useMonths(keys, cal, marks, cov, now);
  const { events, days } = cur;
  // выбранный день живёт в своём месяце; в другом месяце — сегодня или первый день, где что-то происходит.
  // Считается при отрисовке, а не эффектом: новый месяц сразу приходит с выбранным днём, без второй перерисовки
  const [picked, setPicked] = useState(now);
  const selected = monthKey(picked) === month ? picked : month === monthKey(now) ? now : events.find(e => e.kind !== 'weekly')?.date ?? `${month}-01`;

  const amount = (e: CalEvent) => (marks[e.key]?.done && marks[e.key].amount != null ? marks[e.key].amount! : e.amount);
  const total = events.filter(e => e.kind === 'payment').reduce((s, e) => s + amount(e), 0);
  const incomes = events.filter(e => e.kind === 'income').reduce((s, e) => s + amount(e), 0);

  const said = verdict(days);
  // смена месяца — переход (startTransition): соседний месяц уже на экране, а сборка нового дальнего соседа, линии и
  // заголовка идёт кусками между кадрами и не держит палец, если сразу листать дальше
  const shift = useCallback((n: 1 | -1) => startTransition(() => setMonth(m => addMonths(m, n))), []);
  // стрелки листают ту же ленту, что и палец; лента скрыта (другой вид) — месяц меняется сразу
  const flip = useRef<((dir: 1 | -1) => boolean) | null>(null);
  const arrow = (n: 1 | -1) => { if (!(view === 'month' && flip.current?.(n))) shift(n); };

  return (
    <div>
      <SkyHeader
        title={<button type="button" onClick={() => setMonth(monthKey(now))} className="text-left first-letter:uppercase">{monthName(month)}</button>}
        subtitle={<>уйдёт <Roll value={total} />, придёт <Roll value={incomes} /></>}
        action={
          <div className="flex gap-2">
            <SkyButton onClick={() => arrow(-1)} label="Предыдущий месяц"><ChevronLeft size={18} strokeWidth={1.7} /></SkyButton>
            <SkyButton onClick={() => arrow(1)} label="Следующий месяц"><ChevronRight size={18} strokeWidth={1.7} /></SkyButton>
          </div>
        } />
      <Pager<PayView> className="mt-3" value={view} onChange={v => set({ payView: v })} pages={[
        { id: 'month', label: 'Месяц', render: () => <MonthView months={[prev, cur, next]} selected={selected} onSelect={setPicked} onShift={shift} flip={flip} said={said} /> },
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

/** Высота воды в ячейках: от наибольшего резерва месяца, но не ниже четырёх запасов */
const topOf = (days: DayMoney[]) => Math.max(NARROW * 4, ...days.map(d => d.total ?? 0));

function MonthView({ months, selected, onSelect, onShift, flip, said }: {
  /** предыдущий, текущий и следующий месяцы — лента календаря */
  months: readonly [MonthData, MonthData, MonthData];
  selected: string; onSelect: (d: string) => void; onShift: (n: 1 | -1) => void;
  flip: { current: ((dir: 1 | -1) => boolean) | null }; said: ReturnType<typeof verdict>;
}) {
  const now = useToday();
  const [marks, expenses, debts, overrides, bridge] = useStore(useShallow(s => [s.marks, s.expenses, s.debts, s.weeklyOverrides, s.bridge] as const));
  const { month, days, events } = months[1];
  const top = topOf(days);
  // текущая неделя: сколько ещё на карте и с кредитки по мосту — вторая строка карточки дня
  const week = useMemo(() => weekMoney(expenses, debts, overrides, bridge, weekStart(now)), [expenses, debts, overrides, bridge, now]);
  const sel = days.find(d => d.date === selected);
  // открытый день и откуда он раскрывается (центр ячейки на экране)
  const [opened, setOpened] = useState<{ date: string; x: number; y: number } | null>(null);
  const open = useCallback((d: string, r: DOMRect) => { setOpened({ date: d, x: r.left + r.width / 2, y: r.top + r.height / 2 }); haptic(); }, []);
  // водой наполняется только первый показанный месяц; соседние приезжают налитыми
  const first = useRef(month);
  const byKey = new Map(months.map(m => [m.month, m]));
  const keys = useMemo(() => [months[0].month, month, months[2].month] as const, [months[0].month, month, months[2].month]);
  return (
    <>
      {/* вывод по резерву день за днём — те же числа, что в «Хватит ли» */}
      {said && (
        <motion.p key={said.text} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className={`mx-4 mt-3 rounded-2xl px-4 py-2.5 text-[13.5px] leading-snug ${said.tone === 'neg' ? 'bg-neg/10 text-neg' : said.tone === 'warn' ? 'bg-warn/12 text-warn' : 'bg-pos/10 text-pos'}`}>{said.text}</motion.p>
      )}
      <section className="mt-3 px-3" data-noswipe>
        <Weekdays />
        {/* лента месяцев: идёт за пальцем, соседние месяцы уже собраны по бокам */}
        <Flip className="-mx-3 mt-1.5" keys={keys} heightOf={monthHeight} onShift={onShift} control={flip} render={(k, slot) => {
          const m = byKey.get(k)!;
          return <MonthGrid month={k} days={m.days} top={topOf(m.days)} now={now} selected={slot === 0 ? selected : ''} still={k !== first.current}
            onSelect={onSelect} onOpen={open} />;
        }} />
      </section>
      <section className="mx-4 mt-5" data-noswipe>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-medium">В резерве к вечеру</span>
          {sel?.total != null && <span className="font-display text-[13px] font-medium whitespace-nowrap">{Number(selected.slice(8))}-го <Roll value={sel.total} /></span>}
        </div>
        <div className="mt-2"><LevelChart month={month} days={days} top={top} selected={selected} onSelect={onSelect} /></div>
      </section>
      <p className="px-5 pt-3 text-[12.5px] text-faint">Нажмите на день — он раскроется: что уходит, что приходит, сколько останется.</p>
      <AnimatePresence>
        {opened && <DayCard key={opened.date} date={opened.date} from={opened} day={days.find(d => d.date === opened.date)} events={events.filter(e => e.date === opened.date)} marks={marks} now={now} top={top}
          week={opened.date >= week.monday && opened.date <= addDays(week.monday, 6) ? week : null} onClose={() => setOpened(null)} />}
      </AnimatePresence>
    </>
  );
}

/** Карточка дня: вырастает из нажатой ячейки и уходит обратно в неё (навык apple-design: из источника в источник).
 *  Масштаб от точки ячейки — только transform и opacity; общая layout-анимация motion обходила бы все элементы
 *  приложения на каждом кадре. Лежит ниже листов (z-48): платёж, открытый из дня, встаёт поверх него */
function DayCard({ date, from, day, events, marks, now, top, week, onClose }: {
  date: string; from: { x: number; y: number }; day?: DayMoney; events: CalEvent[]; marks: Record<string, EventMark>; now: string; top: number;
  /** только для дней текущей недели: остаток на карте и с кредитки по мосту */
  week: WeekMoney | null; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // резерв к вечеру: красный — меньше нуля, жёлтый — меньше запаса NARROW
  const low = day?.total != null && day.total < NARROW;
  const level = day?.total == null ? 0 : Math.max(0.06, Math.min(1, Math.max(0, day.total) / Math.max(top, 1)));
  // смахнуть вниз — закрыть: карточка идёт за пальцем с сопротивлением
  const y = useMotionValue(0);
  const pan = usePan({
    axis: 'y',
    onMove: d => y.set(d > 0 ? d * 0.6 : d * 0.05),
    onEnd: (d, v) => { if (d * 0.6 > 80 || v > 400) onClose(); else animate(y, 0, spring); },
  });
  return (
    <motion.div className="fixed inset-0 z-[48]" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
      {/* просто затемнение, без размытия: размытие во весь экран пересчитывается на каждом кадре анимации под ним */}
      <motion.div className="absolute inset-0 bg-[rgba(4,14,22,.46)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="absolute inset-x-4 top-[18%] overflow-hidden rounded-[30px] bg-surface shadow-[0_30px_60px_-24px_rgba(4,14,22,.7)]"
        initial={{ opacity: 0, scale: 0.35 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.35, transition: { duration: 0.2, ease: ease.out } }}
        transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }}
        {...pan} style={{ y, transformOrigin: `${from.x - 16}px ${from.y - window.innerHeight * 0.18}px`, touchAction: 'pan-x' }}>
        {/* вода дня: сколько в резерве к вечеру — поднимается снизу (scaleY, на видеокарте) */}
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
                <div className="text-[11.5px] text-muted">в резерве<br />к вечеру</div>
                <Money value={day.total} className={`figure mt-0.5 block text-[20px] ${day.total < 0 ? 'text-neg' : low ? 'text-warn' : ''}`} />
              </div>
            )}
          </div>
          {/* недельные деньги — отдельно: по плану они тратятся до нуля и к дням платежей запаса не прибавляют */}
          {week && (
            <p className="px-5 pt-2 text-[12.5px] text-muted">
              на неделю: на карте <Money value={Math.max(0, week.cardLeft)} />{week.creditCap > 0 && <> + с кредитки <Money value={Math.max(0, week.creditLeft)} /></>}
            </p>
          )}
          <div className="mt-4 max-h-[46dvh] overflow-y-auto overscroll-contain px-2 pb-3">
            {events.length || day?.extra.length ? (
              <div className="divide-hair overflow-hidden rounded-[20px] bg-surface/90">
                {events.map(e => <SwipeEvent key={e.key} e={e} mark={marks[e.key]} now={now} />)}
                {/* шаги прогноза без события в календаре: погашение моста */}
                {day?.extra.map(x => (
                  <div key={x.title} className="flex items-center justify-between gap-3 px-4 py-3 text-[14.5px]">
                    <span className="min-w-0 truncate font-medium">{x.title}</span><Money value={-x.delta} className="shrink-0 text-[15px]" />
                  </div>
                ))}
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
  const marks = useStore(s => s.marks);
  const set = useUi(s => s.set);
  const [filter, setFilter] = useState<Filter>('all');
  const [topUps, setTopUps] = useState(false);
  const to = `${month}-${String(lastDay(month)).padStart(2, '0')}`;
  // резерв к вечеру по датам — тот же прогноз покрытия, что в календаре и в «Хватит ли»
  const { cov } = useCoverage();
  const levels = useMemo(() => reserveByDay(cov, `${month}-01`, to), [cov, month, to]);
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
      <section className="deep-card deep-sunset mx-4 mt-4 px-5 py-4">
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
          const bal = levels[date];
          const isToday = date === now;
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


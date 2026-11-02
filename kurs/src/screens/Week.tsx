// «Неделя»: сцена с мостом, остаток недели и кольцо дня. Под сценой — действия и стопка карточек: сегодня,
// ближайший платёж, дела, резерв. Плашка о перерасходе появляется при входе в приложение и сама растворяется.
import { ChevronRight, Hourglass, MessagesSquare, PiggyBank, Scale, ScanText, Settings as Cog } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CardStack, type StackCard } from '../components/CardStack';
import { DayRing } from '../components/DayRing';
import { bridgeControl, lampAt, SkyButton, WeekScene } from '../components/Petersburg';
import { haptic } from '../components/haptics';
import { Roll, spring } from '../components/motion';
import { runQuick } from '../components/TabBar';
import { AlertRow, EventRow } from '../components/rows';
import { CatIcon, Money } from '../components/ui';
import { eventsBetween, urgency } from '../domain/calendar';
import { weekMoney } from '../domain/bridge';
import { addDays, dayMonth, ddmm, fromKey, monthIn, plural, weekday, weekdayFull, weekRange, weekStart } from '../domain/dates';
import { BIG_PURCHASE_HOURS, currentPhase, phaseByDate, reserveNeed, totalDebt } from '../domain/plan';
import { alerts as buildAlerts, type Alert, countsWeekly, dayBudget, weekSummary } from '../domain/summary';
import type { CalEvent } from '../domain/types';
import { weekReport, weekToClose } from '../domain/weekly';
import { useStore } from '../store/store';
import { toast, useCal, useToday, useUi } from '../store/ui';
import { checkInbox, checkPlan } from './Sync';
import { TodayDetails } from './TodaySheet';

/* вход в приложение: запуск или возвращение из фона — тогда плашка о перерасходе показывается снова */
let entry = 0;
let wasHidden = false;
let pillShownAt = -1;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') wasHidden = true;
  else if (wasHidden) { wasHidden = false; entry++; }
});

/** Плашка о перерасходе: при входе в приложение и после траты, которая увела день глубже в минус; держится 6,5 с */
function useOverPill(left: number, alert: boolean) {
  const [phase, setPhase] = useState<'in' | 'out' | null>(null);
  const [key, setKey] = useState(0);
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const show = useCallback((delay: number) => {
    clear();
    pillShownAt = entry;
    timers.current.push(window.setTimeout(() => { setKey(k => k + 1); setPhase('in'); }, delay));
    timers.current.push(window.setTimeout(() => setPhase('out'), delay + 6500));
    timers.current.push(window.setTimeout(() => setPhase(null), delay + 7300));
  }, []);
  const hide = () => {
    clear();
    setPhase('out');
    timers.current.push(window.setTimeout(() => setPhase(null), 800));
  };
  const alertNow = useRef(alert);
  alertNow.current = alert;
  useEffect(() => {
    // через секунду после входа: кольцо уже досчитало, мост пошёл вверх
    const onEntry = () => { if (alertNow.current && pillShownAt !== entry) show(1200); };
    onEntry();
    const onVisible = () => { if (document.visibilityState === 'visible') onEntry(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); clear(); };
  }, [show]);
  const prev = useRef(left);
  useEffect(() => {
    if (left < 0 && left < prev.current) show(600);
    prev.current = left;
  }, [left, show]);
  return { phase, key, hide };
}

export function Week() {
  const now = useToday();
  const cal = useCal();
  const [expenses, debts, marks, wishes, reserve, settings, overrides, startTotal, closures, checklist, checks, toggleCheck, bridge, checkups] = useStore(useShallow(s => [
    s.expenses, s.debts, s.marks, s.wishes, s.reserve, s.settings, s.weeklyOverrides, s.planTrajectory[0]?.[1] ?? 0, s.closures, s.checklist, s.checks, s.toggleCheck, s.bridge, s.checkups,
  ] as const));
  const ui = useUi();
  const todayIdx = (fromKey(now).getDay() + 6) % 7;
  // сцена уходит медленнее страницы, сверху проявляется стеклянная полоса с остатком
  // без событий прокрутки (fixing-motion-performance): параллакс — CSS scroll-timeline (.sc-parallax),
  // полоса и пауза бесконечных анимаций — по видимости сцены (IntersectionObserver)
  const sceneRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mark = markRef.current, scene = sceneRef.current;
    if (!mark || !scene) return;
    const bar = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting && e.boundingClientRect.top < 0));
    const pause = new IntersectionObserver(([e]) => scene.classList.toggle('sc-paused', !e.isIntersecting));
    bar.observe(mark);
    pause.observe(scene);
    return () => { bar.disconnect(); pause.disconnect(); };
  }, []);

  // потянуть сцену вниз: мост сводится вслед за пальцем; отпустили за порогом — проверка новой редакции плана
  // и файла из чата, мост снова разводится. Сцена тянется с сопротивлением, как резинка (apple-design: rubber-band)
  const pullRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState<{ k: number; armed: boolean; busy: boolean }>({ k: 0, armed: false, busy: false });
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    let y0: number | null = null, armed = false;
    const start = (e: TouchEvent) => {
      if (window.scrollY > 0 || e.touches.length !== 1 || (e.target as Element).closest('[data-nopull]')) return;
      y0 = e.touches[0].clientY;
    };
    const move = (e: TouchEvent) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy <= 0) return;
      e.preventDefault();
      const k = Math.min(1, dy / 180);
      if (pullRef.current) pullRef.current.style.transform = `translateY(${(76 * (1 - Math.exp(-dy / 150))).toFixed(1)}px)`;
      bridgeControl.pull(k);
      const now = k >= 0.72;
      if (now !== armed) { armed = now; if (armed) haptic(); }
      setPull({ k, armed, busy: false });
    };
    const end = async () => {
      if (y0 == null) return;
      y0 = null;
      const el2 = pullRef.current;
      if (el2) { el2.style.transition = 'transform 420ms var(--ease-drawer)'; el2.style.transform = ''; window.setTimeout(() => { el2.style.transition = ''; }, 440); }
      if (armed) {
        armed = false;
        setPull({ k: 0, armed: false, busy: true });
        const [plan, inbox] = await Promise.all([checkPlan(), checkInbox()]);
        if (plan === 'none' && !inbox) toast('Всё свежее: новых данных нет');
      }
      bridgeControl.release();
      setPull({ k: 0, armed: false, busy: false });
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); };
  }, []);
  const week = useMemo(() => weekSummary(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const today = useMemo(() => dayBudget(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const money = useMemo(() => weekMoney(expenses, debts, overrides, bridge, weekStart(now)), [expenses, debts, overrides, bridge, now]);
  const bridgeCardName = `${debts.find(d => d.id === bridge?.card)?.short ?? 'кредитка'}-кредитка`.replace('кредитка-кредитка', 'кредитка');
  const phase = currentPhase(debts, now);
  const planPhase = phaseByDate(now);
  const list = useMemo(() => buildAlerts({ bridge, cal, marks, expenses, wishes, now, nowMs: Date.now(), lastBackupAt: settings.lastBackupAt, lastIcsAt: settings.lastIcsAt, checklist, checks }),
    [bridge, cal, marks, expenses, wishes, now, settings.lastBackupAt, settings.lastIcsAt, checklist, checks]);
  const pending = wishes.filter(w => !w.resolved);
  const debt = totalDebt(debts);
  const over = week.left < 0;
  const dayAlert = today.left < 0 || today.exhausted;
  const pill = useOverPill(today.left, dayAlert);
  const { need, next } = reserveNeed(now, debts);
  // воскресное пополнение карты жизни: лимит следующей недели минус то, что на ней осталось
  const current = useMemo(() => weekReport(expenses, debts, overrides, week.monday, bridge), [expenses, debts, overrides, week.monday, bridge]);
  const topped = closures[week.monday]?.topUp;

  // в выходные и в начале недели — предложить закрыть неделю
  // неделя считается закрытой, когда сохранена сверка с банком (или закрыта по-старому)
  const done = useMemo(() => ({ ...closures, ...Object.fromEntries(checkups.map(c => [c.monday, c])) }) as typeof closures, [closures, checkups]);
  const closeMonday = weekToClose(now, done);
  const dow = fromKey(now).getDay();
  const offerClose = !done[closeMonday] && (dow === 0 || dow === 6 || closeMonday < week.monday);
  const closing = useMemo(() => (offerClose ? weekReport(expenses, debts, overrides, closeMonday, bridge) : null), [offerClose, expenses, debts, overrides, closeMonday, bridge]);

  // платежи: просроченные и на 3 дня — из предупреждений, плюс всё неотмеченное на неделю вперёд
  const ahead = useMemo(() => {
    const out = new Map<string, CalEvent>();
    for (const a of list) if (a.action === 'pay' && a.event) out.set(a.event.key, a.event);
    for (const e of eventsBetween(cal, now, addDays(now, 7))) if (!marks[e.key]?.done) out.set(e.key, e);
    return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [list, cal, now, marks]);
  const nextPay = ahead.find(e => e.kind === 'payment') ?? ahead[0];
  const nextU = nextPay ? urgency(nextPay, marks[nextPay.key], now) : null;
  const payHot = nextU === 'overdue' || (!!nextPay && nextPay.kind === 'payment' && nextPay.date <= addDays(now, 1));

  const todoAlerts = list.filter(a => a.action !== 'pay' && a.action !== 'wish');
  const todoCount = (closing ? 1 : 0) + todoAlerts.length + pending.length;
  const todoFirst = closing ? `Сверка с банком за ${ddmm(closeMonday)}–${ddmm(addDays(closeMonday, 6))}` : todoAlerts[0]?.title ?? (pending[0] ? `Пауза 48 часов: ${pending[0].title}` : null);

  const onAlert = (a: Alert) => {
    if (a.action === 'pay' || a.action === 'weekly') ui.set({ event: a.event ?? null });
    else if (a.action === 'income') ui.set({ bonus: { event: a.event } });
    else if (a.action === 'backup') ui.set({ settings: true, settingsFocus: 'backup' });
    else if (a.action === 'calendar') ui.set({ settings: true, settingsFocus: 'reminders' });
    else if (a.action === 'check') { ui.set({ planView: 'checklist', focus: a.id.replace(/^check:/, '') }); ui.setTab('plan'); }
    else if (a.id === 'credit') ui.setTab('budget');
  };

  const whenShort = (e: CalEvent) => `${weekday(e.date)} ${Number(e.date.slice(8))}`;
  const cards: StackCard[] = [
    {
      id: 'today', tone: 'today', kicker: 'Сегодня', alert: dayAlert,
      title: <>Потрачено <Money value={today.spentToday} /> из <Money value={today.day} /></>,
      amount: today.left < 0 ? <>−<Money value={-today.left} /></> : <Money value={today.left} />,
      body: (
        <>
          <TodayDetails />
          <button type="button" onClick={() => ui.set({ week: week.monday })} className="mt-2 flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13.5px]">
            <span>Итог недели: <Money value={week.spent} /> из <Money value={week.limit} /></span>
            <ChevronRight size={15} className="shrink-0 text-faint" />
          </button>
        </>
      ),
    },
    {
      id: 'ahead', tone: 'ahead', alert: nextU === 'overdue',
      kicker: !nextPay ? 'Платежи' : nextU === 'overdue' ? 'Просрочен платёж' : nextPay.date === now ? 'Платёж сегодня'
        : `${nextPay.kind === 'income' ? 'Поступление' : nextPay.kind === 'weekly' ? 'Пополнение карты' : 'Ближайший платёж'}, ${whenShort(nextPay)}`,
      title: nextPay ? nextPay.title : 'На неделе платежей нет',
      amount: nextPay ? <Money value={nextPay.amount} approx={nextPay.approx} sign={nextPay.kind === 'income'} /> : undefined,
      body: (
        <>
          {ahead.length > 0 && <div className="divide-hair">{ahead.slice(0, 5).map(e => <EventRow key={e.key} e={e} mark={marks[e.key]} now={now} onClick={() => ui.set({ event: e })} />)}</div>}
          <button type="button" onClick={() => ui.setTab('payments')} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px]" style={{ color: 'var(--stack-ahead-kicker)' }}>
            Все платежи месяца <ChevronRight size={15} />
          </button>
        </>
      ),
    },
    {
      id: 'todo', tone: 'todo', kicker: 'Дела',
      title: todoFirst ? <>{todoFirst}{todoCount > 1 ? ` и ещё ${todoCount - 1}` : ''}</> : 'Всё сделано',
      amount: todoCount > 0 ? <span style={{ color: 'var(--stack-todo-kicker)' }}>{todoCount}</span> : undefined,
      body: todoCount === 0
        ? <p className="px-4 text-[13.5px] leading-snug text-muted">Здесь появятся сроки из чек-листа, резервная копия и закрытие недели.</p>
        : (
          <div className="divide-hair">
            {closing && (
              <button type="button" onClick={() => ui.set({ checkup: closeMonday })} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sea/12 text-sea"><PiggyBank size={17} strokeWidth={1.6} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] leading-snug font-medium">Сверка с банком и закрытие недели {ddmm(closeMonday)}–{ddmm(addDays(closeMonday, 6))}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                    Впишите остатки на карте, в резерве и на кредитке — приложение сверит с учётом и скажет, сколько перевести. По учёту из резерва на карту <Money value={closing.topUp} className="text-ink" />{closing.leftover > 0 ? <>, остаток <Money value={closing.leftover} /> уже на ней</> : closing.left < 0 ? <>, перерасход <Money value={-closing.left} /></> : ''}.
                  </span>
                </span>
                <ChevronRight size={16} className="mt-2.5 shrink-0 text-faint" />
              </button>
            )}
            {todoAlerts.map(a => (a.action === 'check'
              ? <CheckRow key={a.id} a={a} onToggle={() => toggleCheck(a.id.replace(/^check:/, ''))} onOpen={() => onAlert(a)} />
              : <AlertRow key={a.id} a={a} now={now} onClick={() => onAlert(a)} />))}
            {pending.map(w => <WishRow key={w.id} id={w.id} />)}
          </div>
        ),
    },
    {
      id: 'money', tone: 'money', kicker: 'Резерв', alert: reserve < need,
      title: <><Money value={reserve} />, нужно <Money value={need} /></>,
      body: (
        <>
          <button type="button" onClick={() => ui.set({ reserve: true })} className="block w-full px-4 pt-1 text-left">
            <span className="relative block h-1.5 rounded-full" style={{ background: reserve >= need ? 'linear-gradient(90deg, var(--ring-1), var(--ring-2))' : 'var(--line)' }}>
              {reserve >= need
                ? <span className="absolute -top-[3px] h-3 w-0.5 rounded-full bg-ink" style={{ left: `${(need / Math.max(reserve, 1)) * 100}%` }} />
                : <span className="absolute inset-y-0 left-0 rounded-full bg-warn" style={{ width: `${(reserve / Math.max(need, 1)) * 100}%` }} />}
            </span>
            <span className={`mt-2 block text-[12.5px] leading-snug ${reserve < need ? 'text-warn' : 'text-muted'}`}>
              {reserve >= need ? <>Держит <Money value={need} /> до премии {monthIn(next)}, запас <Money value={reserve - need} /></> : <>До премии {monthIn(next)} нужно <Money value={need} />, не хватает <Money value={need - reserve} /></>}
            </span>
          </button>
          <button type="button" onClick={() => ui.set({ week: week.monday })} className="mt-4 block w-full px-4 pb-1 text-left">
            <span className="flex items-baseline justify-between gap-3 text-[14px]">
              {topped != null ? 'Долито в воскресенье' : 'Долить в воскресенье'}
              <Money value={topped ?? current.topUp} className="figure text-[15px]" />
            </span>
            <span className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-line">
              <span className="bg-sea" style={{ width: `${(current.leftover / Math.max(current.nextLimit, 1)) * 100}%` }} />
              <span className="bg-warn" style={{ width: `${(current.topUp / Math.max(current.nextLimit, 1)) * 100}%` }} />
            </span>
            <span className="mt-2 block text-[12.5px] leading-snug text-muted">
              {topped != null ? 'из резерва на карту жизни' : current.leftover > 0 ? <>на карте останется <Money value={current.leftover} />, остальное из резерва</> : 'из резерва, до полного лимита'}
            </span>
          </button>
        </>
      ),
    },
  ];
  // раскрыта карточка, которую открыли; без выбора — срочный платёж, иначе «Сегодня»
  const open = ui.stackOpen ?? (payHot ? 'ahead' : 'today');

  return (
    <div className="relative">
      <CompactBar weekLeft={week.left} dayLeft={today.left} show={compact} />
      <div ref={markRef} aria-hidden="true" className="pointer-events-none absolute top-[330px] h-px w-px" />
      <div ref={sceneRef} className="sc-parallax" style={{ background: 'var(--sky-1)' }}>
      <div ref={pullRef} className="relative">
      <AnimatePresence>
        {(pull.k > 0.06 || pull.busy) && (
          <motion.div key="pull" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            className="glass pointer-events-none absolute inset-x-0 -top-9 z-10 mx-auto w-fit rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium backdrop-blur-md"
            style={{ background: 'var(--pill)', borderColor: 'var(--pill-border)', color: 'var(--scene-ink)' }}>
            {pull.busy ? 'Проверяю план и файл из чата…' : pull.armed ? 'Отпустите — проверю обновления' : 'Потяните, чтобы обновить'}
          </motion.div>
        )}
      </AnimatePresence>
      <WeekScene today={todayIdx} overlay={<Lamps monday={week.monday} todayIdx={todayIdx} limit={week.limit} dayNorm={today.day} />}>
        <div className="flex items-start justify-between gap-3 px-5 pt-2.5">
          <div style={{ color: 'var(--scene-ink)' }}>
            <div className="text-[14px] first-letter:uppercase" style={{ color: 'var(--scene-muted)' }}>{weekdayFull(now)}, {dayMonth(now)}</div>
            <div className="font-display mt-0.5 text-[19px] font-medium">Неделя {weekRange(week.monday, week.sunday)}</div>
          </div>
          <span className="pointer-events-auto flex gap-2"><SkyButton onClick={() => ui.set({ settings: true })} label="Настройки"><Cog size={18} strokeWidth={1.5} /></SkyButton></span>
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-3 pr-4 pl-5">
          <div className="pt-3" style={{ color: over ? 'var(--neg)' : 'var(--scene-ink)' }}>
            <div className="figure text-[36px] leading-[.95]" aria-live="polite">
              {over && <span className="mr-0.5">−</span>}<Roll value={Math.abs(week.left)} />
            </div>
            <div className="mt-1.5 text-[14px] leading-snug" style={{ color: over ? 'var(--neg)' : 'var(--scene-muted)' }}>
              {over ? <>перерасход<br />за неделю</> : <>на неделю,<br />до воскресенья</>}
            </div>
            {/* неделя моста: сколько из этого на карте, а сколько — кредитка */}
            {money.creditCap > 0 && !over && (
              <div className="mt-2.5 w-[168px] text-[12px] leading-snug" style={{ color: 'var(--scene-muted)' }}>
                <div className="flex h-2 overflow-hidden rounded-full bg-white/20">
                  <span style={{ width: `${(Math.max(0, money.cardLeft) / money.limit) * 100}%`, background: 'linear-gradient(90deg, var(--ring-1), var(--ring-2))' }} />
                  <span style={{ width: `${(Math.max(0, money.creditLeft) / money.limit) * 100}%`, background: 'repeating-linear-gradient(135deg, #c77dff 0 5px, #9b5de5 5px 10px)' }} />
                </div>
                <div className="mt-1.5 flex items-center gap-1.5"><span className="size-2 rounded-[3px]" style={{ background: 'var(--ring-1)' }} />на карте <Money value={Math.max(0, money.cardLeft)} /></div>
                <div className="flex items-center gap-1.5"><span className="size-2 rounded-[3px] bg-[#b06ef3]" />кредитка <Money value={Math.max(0, money.creditLeft)} /></div>
              </div>
            )}
          </div>
          <DayRing day={today.day} left={today.left} onClick={() => ui.set({ today: true })} />
        </div>
        {money.creditCap > 0 && !over && money.cardLeft <= 0 && money.creditLeft > 0 && !pill.phase && (
          <p className="sc-pop mx-5 mt-3 rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-snug backdrop-blur-md"
            style={{ background: 'var(--pill)', borderColor: 'var(--pill-border)', color: 'var(--scene-ink)' }}>
            Карта пуста — дальше {bridgeCardName}, доступно <Money value={money.creditLeft} /> до воскресенья. Только покупки картой.
          </p>
        )}
        {pill.phase && (
          <button key={pill.key} type="button" onClick={pill.hide} aria-label="Скрыть"
            className={`pointer-events-auto relative mx-5 mt-3 block w-[calc(100%-2.5rem)] overflow-hidden rounded-2xl border px-3.5 pt-2.5 pb-3.5 text-left text-[14px] leading-snug shadow-lg backdrop-blur-md ${pill.phase === 'out' ? 'sc-pill-out' : 'sc-pill-in'}`}
            style={{ background: 'var(--pill)', borderColor: 'var(--pill-border)', color: 'var(--scene-ink)' }}>
            {today.exhausted ? (
              <><span className="font-medium" style={{ color: 'var(--ring-neg)' }}>Недельный лимит исчерпан,</span> до понедельника только необходимое</>
            ) : today.nextWeek ? (
              <><span className="font-medium" style={{ color: 'var(--ring-neg)' }}>Сегодня перерасход <Money value={-today.left} />.</span> С понедельника новая неделя: <Money value={today.tomorrow} /> в день</>
            ) : (
              <><span className="font-medium" style={{ color: 'var(--ring-neg)' }}>Сегодня перерасход <Money value={-today.left} />,</span> поэтому с завтра лимит <Money value={today.tomorrow} /> в день</>
            )}
            {pill.phase === 'in' && <span className="sc-pill-timer absolute inset-x-3.5 bottom-1.5 h-[2px] rounded-full opacity-70" style={{ background: 'var(--ring-neg)' }} />}
          </button>
        )}
      </WeekScene>
      </div>
      </div>

      {/* действия с данными: всё, что приходит из банка и из чата */}
      <div className="relative z-[1] -mt-1 grid grid-cols-3 gap-2 bg-bg px-4 pt-2">
        {([
          ['scan', 'Из банка', ScanText],
          ['checkup', 'Сверка', Scale],
          ['sync', 'Чат', MessagesSquare],
        ] as const).map(([id, label, Icon], i) => (
          <motion.button key={id} type="button" whileTap={{ scale: 0.95 }} onClick={() => runQuick(id)}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 + i * 0.05 }}
            className="flex h-[62px] flex-col items-center justify-center gap-1 rounded-[18px] bg-surface text-[12.5px] font-medium text-sea shadow-[0_1px_2px_rgba(10,36,51,.06),0_10px_24px_-18px_rgba(10,36,51,.45)]">
            <Icon size={21} strokeWidth={1.7} /> {label}
          </motion.button>
        ))}
      </div>

      <div className="relative z-[1] bg-bg px-4 pt-4">
        <CardStack cards={cards} open={open} onOpen={id => ui.set({ stackOpen: id ?? '' })} />
      </div>

      <button type="button" onClick={() => ui.setTab('plan')} className="relative z-[1] mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-between gap-3 rounded-[20px] px-4 py-3 text-left text-[13px] text-muted">
        <span className="min-w-0">
          <span className="block text-ink">Этап {phase.id}: {phase.title}</span>
          {phase.id < planPhase.id && planPhase.id > 0 && <span className="block text-warn">по плану уже этап {planPhase.id}</span>}
          <span className="block">Общий долг <Money value={debt} className="text-ink" />{startTotal > debt ? <span className="text-pos">, уже −<Money value={startTotal - debt} /></span> : null}</span>
        </span>
        <ChevronRight size={15} className="shrink-0" />
      </button>
    </div>
  );
}

/** Пункт чек-листа: кружок — отметить сделанным прямо здесь, текст — открыть чек-лист */
function CheckRow({ a, onToggle, onOpen }: { a: Alert; onToggle: () => void; onOpen: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <button type="button" onClick={onToggle} aria-label={`Отметить сделанным: ${a.title}`}
        className={`mt-0.5 size-8 shrink-0 rounded-full border-[1.5px] transition active:scale-90 ${a.tone === 'warn' ? 'border-warn' : 'border-sea'}`} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block text-[14.5px] leading-snug font-medium">{a.title}</span>
        {a.text && <span className={`mt-0.5 block text-[12.5px] leading-snug ${a.tone === 'warn' ? 'text-warn' : 'text-muted'}`}>{a.text}</span>}
      </button>
    </div>
  );
}

function WishRow({ id }: { id: string }) {
  const w = useStore(s => s.wishes.find(x => x.id === id))!;
  const resolve = useStore(s => s.resolveWish);
  const set = useUi(s => s.set);
  const left = Date.parse(w.createdAt) + BIG_PURCHASE_HOURS * 3600_000 - Date.now();
  const ready = left <= 0;
  const h = Math.ceil(left / 3600_000);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <CatIcon id={w.category} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-medium">Пауза 48 часов: {w.title}</div>
        <div className={`flex items-center gap-1 text-[12px] ${ready ? 'text-pos' : 'text-muted'}`}>
          <Hourglass size={11} /> {ready ? 'можно решать' : `ещё ${h} ${plural(h, 'час', 'часа', 'часов')}`}, <Money value={w.amount} />
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button type="button" onClick={() => resolve(w.id, 'skipped')} className="rounded-full bg-pos/12 px-3 py-1.5 text-[12.5px] font-medium text-pos">Не нужно</button>
        {ready && <button type="button" onClick={() => set({ add: { amount: w.amount, category: w.category, note: w.title, wishId: w.id } })} className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-medium">Купить</button>}
      </div>
    </div>
  );
}

/** Стеклянная полоса сверху: когда сцена ушла за край, остаток недели и дня остаются на виду */
function CompactBar({ weekLeft, dayLeft, show }: { weekLeft: number; dayLeft: number; show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Наверх"
          initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -24, opacity: 0 }} transition={spring}
          className="glass fixed inset-x-0 top-[env(safe-area-inset-top)] z-30 mx-auto flex w-full max-w-md items-center justify-between gap-3 border-b border-line bg-bg/80 px-5 py-2.5 text-left backdrop-blur-xl backdrop-saturate-150">
          <span>
            <span className="block text-[11.5px] text-muted">{weekLeft < 0 ? 'перерасход недели' : 'на неделю'}</span>
            <span className={`figure block text-[19px] leading-tight ${weekLeft < 0 ? 'text-neg' : ''}`}><Roll value={Math.abs(weekLeft)} /></span>
          </span>
          <span className="text-right">
            <span className="block text-[11.5px] text-muted">{dayLeft < 0 ? 'сверх лимита дня' : 'на сегодня'}</span>
            <span className={`figure block text-[19px] leading-tight ${dayLeft < 0 ? 'text-neg' : 'text-sea'}`}><Roll value={Math.abs(dayLeft)} /></span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/** Фонари набережной — дни недели. Нажмите на фонарь или ведите пальцем вдоль набережной — подпись следует за пальцем */
function Lamps({ monday, todayIdx, limit, dayNorm }: { monday: string; todayIdx: number; limit: number; dayNorm: number }) {
  const expenses = useStore(s => s.expenses);
  const [open, setOpen] = useState<number | null>(null);
  const [scrub, setScrub] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const spent = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = addDays(monday, i);
    return expenses.filter(e => e.date === d && countsWeekly(e)).reduce((s, e) => s + e.amount, 0);
  }), [expenses, monday]);
  useEffect(() => {
    if (open == null || scrub) return;
    const t = window.setTimeout(() => setOpen(null), 4200);
    return () => clearTimeout(t);
  }, [open, scrub]);
  // какой фонарь под пальцем: ближайший по горизонтали
  const at = (clientX: number) => {
    const r = strip.current!.getBoundingClientRect();
    const k = (clientX - r.left) / r.width;
    let best = 0, dist = Infinity;
    for (let i = 0; i < 7; i++) { const dd = Math.abs(lampAt(i).x - k); if (dd < dist) { dist = dd; best = i; } }
    return best;
  };
  const move = (clientX: number) => { const i = at(clientX); if (i !== open) { setOpen(i); haptic(); } };
  const avg = limit / 7;
  return (
    <>
      {/* полоса вдоль набережной: ведите пальцем — дни сменяются с лёгким щелчком */}
      <div ref={strip} data-nopull className="pointer-events-auto absolute inset-x-[4%] touch-none" style={{ top: `${lampAt(0).y * 100 - 6}%`, height: '14%' }}
        onPointerDown={e => { strip.current?.setPointerCapture(e.pointerId); setScrub(true); move(e.clientX); }}
        onPointerMove={e => scrub && move(e.clientX)}
        onPointerUp={() => setScrub(false)} onPointerCancel={() => setScrub(false)}>
        {[0, 1, 2, 3, 4, 5, 6].map(i => {
          const date = addDays(monday, i);
          return <button key={i} type="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setOpen(i)} aria-label={`${weekdayFull(date)}: ${i > todayIdx ? 'впереди' : `потрачено ${Math.round(spent[i])} ₽`}`} className="sr-only" />;
        })}
      </div>
      <AnimatePresence>
        {open != null && (() => {
          const p = lampAt(open);
          const date = addDays(monday, open);
          const future = open > todayIdx, isToday = open === todayIdx;
          const v = spent[open];
          const ref = isToday ? dayNorm : avg;
          const over = !future && v > ref + 0.5;
          return (
            <motion.div key={open} initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.97, transition: { duration: 0.14 } }} transition={spring}
              className="absolute z-10 w-[176px] -translate-x-1/2 rounded-2xl border px-3.5 py-2.5 text-[13px] leading-snug shadow-lg backdrop-blur-md"
              style={{ transformOrigin: 'bottom center', left: `clamp(100px, ${p.x * 100}%, calc(100% - 100px))`, bottom: `${(1 - p.y) * 100 + 7}%`, background: 'var(--pill)', borderColor: 'var(--pill-border)', color: 'var(--scene-ink)' }}>
              <div className="text-[12px] first-letter:uppercase" style={{ color: 'var(--scene-muted)' }}>{isToday ? 'сегодня' : weekdayFull(date)}, {Number(date.slice(8))}-е</div>
              {future
                ? <div className="mt-0.5 font-medium">впереди, в среднем <Money value={avg} /> в день</div>
                : <div className="mt-0.5 font-medium" style={{ color: over ? 'var(--ring-neg)' : undefined }}>потрачено <Money value={v} />{isToday ? <> из <Money value={dayNorm} /></> : null}</div>}
              {!future && !isToday && <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--scene-muted)' }}>{v === 0 ? 'день без трат' : v > avg ? `больше среднего дня на ${Math.round(v - avg).toLocaleString('ru-RU')} ₽` : 'в пределах среднего дня'}</div>}
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </>
  );
}

// «Неделя»: сцена с мостом, остаток недели и кольцо дня. Под сценой — действия и стопка карточек: сегодня,
// ближайший платёж, дела, резерв. Плашка о перерасходе появляется при входе в приложение и сама растворяется.
import { ChevronRight, FileUp, Hourglass, PiggyBank, Plus, Settings as Cog } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CardStack, type StackCard } from '../components/CardStack';
import { DayRing } from '../components/DayRing';
import { SkyButton, WeekScene } from '../components/Petersburg';
import { AlertRow, EventRow } from '../components/rows';
import { CatIcon, Money } from '../components/ui';
import { useCountUp } from '../components/useCountUp';
import { eventsBetween, urgency } from '../domain/calendar';
import { addDays, dayMonth, ddmm, fromKey, monthIn, plural, weekday, weekdayFull, weekRange } from '../domain/dates';
import { BIG_PURCHASE_HOURS, currentPhase, phaseByDate, reserveNeed, totalDebt } from '../domain/plan';
import { alerts as buildAlerts, type Alert, dayBudget, weekSummary } from '../domain/summary';
import type { CalEvent } from '../domain/types';
import { weekReport, weekToClose } from '../domain/weekly';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';
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
  const [expenses, debts, marks, wishes, reserve, settings, overrides, startTotal, closures, checklist, checks, toggleCheck] = useStore(useShallow(s => [
    s.expenses, s.debts, s.marks, s.wishes, s.reserve, s.settings, s.weeklyOverrides, s.planTrajectory[0]?.[1] ?? 0, s.closures, s.checklist, s.checks, s.toggleCheck,
  ] as const));
  const ui = useUi();
  const week = useMemo(() => weekSummary(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const today = useMemo(() => dayBudget(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const phase = currentPhase(debts, now);
  const planPhase = phaseByDate(now);
  const list = useMemo(() => buildAlerts({ cal, marks, expenses, wishes, now, nowMs: Date.now(), lastBackupAt: settings.lastBackupAt, lastIcsAt: settings.lastIcsAt, checklist, checks }),
    [cal, marks, expenses, wishes, now, settings.lastBackupAt, settings.lastIcsAt, checklist, checks]);
  const pending = wishes.filter(w => !w.resolved);
  const debt = totalDebt(debts);
  const over = week.left < 0;
  const shown = useCountUp(Math.abs(week.left));
  const dayAlert = today.left < 0 || today.exhausted;
  const pill = useOverPill(today.left, dayAlert);
  const { need, next } = reserveNeed(now, debts);
  // воскресное пополнение карты жизни: лимит следующей недели минус то, что на ней осталось
  const current = useMemo(() => weekReport(expenses, debts, overrides, week.monday), [expenses, debts, overrides, week.monday]);
  const topped = closures[week.monday]?.topUp;

  // в выходные и в начале недели — предложить закрыть неделю
  const closeMonday = weekToClose(now, closures);
  const dow = fromKey(now).getDay();
  const offerClose = !closures[closeMonday] && (dow === 0 || dow === 6 || closeMonday < week.monday);
  const closing = useMemo(() => (offerClose ? weekReport(expenses, debts, overrides, closeMonday) : null), [offerClose, expenses, debts, overrides, closeMonday]);

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
  const todoFirst = closing ? `Закрыть неделю ${ddmm(closeMonday)}–${ddmm(addDays(closeMonday, 6))}` : todoAlerts[0]?.title ?? (pending[0] ? `Пауза 48 часов: ${pending[0].title}` : null);

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
              <button type="button" onClick={() => ui.set({ week: closeMonday })} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sea/12 text-sea"><PiggyBank size={17} strokeWidth={1.6} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] leading-snug font-medium">Закрыть неделю {ddmm(closeMonday)}–{ddmm(addDays(closeMonday, 6))}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                    Долить на карту жизни из резерва <Money value={closing.topUp} className="text-ink" />
                    {closing.leftover > 0 ? <>: остаток <Money value={closing.leftover} /> уже на ней</> : closing.left < 0 ? <>: перерасход <Money value={-closing.left} /></> : ''}. Сначала загрузите выписку.
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
    <div>
      <WeekScene today={(fromKey(now).getDay() + 6) % 7}>
        <div className="flex items-start justify-between gap-3 px-5 pt-2.5">
          <div style={{ color: 'var(--scene-ink)' }}>
            <div className="text-[14px] first-letter:uppercase" style={{ color: 'var(--scene-muted)' }}>{weekdayFull(now)}, {dayMonth(now)}</div>
            <div className="font-display mt-0.5 text-[19px] font-medium">Неделя {weekRange(week.monday, week.sunday)}</div>
          </div>
          <span className="pointer-events-auto"><SkyButton onClick={() => ui.set({ settings: true })} label="Настройки"><Cog size={18} strokeWidth={1.5} /></SkyButton></span>
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-3 pr-4 pl-5">
          <div className="pt-3" style={{ color: over ? 'var(--neg)' : 'var(--scene-ink)' }}>
            <div className="figure text-[36px] leading-[.95]" aria-live="polite">
              {over && <span className="mr-0.5">−</span>}<Money value={shown} />
            </div>
            <div className="mt-1.5 text-[14px] leading-snug" style={{ color: over ? 'var(--neg)' : 'var(--scene-muted)' }}>
              {over ? <>перерасход<br />за неделю</> : <>на неделю,<br />до воскресенья</>}
            </div>
          </div>
          <DayRing day={today.day} left={today.left} onClick={() => ui.set({ today: true })} />
        </div>
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

      <div className="mt-2 grid grid-cols-[1.4fr_1fr] gap-3 px-4">
        <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => ui.set({ add: {} })}
          className="flex h-[54px] items-center justify-center gap-2 rounded-[18px] bg-ink text-[15.5px] font-medium text-bg">
          <Plus size={19} strokeWidth={2} /> Записать трату
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => ui.set({ scan: true })}
          className="flex h-[54px] items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-ink text-[15px] font-medium">
          <FileUp size={18} strokeWidth={1.5} /> Выписка
        </motion.button>
      </div>

      <div className="mt-4 px-4">
        <CardStack cards={cards} open={open} onOpen={id => ui.set({ stackOpen: id ?? '' })} />
      </div>

      <button type="button" onClick={() => ui.setTab('plan')} className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-between gap-3 rounded-[20px] px-4 py-3 text-left text-[13px] text-muted">
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

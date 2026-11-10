// «Сегодня»: сцена с мостом, остаток недели и кольцо дня. Под сценой — быстрые траты, один следующий шаг, строка
// «Неделя», три сосуда «Где деньги» и плитки-входы «Траты» и «Долги». Плашка о перерасходе появляется при входе.
import { ChevronRight, MessagesSquare, Scale, ScanText, Settings as Cog } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EntryTiles, flyCoin, NextStep, QuickSpends, type Step } from '../components/Home';
import { DayRing } from '../components/DayRing';
import { Wallets } from '../components/Wallets';
import { WeekStrip } from '../components/WeekStrip';
import { bridgeControl, lampAt, setSceneHidden, SkyButton, WeekScene } from '../components/Petersburg';
import { haptic } from '../components/haptics';
import { Roll, spring } from '../components/motion';
import { QUICK_COLOR, runQuick } from '../components/TabBar';
import { CAT_COLOR, Money } from '../components/ui';
import { eventsBetween } from '../domain/calendar';
import { activeBridge, bridgeState, weekMoney } from '../domain/bridge';
import { addDays, dayMonth, ddmm, fromKey, monthKey, plural, weekday, weekdayFull, weekRange, weekStart } from '../domain/dates';
import { rub } from '../domain/money';
import { quickSpends, yesterdaySet, type QuickSpend } from '../domain/quick';
import { spendEffect, suggestSource } from '../domain/sources';
import { CATEGORY, currentPhase, phaseByDate, reserveNeed, totalDebt } from '../domain/plan';
import { alerts as buildAlerts, type Alert, countsWeekly, dayBudget, monthByCategory, weekSummary } from '../domain/summary';
import type { CalEvent } from '../domain/types';
import { weekReport, weekToClose } from '../domain/weekly';
import { useStore } from '../store/store';
import { toast, useCal, useToday, useUi, withUndo } from '../store/ui';
import { checkInbox, checkPlan } from './Sync';
import { useLedger } from './Checkup';

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
  const [expenses, debts, marks, wishes, settings, overrides, startTotal, closures, checklist, checks, toggleCheck, bridge, checkups] = useStore(useShallow(s => [
    s.expenses, s.debts, s.marks, s.wishes, s.settings, s.weeklyOverrides, s.planTrajectory[0]?.[1] ?? 0, s.closures, s.checklist, s.checks, s.toggleCheck, s.bridge, s.checkups,
  ] as const));
  // только нужное из состояния интерфейса: иначе весь экран перерисовывался бы при каждом переключении вкладки и листе
  const ui = { set: useUi(s => s.set), setTab: useUi(s => s.setTab), stackOpen: useUi(s => s.stackOpen) };
  const todayIdx = (fromKey(now).getDay() + 6) % 7;
  // сцена уходит медленнее страницы, сверху проявляется стеклянная полоса с остатком
  // без событий прокрутки (fixing-motion-performance): параллакс — CSS scroll-timeline (.sc-parallax),
  // полоса и пауза бесконечных анимаций — по видимости сцены (IntersectionObserver)
  const sceneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const pause = new IntersectionObserver(([e]) => { scene.classList.toggle('sc-paused', !e.isIntersecting); setSceneHidden(!e.isIntersecting); });
    pause.observe(scene);
    return () => pause.disconnect();
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
  const led = useLedger();
  const bridgeNow = useMemo(() => (activeBridge(bridge) ? bridgeState(expenses, bridge) : null), [expenses, bridge]);
  const bridgeCardName = `${debts.find(d => d.id === bridge?.card)?.short ?? 'кредитка'}-кредитка`.replace('кредитка-кредитка', 'кредитка');
  const phase = currentPhase(debts, now);
  const planPhase = phaseByDate(now);
  const list = useMemo(() => buildAlerts({ bridge, cal, marks, expenses, wishes, now, nowMs: Date.now(), lastBackupAt: settings.lastBackupAt, lastIcsAt: settings.lastIcsAt, checklist, checks }),
    [bridge, cal, marks, expenses, wishes, now, settings.lastBackupAt, settings.lastIcsAt, checklist, checks]);
  const pending = wishes.filter(w => !w.resolved);
  const debt = totalDebt(debts);
  const over = week.left < 0;
  const dayAlert = today.mode !== 'ok';
  const pill = useOverPill(today.left, dayAlert);
  const { need } = reserveNeed(now, debts);
  // в выходные и в начале недели — предложить закрыть неделю
  // неделя считается закрытой, когда сохранена сверка с банком (или закрыта по-старому)
  const done = useMemo(() => ({ ...closures, ...Object.fromEntries(checkups.map(c => [c.monday, c])) }) as typeof closures, [closures, checkups]);
  const closeMonday = weekToClose(now, done);
  const dow = fromKey(now).getDay();
  const offerClose = !done[closeMonday] && (dow === 0 || dow === 6 || closeMonday < week.monday);
  const closing = useMemo(() => (offerClose ? weekReport(expenses, debts, overrides, closeMonday, bridge) : null), [offerClose, expenses, debts, overrides, closeMonday, bridge]);

  const onAlert = (a: Alert) => {
    if (a.action === 'pay' || a.action === 'weekly') ui.set({ event: a.event ?? null });
    else if (a.action === 'income') ui.set({ bonus: { event: a.event } });
    else if (a.action === 'backup') ui.set({ settings: true, settingsFocus: 'backup' });
    else if (a.action === 'calendar') ui.set({ settings: true, settingsFocus: 'reminders' });
    else if (a.action === 'check') { ui.set({ planView: 'checklist', focus: a.id.replace(/^check:/, '') }); ui.setTab('plan'); }
    else if (a.id === 'credit') ui.setTab('budget');
  };

  const whenShort = (e: CalEvent) => `${weekday(e.date)} ${Number(e.date.slice(8))}`;

  // Следующий шаг: приложение само говорит, что сделать сейчас, — по одному. Сначала деньги (неотмеченные платежи
  // и поступления до сегодня), потом сверка, вечерняя проверка, дела и отложенные покупки. «Позже» — до перезапуска
  const [later, setLater] = useState<ReadonlySet<string>>(() => new Set());
  const hour = new Date().getHours();
  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [];
    const due = eventsBetween(cal, addDays(now, -45), now).filter(e => !marks[e.key]?.done);
    for (const e of due) {
      const old = e.date < now;
      if (e.kind === 'payment') {
        out.push({
          id: e.key, tone: 'out', kicker: old ? `Не отмечен платёж, ${ddmm(e.date)}` : 'Платёж сегодня', title: e.title,
          amount: <Money value={e.amount} approx={e.approx} />, text: old ? 'Оплатили — отметьте. Нет — оплатите сегодня: просрочка недопустима.' : undefined,
          primary: { label: 'Оплачено', run: () => ui.set({ event: e }) },
        });
      } else if (e.kind === 'income' && e.date >= addDays(now, -10)) {
        const bonus = list.some(a => a.action === 'income' && a.event?.key === e.key);
        out.push({
          id: e.key, tone: 'in', kicker: old ? `Ожидалось ${ddmm(e.date)}` : 'Поступление сегодня', title: e.title, amount: <Money value={e.amount} approx={e.approx} sign />,
          text: bonus ? 'Пришла? Распределите в тот же день: резерв по формуле, остальное в долг.' : undefined,
          primary: { label: 'Пришло', run: () => ui.set(bonus ? { bonus: { event: e } } : { event: e }) },
        });
      } else if (e.kind === 'weekly' && !closing && e.date >= addDays(now, -7)) {
        out.push({ id: e.key, tone: 'rsv', kicker: 'Пополнение карты из резерва', title: e.title, amount: <Money value={e.amount} />, primary: { label: 'Долито', run: () => ui.set({ event: e }) } });
      }
    }
    if (closing) {
      out.push({
        id: `close:${closeMonday}`, tone: 'rsv', kicker: 'Сверка с банком', title: `Закрыть неделю ${ddmm(closeMonday)}–${ddmm(addDays(closeMonday, 6))}`,
        text: <>Три вопроса: карта, резерв, кредитка. По учёту долить на карту <Money value={closing.topUp} className="text-ink" />.</>,
        primary: { label: 'Сверить', run: () => ui.set({ checkup: closeMonday }) },
      });
    }
    if (hour >= 19 && !expenses.some(e => e.date === now)) {
      out.push({
        id: `evening:${now}`, tone: 'calm', kicker: 'Вечер', title: 'Сегодня ничего не тратили?', text: 'Трат за сегодня нет. Если были — запишите, пока помните.',
        primary: { label: 'Да, ноль', run: () => setLater(l => new Set(l).add(`evening:${now}`)) }, secondary: { label: 'Записать', run: () => ui.set({ add: {} }) },
      });
    }
    for (const a of list) {
      if (a.action === 'pay' || a.action === 'income' || a.action === 'wish') continue;
      const check = a.action === 'check';
      out.push({
        id: a.id, tone: a.tone === 'danger' ? 'out' : 'todo', kicker: check ? 'Дело из чек-листа' : 'Внимание', title: a.title, text: a.text,
        primary: check ? { label: 'Сделано', run: () => toggleCheck(a.id.replace(/^check:/, '')) } : { label: 'Открыть', run: () => onAlert(a) },
        ...(check ? { secondary: { label: 'Открыть', run: () => onAlert(a) } } : {}),
      });
    }
    for (const w of pending) {
      out.push({
        id: `wish:${w.id}`, tone: 'todo', kicker: 'Пауза 48 часов', title: w.title, amount: <Money value={w.amount} />, text: 'Прошло время подумать. Всё ещё нужно?',
        primary: { label: 'Не нужно', run: () => useStore.getState().resolveWish(w.id, 'skipped') },
        secondary: { label: 'Купил', run: () => ui.set({ add: { amount: w.amount, category: w.category, note: w.title, wishId: w.id } }) },
      });
    }
    const todo = out.filter(x => !later.has(x.id));
    if (todo.length) return todo;
    // дел нет — спокойная карточка: что ближайшее впереди
    const soon = eventsBetween(cal, addDays(now, 1), addDays(now, 14)).find(e => !marks[e.key]?.done && e.kind !== 'weekly');
    return [{
      id: 'calm', calm: true, tone: 'calm', kicker: soon ? `${soon.kind === 'income' ? 'Ближайшее поступление' : 'Ближайший платёж'}, ${whenShort(soon)}` : 'Всё сделано',
      title: soon ? soon.title : 'Дел на сегодня нет', amount: soon ? <Money value={soon.amount} approx={soon.approx} sign={soon.kind === 'income'} /> : undefined,
      primary: { label: 'Что впереди', run: () => ui.setTab('payments') },
    }];
  }, [cal, marks, now, list, closing, closeMonday, hour, expenses, pending, later]);

  // кольцо крутят пальцем: «а если потрачу?» — что останется сегодня и какой станет норма завтра
  const [whatIf, setWhatIf] = useState<number | null>(null);
  const whatIfEffect = useMemo(() => spendEffect({ expenses, debts, weeklyOverrides: overrides, bridge }, { amount: whatIf ?? 0, source: 'life', date: now, now, reserve: led.reserve }),
    [expenses, debts, overrides, bridge, whatIf, now, led.reserve]);
  const whatIfTomorrow = whatIf && !today.nextWeek && today.morning - today.spentToday - whatIf > 0 ? Math.floor((today.morning - today.spentToday - whatIf) / (today.daysLeft - 1) / 10) * 10 : null;

  // быстрые траты: частое — одной кнопкой, «как вчера» — пока сегодня пусто. Источник приложение выбирает само
  const quick = useMemo(() => quickSpends(expenses, now), [expenses, now]);
  const ySet = useMemo(() => (expenses.some(e => e.date === now) ? [] : yesterdaySet(expenses, now)), [expenses, now]);
  const spendQuick = (q: QuickSpend, el: Element) => {
    const st = useStore.getState();
    const source = suggestSource(st, now);
    const effect = spendEffect(st, { amount: q.amount, source, date: now, now, reserve: led.reserve });
    withUndo(`${q.note ?? CATEGORY[q.category].short}, ${rub(q.amount)}. ${effect.text}`, () => st.addExpenses([{ date: now, amount: q.amount, category: q.category, note: q.note, source, origin: 'manual' }]));
    haptic('success');
    flyCoin(el, CAT_COLOR[q.category]);
  };
  const repeatYesterday = (el: Element) => {
    const st = useStore.getState();
    withUndo(`Как вчера: ${ySet.length} ${plural(ySet.length, 'трата', 'траты', 'трат')} на ${rub(ySet.reduce((t, e) => t + e.amount, 0))}`,
      () => st.addExpenses(ySet.map(e => ({ date: now, amount: e.amount, category: e.category, note: e.note, source: e.source, origin: 'manual' as const, ...(e.creditCard ? { creditCard: e.creditCard } : {}) }))));
    haptic('success');
    flyCoin(el);
  };
  // плитки-входы на месте прежних вкладок «Траты» и «Долги»
  const monthRows = useMemo(() => monthByCategory(expenses, debts, monthKey(now)), [expenses, debts, now]);
  const monthSpent = monthRows.reduce((t, r) => t + r.spent, 0), monthLimit = monthRows.reduce((t, r) => t + r.limit, 0);
  const monthShares = monthRows.filter(r => r.spent > 0).sort((a, b) => b.spent - a.spent).map(r => ({ id: r.id, share: r.spent / Math.max(monthLimit, monthSpent, 1) }));

  return (
    <div className="relative">
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
            {/* сколько на самом деле на карте (по учёту): остаток не сгорает, а уменьшает воскресное пополнение. При перерасходе
                через кредитку моста на карте может остаться плюс — это нормально */}
          </div>
          <DayRing day={today.day} canSpend={today.canSpend} mode={today.mode} overDay={today.overDay} nextWeek={today.nextWeek} onClick={() => ui.set({ today: true })}
            scrubMax={Math.max(1000, Math.ceil(Math.max(today.day * 2.5, 0) / 500) * 500)} onScrub={setWhatIf} onCommit={amount => ui.set({ add: { amount } })} />
        </div>
        {money.creditCap > 0 && !over && money.cardLeft <= 0 && money.creditLeft > 0 && !pill.phase && (
          <p className="sc-pop mx-5 mt-3 rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-snug backdrop-blur-md"
            style={{ background: 'var(--pill)', borderColor: 'var(--pill-border)', color: 'var(--scene-ink)' }}>
            Карта пуста — дальше {bridgeCardName}, доступно <Money value={money.creditLeft} /> до воскресенья. Только покупки картой.
          </p>
        )}
        {whatIf != null && (
          <p className="mx-5 mt-3 rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-snug font-medium backdrop-blur-md" aria-live="polite"
            style={{ background: 'var(--pill)', borderColor: 'var(--pill-border)', color: whatIfEffect.tone === 'neg' ? 'var(--ring-neg)' : 'var(--scene-ink)' }}>
            {whatIf > 0 ? <>Если потратить <Money value={whatIf} />: {whatIfEffect.text.replace(/^./, c => c.toLowerCase())}{whatIfTomorrow != null && <>, завтра норма <Money value={whatIfTomorrow} /></>}. Отпустите — записать</> : 'Ведите палец по кольцу — сумма растёт'}
          </p>
        )}
        {pill.phase && whatIf == null && (
          <button key={pill.key} type="button" onClick={pill.hide} aria-label="Скрыть"
            className={`pointer-events-auto relative mx-5 mt-3 block w-[calc(100%-2.5rem)] overflow-hidden rounded-2xl border px-3.5 pt-2.5 pb-3.5 text-left text-[14px] leading-snug shadow-lg backdrop-blur-md ${pill.phase === 'out' ? 'sc-pill-out' : 'sc-pill-in'}`}
            style={{ background: 'var(--pill)', borderColor: 'var(--pill-border)', color: 'var(--scene-ink)' }}>
            {today.mode === 'week' ? (
              <><span className="font-medium" style={{ color: 'var(--ring-neg)' }}>Лимит недели исчерпан{today.weekLeft < 0 && <>, перерасход <Money value={-today.weekLeft} /></>}.</span>{' '}
                {today.nextWeek ? 'Сегодня тратить больше нельзя, с понедельника новая неделя' : 'До воскресенья тратить нельзя'}</>
            ) : today.nextWeek ? (
              <><span className="font-medium" style={{ color: 'var(--ring-neg)' }}>Сегодня сверх нормы <Money value={today.overDay} />.</span> С понедельника новая неделя: <Money value={today.tomorrow} /> в день</>
            ) : (
              <><span className="font-medium" style={{ color: 'var(--ring-neg)' }}>Сегодня сверх нормы <Money value={today.overDay} />,</span> поэтому с завтра лимит <Money value={today.tomorrow} /> в день</>
            )}
            {pill.phase === 'in' && <span className="sc-pill-timer absolute inset-x-3.5 bottom-1.5 h-[2px] rounded-full opacity-70" style={{ background: 'var(--ring-neg)' }} />}
          </button>
        )}
      </WeekScene>
      </div>
      </div>

      {/* частые траты одной кнопкой — сразу под сценой */}
      <div className="relative z-[1] -mt-1 bg-bg pt-2.5">
        <QuickSpends items={quick} yesterday={ySet.length ? { count: ySet.length, sum: ySet.reduce((t, e) => t + e.amount, 0) } : null} onSpend={spendQuick} onYesterday={repeatYesterday} />
      </div>

      {/* следующий шаг: одно дело за раз */}
      <div className="relative z-[1] bg-bg px-4 pt-2.5">
        <NextStep steps={steps} onLater={id => setLater(l => new Set(l).add(id))} />
      </div>

      {/* строка «Неделя»: свои, в долг по мосту и сверх лимита — раскладка во всю ширину, сцена остаётся чистой */}
      <div className="relative z-[1] bg-bg px-4 pt-2.5">
        <WeekStrip money={money} onOpen={() => ui.set({ week: week.monday })} />
      </div>

      {/* где деньги: свои на карте, взятое в долг и резерв — три сосуда */}
      <div className="relative z-[1] bg-bg px-4 pt-2">
        <Wallets card={led.card} weekLimit={week.limit} loan={bridgeNow} reserve={led.reserve} need={need}
          onCard={() => ui.set({ card: true })} onLoan={() => ui.set({ loan: true })} onReserve={() => ui.set({ reserve: true })} />
      </div>

      {/* «Траты» и «Долги» — плитки на месте прежних вкладок: внутри те же экраны целиком */}
      <div className="relative z-[1] bg-bg px-4 pt-2">
        <EntryTiles spent={monthSpent} limit={monthLimit} shares={monthShares} debt={debt} melted={Math.max(0, startTotal - debt)}
          onSpend={() => ui.setTab('budget')} onDebts={() => ui.setTab('plan')} />
      </div>

      {/* действия с данными: вставить из банка, сверка, чат */}
      <div className="relative z-[1] grid grid-cols-3 gap-2 bg-bg px-4 pt-2">
        {([
          ['scan', 'Из банка', ScanText],
          ['checkup', 'Сверка', Scale],
          ['sync', 'Чат', MessagesSquare],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => runQuick(id)}
            className="flex h-[52px] items-center justify-center gap-2 rounded-[18px] bg-surface text-[13px] font-medium shadow-[0_1px_2px_rgba(10,36,51,.06),0_10px_24px_-18px_rgba(10,36,51,.45)] transition-transform duration-100 active:scale-[.95]">
            <span className="dot-tile size-8" style={{ '--c': QUICK_COLOR[id] } as CSSProperties}><Icon size={17} strokeWidth={1.9} /></span>{label}
          </button>
        ))}
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

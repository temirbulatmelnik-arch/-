// «Сегодня»: сцена с мостом, остаток недели и кольцо дня. Под сценой — быстрые траты, один следующий шаг, строка
// «Неделя», три сосуда «Где деньги» и плитки-входы «Траты» и «Долги». Плашка о перерасходе появляется при входе.
import { Settings as Cog } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { flyCoin, NextStep, QuickSpends, type Step } from '../components/Home';
import { DayRing } from '../components/DayRing';
import { Wallets } from '../components/Wallets';
import { bridgeControl, lampAt, setSceneHidden, SkyButton, WeekScene } from '../components/Petersburg';
import { useCoverage, useDailyLiquidityCap } from '../components/Coverage';
import { haptic } from '../components/haptics';
import { Roll, spring } from '../components/motion';
import { CAT_COLOR, Money } from '../components/ui';
import { rubles, weeklyExpenseCents } from '../domain/accounts';
import { cashIncomeEvent, eventsBetween } from '../domain/calendar';
import { activeBridge, bridgeState } from '../domain/bridge';
import { addDays, dayMonth, ddmm, fromKey, plural, weekdayFull, weekRange } from '../domain/dates';
import { DEFAULT_PREPARATION_TIME, paymentPreparations, preparationDue, weeklyTopUp } from '../domain/funds';
import { rub } from '../domain/money';
import { quickSpends, yesterdaySet, type QuickSpend } from '../domain/quick';
import { DEFAULT_SPEND_SOURCE, spendEffect } from '../domain/sources';
import { CATEGORY } from '../domain/plan';
import { availableToday, dayBudget, weekSummary } from '../domain/summary';
import { weekReport, weekToClose } from '../domain/weekly';
import { useStore } from '../store/store';
import { toast, useBudgetExpenses, useCal, useMoscowClock, useToday, useUi, withUndo } from '../store/ui';
import { checkInbox, checkPlan } from './Sync';
import { useLedger } from './Checkup';

export function Week() {
  const now = useToday();
  const cal = useCal();
  const [debts, marks, overrides, closures, bridge, checkups] = useStore(useShallow(s => [
    s.debts, s.marks, s.weeklyOverrides, s.closures, s.bridge, s.checkups,
  ] as const));
  const expenses = useBudgetExpenses();
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
  const led = useLedger();
  const { cov } = useCoverage('cautious');
  const liquidityCap = useDailyLiquidityCap();
  const bridgeNow = useMemo(() => (activeBridge(bridge) ? bridgeState(expenses, bridge) : null), [expenses, bridge]);
  const over = week.left < 0;
  // в выходные и в начале недели — предложить закрыть неделю
  // неделя считается закрытой, когда сохранена сверка с банком (или закрыта по-старому)
  const done = useMemo(() => ({ ...closures, ...Object.fromEntries(checkups.map(c => [c.monday, c])) }) as typeof closures, [closures, checkups]);
  const closeMonday = weekToClose(now, done);
  const dow = fromKey(now).getDay();
  const offerClose = !done[closeMonday] && (dow === 0 || dow === 6 || closeMonday < week.monday);
  const closing = useMemo(() => (offerClose ? weekReport(expenses, debts, overrides, closeMonday, bridge) : null), [offerClose, expenses, debts, overrides, closeMonday, bridge]);

  const [later, setLater] = useState<ReadonlySet<string>>(() => new Set());
  const clock = useMoscowClock();
  const preparationTime = DEFAULT_PREPARATION_TIME;
  const planned = useMemo(() => eventsBetween(cal, addDays(clock.date, -14), addDays(clock.date, 45)), [cal, clock.date]);
  const groups = paymentPreparations(planned, marks, led.heldForPayments, led.reserve);
  const nextIncome = planned.find(e => e.date >= clock.date && cashIncomeEvent(e) && !e.projection && !marks[e.key]?.done && !e.payroll?.bankConfirmed);
  const steps: Step[] = [];
  const near = groups.filter(group => group.date >= clock.date).slice(0, 3);
  const incomeToSweep = Object.entries(led.pendingSweepToReserve).find(([, value]) => value > 0);
  if (incomeToSweep) {
    const [accountId, amount] = incomeToSweep;
    steps.push({ id: `sweep:${accountId}`, tone: 'rsv', kicker: 'На карте', title: 'Перевести в резерв',
      amount: <Money value={amount} kopecks />,
      primary: { label: 'Открыть перевод', run: () => ui.set({ transfer: { kind: 'sweep', accountId, amount } }) } });
  }
  if (closing && clock.date === addDays(closeMonday, 6) && clock.time >= preparationTime && !marks[`wk:${addDays(closeMonday, 7)}`]?.done) {
    const topUp = led.lifeAvailable == null ? null : weeklyTopUp(closing.nextLimit, led.lifeAvailable);
    steps.push({ id: `weekly:${closeMonday}`, tone: 'rsv', kicker: `${ddmm(addDays(closeMonday, 6))} · Воскресенье вечером`,
      title: 'Пополнить новую неделю', amount: topUp != null ? <Money value={topUp} kopecks /> : undefined,
      text: topUp == null ? 'Сверьте остаток на основной карте.' : <>Из резерва на основную карту. Лимит <Money value={closing.nextLimit} />.
        {topUp > led.reserve && <> Не хватает <Money value={topUp - led.reserve} kopecks />.</>}</>,
      primary: { label: 'Проверить остаток', run: () => ui.set({ checkup: closeMonday }) },
      secondary: topUp ? { label: 'Перевёл', run: () => ui.set({ week: closeMonday }) } : undefined,
    });
  }
  const visibleSteps = steps.filter(step => !later.has(step.id));

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
    const source = DEFAULT_SPEND_SOURCE;
    const effect = spendEffect({ ...st, expenses }, { amount: q.amount, source, date: now, now, reserve: led.reserve });
    withUndo(`${q.note ?? CATEGORY[q.category].short}, ${rub(q.amount)}. ${effect.text}`, () => st.addExpenses([{ date: now, amount: q.amount, category: q.category, note: q.note, source, origin: 'manual' }]));
    haptic('success');
    flyCoin(el, CAT_COLOR[q.category]);
  };
  const repeatYesterday = (el: Element) => {
    const st = useStore.getState();
    withUndo(`Как вчера: ${ySet.length} ${plural(ySet.length, 'трата', 'траты', 'трат')} на ${rub(ySet.reduce((t, e) => t + e.amount, 0))}`,
      () => st.addExpenses(ySet.map(e => ({ date: now, amount: e.amount, category: e.category, note: e.note, source: e.source, origin: 'manual' as const, creditCard: e.creditCard, accountId: e.accountId }))));
    haptic('success');
    flyCoin(el);
  };
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
        <div className="flex items-start justify-between gap-2 px-[clamp(0.75rem,5cqw,1.25rem)] pt-2.5">
          <div style={{ color: 'var(--scene-ink)' }}>
            <div className="text-sm first-letter:uppercase" style={{ color: 'var(--scene-muted)' }}>{weekdayFull(now)}, {dayMonth(now)}</div>
            <div className="font-display mt-0.5 text-[1.1875rem] font-medium">Неделя {weekRange(week.monday, week.sunday)}</div>
          </div>
          <span className="pointer-events-auto flex gap-2"><SkyButton onClick={() => ui.set({ settings: true })} label="Настройки"><Cog size={18} strokeWidth={1.5} /></SkyButton></span>
        </div>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-[clamp(0.75rem,5cqw,1.25rem)]">
          <div className="min-w-0" style={{ color: over ? 'var(--neg)' : 'var(--scene-ink)' }}>
            <div className="figure [overflow-wrap:anywhere] text-[clamp(1.3rem,9cqw,2.5rem)] leading-[1.06]" aria-live="polite">
              {over && <span className="mr-0.5">−</span>}<Roll value={Math.abs(week.left)} />
            </div>
            <div className="mt-1.5 text-sm leading-snug" style={{ color: over ? 'var(--neg)' : 'var(--scene-muted)' }}>
              {over ? <>по бюджету<br />за неделю</> : <>по бюджету<br />до воскресенья</>}
            </div>
            {/* сколько на самом деле на карте (по учёту): остаток не сгорает, а уменьшает воскресное пополнение. При перерасходе
                через кредитку моста на карте может остаться плюс — это нормально */}
          </div>
          <DayRing day={today.day} canSpend={availableToday(today, led.lifeAvailable, liquidityCap)} mode={today.mode} overDay={today.overDay} nextWeek={today.nextWeek} onClick={() => ui.set({ today: true })}
            scrubMax={Math.max(1000, Math.ceil(Math.max(today.day * 2.5, 0) / 500) * 500)} onScrub={setWhatIf} onCommit={amount => ui.set({ add: { amount } })} />
        </div>
        {whatIf != null && (
          <p className="mx-5 mt-3 rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-snug font-medium backdrop-blur-md" aria-live="polite"
            style={{ background: 'var(--pill)', borderColor: 'var(--pill-border)', color: whatIfEffect.tone === 'neg' ? 'var(--ring-neg)' : 'var(--scene-ink)' }}>
            {whatIf > 0 ? <>Если потратить <Money value={whatIf} />: {whatIfEffect.text.replace(/^./, c => c.toLowerCase())}{whatIfTomorrow != null && <>, завтра норма <Money value={whatIfTomorrow} /></>}. Отпустите — записать</> : 'Ведите палец по кольцу — сумма растёт'}
          </p>
        )}
      </WeekScene>
      </div>
      </div>

      <div className="relative z-[1] space-y-2 bg-bg px-4 pt-2">
        <Wallets card={led.lifeAvailable} weekLimit={week.limit} loan={bridgeNow} reserve={led.reserve}
          onCard={() => ui.set({ card: true })} onLoan={() => ui.set({ loan: true })} onReserve={() => ui.set({ reserve: true })} />
        <button className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface px-3 py-2 text-left text-[13px]" type="button" onClick={() => ui.set({ week: week.monday })}>
          <span>Лимит <Money value={week.limit} kopecks /></span><span>Потрачено <Money value={week.spent} kopecks /></span>
        </button>
        {near.length > 0 && <section aria-label="Ближайшие обязательства">
          {near.map(group => {
            const due = preparationDue(group, clock, preparationTime);
            const ready = group.prepared >= group.total && !group.inTransit;
            return <button key={group.id} type="button" className="card mb-1 flex min-h-11 w-full items-center justify-between gap-2 p-3 text-left"
              onClick={() => group.toFund && due ? ui.set({ transfer: { kind: 'payment', plan: group } })
                : group.events.length === 1 ? ui.set({ event: group.events[0] }) : ui.set({ paymentQueue: true })}>
              <span className="min-w-0"><span className="block text-[12px] text-muted">{ddmm(group.date)} · {ready ? '✓ Обеспечено' : group.accountId ? 'Нужны деньги' : 'Нужна сверка'}</span>
                <span className="block font-medium">{group.events.length === 1 ? group.events[0].title : `Платежей ${group.events.length}`}</span>
              </span><Money value={group.total} approx={group.events.some(e => e.approx)} kopecks className="shrink-0" />
            </button>;
          })}
        </section>}
        {visibleSteps.length > 0 && <section aria-label="Следующее действие">
          <NextStep steps={visibleSteps} onLater={id => setLater(prev => new Set([...prev, id]))} />
        </section>}
        {visibleSteps.length === 0 && cov.shortage && <button type="button" onClick={() => { ui.set({ payView: 'cover' }); ui.setTab('payments'); }}
          className="min-h-11 w-full rounded-xl bg-warn/10 px-3 text-left text-[13px] text-warn">
          {ddmm(cov.shortage.date)} возможна нехватка <Money value={cov.shortage.amount} kopecks />
        </button>}
        {nextIncome && !incomeToSweep && <button type="button" className="card flex min-h-11 w-full items-center justify-between gap-2 p-3 text-left"
          onClick={() => ui.set({ workSheet: true })}>
          <span className="min-w-0"><span className="block text-[12px] text-muted">Ожидается поступление</span>
            <span className="block font-medium">{ddmm(nextIncome.date)} · {nextIncome.title}</span></span>
          <Money value={nextIncome.amount} approx className="shrink-0" />
        </button>}
        <button type="button" className="min-h-11 text-[13px] text-sea" onClick={() => ui.setTab('payments')}>Открыть календарь</button>
      </div>
      <section className="relative z-[1] bg-bg px-4 pt-3">
        <button className="card flex min-h-11 w-full items-center justify-between gap-2 p-3 text-left text-[14px]" type="button" onClick={() => ui.set({ today: true })}>
          <span>Сегодня потрачено</span><Money value={today.spentToday} kopecks />
        </button>
        {(quick.length > 0 || ySet.length > 0) && <details className="mt-2 text-[13px]">
          <summary className="min-h-11 px-2 py-3 text-sea">Быстрые траты</summary>
          <QuickSpends items={quick} yesterday={ySet.length ? { count: ySet.length, sum: ySet.reduce((t, e) => t + e.amount, 0) } : null} onSpend={spendQuick} onYesterday={repeatYesterday} />
        </details>}
      </section>

    </div>
  );
}

/** Фонари набережной — дни недели. Нажмите на фонарь или ведите пальцем вдоль набережной — подпись следует за пальцем */
function Lamps({ monday, todayIdx, limit, dayNorm }: { monday: string; todayIdx: number; limit: number; dayNorm: number }) {
  const expenses = useBudgetExpenses();
  const [open, setOpen] = useState<number | null>(null);
  const [scrub, setScrub] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const spent = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = addDays(monday, i);
    return rubles(expenses.filter(e => e.date === d).reduce((sum, e) => sum + weeklyExpenseCents(e), 0));
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

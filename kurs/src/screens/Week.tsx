// «Сегодня»: мост, остаток недели, кольцо дня и сводка ближайших денежных событий.
import { Settings as Cog } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { flyCoin, NextStep, QuickSpends, type Step } from '../components/Home';
import { DayRing } from '../components/DayRing';
import { horizonUnverified } from '../domain/financialView';
import { TodayOverview } from '../components/TodayOverview';
import { bridgeControl, lampAt, setSceneHidden, SkyButton, WeekScene } from '../components/Petersburg';
import { useCoverage } from '../components/Coverage';
import { haptic } from '../components/haptics';
import { Roll } from '../components/motion';
import { CAT_COLOR, Money, PrimaryButton, Sheet } from '../components/ui';
import { rubles, weeklyExpenseCents } from '../domain/accounts';
import { eventsBetween } from '../domain/calendar';
import { positionBeforeIncome } from '../domain/coverage';
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
import { reserveAnchor } from '../domain/ledger';

export function Week() {
  const now = useToday();
  const cal = useCal();
  const [debts, marks, overrides, closures, bridge, checkups] = useStore(useShallow(s => [
    s.debts, s.marks, s.weeklyOverrides, s.closures, s.bridge, s.checkups,
  ] as const));
  const expenses = useBudgetExpenses();
  // только нужное из состояния интерфейса: иначе весь экран перерисовывался бы при каждом переключении вкладки и листе
  const ui = { set: useUi(s => s.set), setTab: useUi(s => s.setTab) };
  const todayIdx = (fromKey(now).getDay() + 6) % 7;
  // сцена уходит медленнее страницы, сверху проявляется стеклянная полоса с остатком
  // без событий прокрутки (fixing-motion-performance): параллакс — CSS scroll-timeline (.sc-parallax),
  // полоса и пауза бесконечных анимаций — по видимости сцены (IntersectionObserver)
  const sceneRef = useRef<HTMLDivElement>(null);
  const [scenePassed, setScenePassed] = useState(false);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const pause = new IntersectionObserver(([e]) => { scene.classList.toggle('sc-paused', !e.isIntersecting); setSceneHidden(!e.isIntersecting); setScenePassed(!e.isIntersecting && e.boundingClientRect.bottom <= 0); });
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
  const { input, cov } = useCoverage();
  const scenario = useUi(s => s.scenario);
  const reserveDate = useStore(s => reserveAnchor(s.reserveLog)?.date ?? s.checkups.at(-1)?.date);
  const provisional = horizonUnverified(input);
  const horizon = useMemo(() => positionBeforeIncome(input, now), [input, now]);
  const displayAvailable = provisional ? today.canSpend : availableToday(today, led.lifeAvailable, horizon.available);
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
  const steps: Step[] = [];
  const nextBill = groups.find(group => group.date >= clock.date);
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
  const whatIfEffect = useMemo(() => spendEffect({ expenses, debts, weeklyOverrides: overrides, bridge }, { amount: whatIf ?? 0, source: 'life', date: now, now, reserve: led.reserve, lifeAvailable: led.lifeAvailable, liquidityCap: horizon.available, budgetOnly: provisional }),
    [expenses, debts, overrides, bridge, whatIf, now, led.reserve, led.lifeAvailable, horizon.available, provisional]);
  const whatIfTomorrow = whatIf && !today.nextWeek && today.morning - today.spentToday - whatIf > 0 ? Math.floor((today.morning - today.spentToday - whatIf) / (today.daysLeft - 1) / 10) * 10 : null;

  // быстрые траты: частое — одной кнопкой, «как вчера» — пока сегодня пусто. Источник приложение выбирает само
  const [confirmation, confirm] = useState<{ quick?: QuickSpend; anchor: Element } | null>(null);
  const quickSaving = useRef(false);
  const quick = useMemo(() => quickSpends(expenses, now).slice(0, 3), [expenses, now]);
  const ySet = useMemo(() => (expenses.some(e => e.date === now) ? [] : yesterdaySet(expenses, now)), [expenses, now]);
  const spendQuick = (q: QuickSpend, el: Element) => {
    const st = useStore.getState();
    const source = DEFAULT_SPEND_SOURCE;
    const effect = spendEffect({ ...st, expenses }, { amount: q.amount, source, date: now, now, reserve: led.reserve, lifeAvailable: led.lifeAvailable, liquidityCap: horizon.available, budgetOnly: provisional });
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
          <button type="button" data-nopull onClick={() => ui.set({ week: week.monday })} aria-label="Открыть бюджет недели"
            className="pointer-events-auto min-h-11 min-w-0 text-left" style={{ color: over ? 'var(--neg)' : 'var(--scene-ink)' }}>
            <div className="figure [overflow-wrap:anywhere] text-[clamp(1.3rem,9cqw,2.5rem)] leading-[1.06]" aria-live="polite">
              {over && <span className="mr-0.5">−</span>}<Roll value={Math.abs(week.left)} />
            </div>
            <div className="mt-1.5 text-sm leading-snug" style={{ color: over ? 'var(--neg)' : 'var(--scene-muted)' }}>
              {over ? <>по бюджету<br />за неделю</> : <>по бюджету<br />до воскресенья</>}
            </div>
            {/* сколько на самом деле на карте (по учёту): остаток не сгорает, а уменьшает воскресное пополнение. При перерасходе
                через кредитку моста на карте может остаться плюс — это нормально */}
          </button>
          <DayRing day={today.day} provisional={provisional} canSpend={displayAvailable} mode={today.mode} overDay={today.overDay} nextWeek={today.nextWeek} onClick={() => ui.set({ today: true })}
            scrubMax={Math.max(1000, Math.ceil(Math.max(today.day * 2.5, 0) / 500) * 500)} onScrub={setWhatIf} onCommit={amount => ui.set({ add: { amount } })} />
        </div>
        {whatIf != null && (
          <p className="mx-5 mt-3 rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-snug font-medium backdrop-blur-md" aria-live="polite"
            style={{ background: 'var(--pill)', borderColor: 'var(--pill-border)', color: whatIfEffect.tone === 'neg' ? 'var(--ring-neg)' : 'var(--scene-ink)' }}>
            {whatIf > 0 ? <>Если потратить <Money value={whatIf} />: {whatIfEffect.text.replace(/^./, c => c.toLowerCase())}{whatIfTomorrow != null && <>, завтра норма <Money value={whatIfTomorrow} /></>}. Отпустите, чтобы открыть форму расхода</> : 'Ведите палец по кольцу — сумма растёт'}
          </p>
        )}
      </WeekScene>
      </div>
      </div>

      <div className="rc-today-sticky sticky top-[env(safe-area-inset-top)] z-20 bg-bg px-4" hidden={!scenePassed}>
        <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-line px-1 text-left text-[13px]" onClick={() => ui.set({ today: true })}>
          <span>{provisional ? 'Остаток по бюджету' : 'Можно сегодня'}</span><Money value={displayAvailable} kopecks />
        </button>
      </div>
      <div className="relative z-[1] space-y-3 bg-bg px-4 pt-3">
        <TodayOverview cash={led} reserveDate={reserveDate} payment={nextBill} horizon={horizon}
          cov={cov} scenario={scenario} provisional={provisional}
          onAccounts={() => ui.set({ finance: true })}
          onCard={() => ui.set({ card: true })}
          onReserve={() => ui.set({ reserve: true })}
          onPayment={() => {
            if (nextBill?.toFund && preparationDue(nextBill, clock, preparationTime)) ui.set({ transfer: { kind: 'payment', plan: nextBill } });
            else if (nextBill?.events.length === 1) ui.set({ event: nextBill.events[0] });
            else ui.set({ paymentQueue: true });
          }}
          onForecast={() => { ui.setTab('payments'); ui.set({ payView: 'cover' }); }}>
          {visibleSteps.length > 0 && <NextStep steps={visibleSteps.slice(0, 1)} onLater={id => setLater(prev => new Set([...prev, id]))} />}
        </TodayOverview>
        {(quick.length > 0 || ySet.length > 0) && <section aria-label="Быстрые траты" className="-mx-4">
          <QuickSpends items={quick} yesterday={ySet.length ? { count: ySet.length, sum: ySet.reduce((t, e) => t + e.amount, 0) } : null}
            onSpend={(quick, anchor) => { quickSaving.current = false; confirm({ quick, anchor }); }}
            onYesterday={anchor => { quickSaving.current = false; confirm({ anchor }); }} />
        </section>}
      </div>
      <Sheet open={!!confirmation} onClose={() => confirm(null)} title={confirmation?.quick ? 'Быстрая трата' : 'Повторить вчерашние траты'} compact>
        {confirmation && <div className="space-y-3 pb-3">
          {confirmation.quick ? <p>Карта жизни · {confirmation.quick.note ?? CATEGORY[confirmation.quick.category].short} <Money value={confirmation.quick.amount} kopecks /></p>
            : <ul className="divide-y divide-line">{ySet.map(row => <li key={row.id} className="flex min-h-10 items-center justify-between gap-2 text-sm">
              <span>{row.note ?? CATEGORY[row.category].short}</span><Money value={row.amount} kopecks />
            </li>)}</ul>}
          <PrimaryButton onClick={() => {
            if (quickSaving.current) return;
            quickSaving.current = true;
            if (confirmation.quick) spendQuick(confirmation.quick, confirmation.anchor);
            else repeatYesterday(confirmation.anchor);
            confirm(null);
          }}>Записать <Money value={confirmation.quick?.amount ?? ySet.reduce((sum, row) => sum + row.amount, 0)} kopecks /></PrimaryButton>
        </div>}
      </Sheet>

    </div>
  );
}

/** Фонарь открывает полный расчёт выбранного дня с тем же недельным бюджетом. */
function Lamps({ monday, todayIdx, limit, dayNorm }: { monday: string; todayIdx: number; limit: number; dayNorm: number }) {
  const expenses = useBudgetExpenses();
  const [open, setOpen] = useState<number | null>(null);
  const spent = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return rubles(expenses.filter(row => row.date === date).reduce((sum, row) => sum + weeklyExpenseCents(row), 0));
  }), [expenses, monday]);
  const date = addDays(monday, open ?? 0);
  const guide = todayIdx === open ? dayNorm : limit / 7;
  return <>
    <div data-nopull className="pointer-events-none absolute inset-x-0 h-11" style={{ top: 'calc(' + lampAt(0).y * 100 + '% - 21px)' }}>
      {spent.map((amount, i) => <button key={i} type="button" className="pointer-events-auto absolute h-11 w-[min(44px,13%)] -translate-x-1/2 rounded-lg focus-visible:outline-2 focus-visible:outline-white"
        style={{ left: lampAt(i).x * 100 + '%' }} aria-label={weekdayFull(addDays(monday, i)) + ' · ' + (i > todayIdx ? 'впереди' : 'потрачено ' + rub(amount))}
        onClick={() => { setOpen(i); haptic(); }} />)}
    </div>
    {open != null && createPortal(<Sheet title={dayMonth(date)} subtitle={weekdayFull(date)} compact open onClose={() => setOpen(null)}>
      <dl className="space-y-3 pb-3 text-sm">
        <div className="flex justify-between"><dt>Расходы по недельному бюджету</dt><dd><Money value={spent[open]} kopecks /></dd></div>
        <div className="flex justify-between"><dt>{todayIdx === open ? 'Ориентир дня' : 'Средний ориентир недели'}</dt><dd><Money value={guide} kopecks /></dd></div>
        {open <= todayIdx && <div className="flex justify-between"><dt>{spent[open] > guide ? 'Сверх ориентира' : 'До ориентира'}</dt><dd><Money value={Math.abs(guide - spent[open])} kopecks /></dd></div>}
      </dl>
    </Sheet>, document.body)}
  </>;
}

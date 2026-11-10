import { MotionConfig } from 'motion/react';
import { startTransition, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Island } from './components/Island';
import { Salute } from './components/Salute';
import { TABS, TabBar } from './components/TabBar';
import { Toast } from './components/ui';
import { CardSheet, SavingsSheet } from './screens/Accounts';
import { LoanSheet } from './screens/LoanSheet';
import { AddExpenseSheet } from './screens/AddExpense';
import { BonusSheet } from './screens/BonusSheet';
import { Budget } from './screens/Budget';
import { CheckupSheet, useSundayCheckup } from './screens/Checkup';
import { DebtSheet } from './screens/DebtSheet';
import { EventSheet } from './screens/EventSheet';
import { FixedSheet } from './screens/FixedSheet';
import { HubSheet } from './screens/Hub';
import { ImportSheet } from './screens/Import';
import { Onboarding } from './screens/Onboarding';
import { Payments } from './screens/Payments';
import { Plan } from './screens/Plan';
import { updateBadge } from './screens/reminders';
import { ReserveSheet } from './screens/ReserveSheet';
import { SettingsSheet } from './screens/Settings';
import { SyncSheet, UnlockSheet, useInbox, usePlanUpdates } from './screens/Sync';
import { TodaySheet } from './screens/TodaySheet';
import { Tour, TOUR_VERSION } from './screens/Tour';
import { Week } from './screens/Week';
import { WeekSheet } from './screens/WeekSheet';
import { cleanedTwins, useStore } from './store/store';
import { toast as showToast, useUi, type Tab } from './store/ui';

function useTheme() {
  const theme = useStore(s => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      // цвет верха неба: строка состояния сливается с закатом в шапке
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#28335e' : '#8a9fbe');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

const ORDER: Tab[] = TABS.map(t => t.id);
const SCREENS: Record<Tab, ReactNode> = { week: <Week />, payments: <Payments />, budget: <Budget />, plan: <Plan /> };
/** Все листы — один постоянный элемент: при смене вкладки или тоста оболочка их не перерисовывает,
 *  каждый лист сам следит за своим кусочком состояния */
const SHEETS = (
  <>
    <CheckupSheet />
    <AddExpenseSheet />
    <ImportSheet />
    <EventSheet />
    <BonusSheet />
    <DebtSheet />
    <ReserveSheet />
    <SettingsSheet />
    <WeekSheet />
    <TodaySheet />
    <SavingsSheet />
    <CardSheet />
    <LoanSheet />
    <FixedSheet />
    <SyncSheet />
    <UnlockSheet />
    <HubSheet />
    <Tour />
  </>
);

/** Какие вкладки уже собраны. Открытая — сразу; остальные — по одной в фоне после первого кадра, низким приоритетом
 *  (startTransition: сборка уступает касаниям и кадрам анимации). Дальше вкладки не разбираются.
 *  React Activity здесь не подходит: при каждом показе он заново запускает все эффекты вкладки, и замер показал
 *  вдвое более долгое переключение */
function useMountedTabs(tab: Tab, ready: boolean): ReadonlySet<Tab> {
  const [mounted, setMounted] = useState<ReadonlySet<Tab>>(() => new Set([tab]));
  const add = (t: Tab) => setMounted(m => (m.has(t) ? m : new Set(m).add(t)));
  useEffect(() => { add(tab); }, [tab]);
  useEffect(() => {
    if (!ready) return;
    let i = 0, timer = 0;
    const next = () => {
      const t = ORDER[i++];
      if (!t) return;
      startTransition(() => add(t));
      timer = window.setTimeout(next, 250);
    };
    timer = window.setTimeout(next, 700);
    return () => clearTimeout(timer);
  }, [ready]);
  return mounted;
}

/** Каждая вкладка помнит, докуда её прокрутили: вернулись — тот же вид, как в приложениях iOS */
function useTabScroll(tab: Tab) {
  const saved = useRef<Partial<Record<Tab, number>>>({});
  const prev = useRef(tab);
  useLayoutEffect(() => {
    if (prev.current === tab) return;
    prev.current = tab;
    window.scrollTo({ top: saved.current[tab] ?? 0 });
  }, [tab]);
  useEffect(() => {
    const on = () => { saved.current[useUi.getState().tab] = window.scrollY; };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
}

export default function App() {
  useTheme();
  usePlanUpdates();
  useInbox();
  useSundayCheckup();
  const ready = useStore(s => s.ready);
  const tourSeen = useStore(s => s.settings.tourSeen ?? 0);
  const tab = useUi(s => s.tab);
  const toast = useUi(s => s.toast);
  const undo = useUi(s => s.undo);
  const set = useUi(s => s.set);
  useTabScroll(tab);
  const mounted = useMountedTabs(tab, ready);
  // «Остров» появляется, когда шапка вкладки (на «Сегодня» — сцена) ушла за верхний край
  const mark = useRef<HTMLDivElement>(null);
  const [island, setIsland] = useState(false);
  useEffect(() => {
    const el = mark.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setIsland(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [ready]);

  useEffect(() => {
    // просим браузер не вычищать данные при нехватке места
    void navigator.storage?.persist?.().catch(() => {});
    if (cleanedTwins) showToast(`Убрал повторы трат из чата: ${cleanedTwins}`);
    updateBadge();
    const onVis = () => document.visibilityState === 'visible' && updateBadge();
    document.addEventListener('visibilitychange', onVis);
    const unsub = useStore.subscribe(() => updateBadge());
    return () => { document.removeEventListener('visibilitychange', onVis); unsub(); };
  }, []);

  // знакомство с новым видом — один раз, после того как мост развёлся
  useEffect(() => {
    if (!ready || tourSeen >= TOUR_VERSION) return;
    const t = window.setTimeout(() => { if (!useUi.getState().inbox) set({ tour: true }); }, 2200);
    return () => clearTimeout(t);
  }, [ready, tourSeen, set]);

  if (!ready) return <MotionConfig reducedMotion="user"><Onboarding /></MotionConfig>;

  return (
    <MotionConfig reducedMotion="user">
      <div className="pt-safe relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip pb-36">
        <div ref={mark} aria-hidden="true" className="pointer-events-none absolute left-0 h-px w-px" style={{ top: tab === 'week' ? 360 : 150 }} />
        <Island show={island} />
        <Salute />
        <div aria-hidden="true" className="fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)]" style={{ background: 'var(--sky-1)' }} />
        {/* Все вкладки живут сразу, скрытые — блоками с hidden: переключение только показывает готовое, без
            пересборки и без перезапуска эффектов. Мгновенно, как у вкладок iOS: без въезда — частое действие
            не должно ждать анимацию */}
        {ORDER.map(t => (mounted.has(t) || t === tab) && <main key={t} hidden={t !== tab}>{SCREENS[t]}</main>)}

        <TabBar />

        {SHEETS}
        <Toast text={toast} undo={undo} onDone={() => set({ toast: null, undo: null })} />
      </div>
    </MotionConfig>
  );
}

import { MotionConfig } from 'motion/react';
import { lazy, Suspense, startTransition, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Salute } from './components/Salute';
import { TABS, TabBar } from './components/TabBar';
import { Toast } from './components/ui';
import { CardSheet, SavingsSheet } from './screens/Accounts';
import { LoanSheet } from './screens/LoanSheet';
import { PaymentQueueSheet } from './screens/PaymentQueue';
import { TransferSheet } from './screens/TransferSheet';
import { AddExpenseSheet } from './screens/AddExpense';
import { BonusSheet } from './screens/BonusSheet';
import { CheckupSheet } from './screens/Checkup';
import { DebtSheet } from './screens/DebtSheet';
import { EventSheet } from './screens/EventSheet';
import { FixedSheet } from './screens/FixedSheet';
import { Onboarding } from './screens/Onboarding';
import { updateBadge } from './screens/reminders';
import { openPaymentReminder, pushConfigured, syncPaymentPush } from './screens/paymentPush';
import { ReserveSheet } from './screens/ReserveSheet';
import { SyncSheet, UnlockSheet } from './screens/Sync';
import { TodaySheet } from './screens/TodaySheet';
import { Tour, TOUR_VERSION } from './screens/Tour';
import { Week } from './screens/Week';
import { WeekSheet } from './screens/WeekSheet';
import { currentLegacyFile, migrationBackupFile, useStore } from './store/store';
import { migrationProblem, subscribeMigration } from './store/financeStorage';
import { downloadFile } from './domain/ics';
import { useUi, type Tab } from './store/ui';

const History = lazy(() => import('./preview/HistoryStudio').then(m => ({ default: m.HistoryStudio })));
const Payments = lazy(() => import('./screens/Payments').then(m => ({ default: m.Payments })));
const Plan = lazy(() => import('./screens/Plan').then(m => ({ default: m.Plan })));
const ImportSheet = lazy(() => import('./screens/Import').then(m => ({ default: m.ImportSheet })));
const SettingsSheet = lazy(() => import('./screens/Settings').then(m => ({ default: m.SettingsSheet })));
const HubSheet = lazy(() => import('./screens/Hub').then(m => ({ default: m.HubSheet })));
const FinanceSheet = lazy(() => import('./screens/FinanceSheet').then(m => ({ default: m.FinanceSheet })));
const WorkSheet = lazy(() => import('./preview/WorkStudio').then(m => ({ default: m.WorkStudio })));

function DeferredSheets() {
  const scan = useUi(s => s.scan);
  const settings = useUi(s => s.settings);
  const hub = useUi(s => s.hub);
  return <Suspense fallback={null}>
    {scan && <ImportSheet />}
    {settings && <SettingsSheet />}
    {hub && <HubSheet />}
  </Suspense>;
}

function FinanceSheets() {
  const finance = useUi(s => s.finance);
  const work = useUi(s => s.workSheet);
  return <Suspense fallback={null}>{finance && <FinanceSheet />}{work && <WorkSheet />}</Suspense>;
}

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
const SCREENS: Record<Tab, ReactNode> = { week: <Week />, payments: <Payments />, budget: <History />, plan: <Plan /> };
/** Все листы — один постоянный элемент: при смене вкладки или тоста оболочка их не перерисовывает,
 *  каждый лист сам следит за своим кусочком состояния */
const SHEETS = (
  <>
    <CheckupSheet />
    <AddExpenseSheet />
    <DeferredSheets />
    <EventSheet />
    <BonusSheet />
    <DebtSheet />
    <ReserveSheet />
    <WeekSheet />
    <TodaySheet />
    <SavingsSheet />
    <CardSheet />
    <LoanSheet />
    <TransferSheet />
    <PaymentQueueSheet />
    <FixedSheet />
    <SyncSheet />
    <UnlockSheet />
    <FinanceSheets />
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
  const ready = useStore(s => s.ready);
  const storageProblem = useSyncExternalStore(subscribeMigration, migrationProblem, migrationProblem);
  const tourSeen = useStore(s => s.settings.tourSeen ?? 0);
  const tab = useUi(s => s.tab);
  const toast = useUi(s => s.toast);
  const undo = useUi(s => s.undo);
  const set = useUi(s => s.set);
  useTabScroll(tab);
  const mounted = useMountedTabs(tab, ready);
  useEffect(() => {
    // просим браузер не вычищать данные при нехватке места
    void navigator.storage?.persist?.().catch(() => {});
    updateBadge();
    const onVis = () => document.visibilityState === 'visible' && updateBadge();
    document.addEventListener('visibilitychange', onVis);
    const unsub = useStore.subscribe(() => updateBadge());
    return () => { document.removeEventListener('visibilitychange', onVis); unsub(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    openPaymentReminder();
    if (!pushConfigured) return;
    let timer: number | undefined;
    const sync = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void syncPaymentPush().catch(() => {}), 600);
    };
    sync();
    const unsubscribe = useStore.subscribe(sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('online', sync);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('online', sync);
    };
  }, [ready]);

  // знакомство с новым видом — один раз, после того как мост развёлся
  useEffect(() => {
    if (!ready || tourSeen >= TOUR_VERSION) return;
    const t = window.setTimeout(() => { if (!useUi.getState().inbox) set({ tour: true }); }, 2200);
    return () => clearTimeout(t);
  }, [ready, tourSeen, set]);

  if (storageProblem) return <main className="mx-auto max-w-md space-y-4 px-4 pt-12">
    <h1 className="text-xl font-semibold">Нужно проверить данные</h1>
    <p>{storageProblem === 'changed' ? 'Данные изменились в другой вкладке или старой версии. Закройте другие окна «Курса» перед повторной проверкой.'
      : 'Хранилище не прошло проверку. Исходная копия сохраняется, если браузер дал к ней доступ.'}</p>
    <button type="button" className="card block min-h-11 px-4" onClick={() => window.location.reload()}>Проверить снова</button>
    <button type="button" className="card block min-h-11 px-4" onClick={() => {
      try {
        const copy = ready ? useStore.getState().exportData() : migrationBackupFile() ?? currentLegacyFile();
        if (copy) downloadFile('kurs-lokalnaya-kopiya.json', copy, 'application/json');
      } catch { /* Несверенную копию не выдаём за проверенную. */ }
    }}>Сохранить копию</button>
    {storageProblem === 'changed' && <button type="button" className="card block min-h-11 px-4" onClick={() => {
      try {
        const copy = currentLegacyFile();
        if (copy) downloadFile('kurs-staraya-versiya.json', copy, 'application/json');
      } catch { /* Некорректная копия остаётся в исходном хранилище. */ }
    }}>Сохранить данные старой версии</button>}
  </main>;
  if (!ready) return <MotionConfig reducedMotion="user"><Onboarding /></MotionConfig>;

  return (
    <MotionConfig reducedMotion="user">
      <div className="nv-live-app pt-safe relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip" data-tab={tab}>
        <Salute />
        <div aria-hidden="true" className="fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)]" style={{ background: 'var(--sky-1)' }} />
        {/* Все вкладки живут сразу, скрытые — блоками с hidden: переключение только показывает готовое, без
            пересборки и без перезапуска эффектов. Мгновенно, как у вкладок iOS: без въезда — частое действие
            не должно ждать анимацию */}
        {ORDER.map(t => (mounted.has(t) || t === tab) && <main key={t} hidden={t !== tab}>{t === 'week' ? SCREENS[t] : <Suspense fallback={null}>{SCREENS[t]}</Suspense>}</main>)}

        <TabBar />

        {SHEETS}
        <Toast text={toast} undo={undo} onDone={() => set({ toast: null, undo: null })} />
      </div>
    </MotionConfig>
  );
}

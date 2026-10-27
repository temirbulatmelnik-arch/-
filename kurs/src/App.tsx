import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, PieChart } from 'lucide-react';
import { useEffect, type ComponentType } from 'react';
import { BridgeIcon, SpireIcon } from './components/Petersburg';
import { Toast } from './components/ui';
import { CardSheet, SavingsSheet } from './screens/Accounts';
import { AddExpenseSheet } from './screens/AddExpense';
import { BonusSheet } from './screens/BonusSheet';
import { Budget } from './screens/Budget';
import { DebtSheet } from './screens/DebtSheet';
import { EventSheet } from './screens/EventSheet';
import { FixedSheet } from './screens/FixedSheet';
import { ImportSheet } from './screens/Import';
import { Onboarding } from './screens/Onboarding';
import { Payments } from './screens/Payments';
import { Plan } from './screens/Plan';
import { updateBadge } from './screens/reminders';
import { ReserveSheet } from './screens/ReserveSheet';
import { SettingsSheet } from './screens/Settings';
import { SyncSheet, UnlockSheet, usePlanUpdates } from './screens/Sync';
import { Week } from './screens/Week';
import { WeekSheet } from './screens/WeekSheet';
import { cleanedTwins, useStore } from './store/store';
import { toast as showToast, useUi, type Tab } from './store/ui';

const TABS: { id: Tab; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }[] = [
  { id: 'week', label: 'Неделя', icon: BridgeIcon },
  { id: 'payments', label: 'Платежи', icon: CalendarDays },
  { id: 'plan', label: 'План', icon: SpireIcon },
  { id: 'budget', label: 'Бюджет', icon: PieChart },
];

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

export default function App() {
  useTheme();
  usePlanUpdates();
  const ready = useStore(s => s.ready);
  const { tab, setTab, toast, set } = useUi();

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

  if (!ready) return <Onboarding />;

  return (
    <div className="pt-safe mx-auto min-h-dvh w-full max-w-md pb-32">
      <div aria-hidden="true" className="fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)]" style={{ background: 'var(--sky-1)' }} />
      <AnimatePresence mode="wait">
        <motion.main key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'week' && <Week />}
          {tab === 'payments' && <Payments />}
          {tab === 'plan' && <Plan />}
          {tab === 'budget' && <Budget />}
        </motion.main>
      </AnimatePresence>

      <nav className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-30">
        <div className="pointer-events-auto mx-auto mb-3 flex w-[min(92%,380px)] rounded-full border border-line bg-surface/85 p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          {TABS.map(t => {
            const active = t.id === tab;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={active ? 'page' : undefined}
                className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10.5px] font-medium transition-colors ${active ? 'text-ink' : 'text-faint'}`}>
                {active && <motion.span layoutId="tab-bg" className="absolute inset-0 rounded-full bg-surface-2" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <t.icon size={20} strokeWidth={active ? 1.8 : 1.5} className={`relative ${active ? 'text-sea' : ''}`} />
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <AddExpenseSheet />
      <ImportSheet />
      <EventSheet />
      <BonusSheet />
      <DebtSheet />
      <ReserveSheet />
      <SettingsSheet />
      <WeekSheet />
      <SavingsSheet />
      <CardSheet />
      <FixedSheet />
      <SyncSheet />
      <UnlockSheet />
      <Toast text={toast} onDone={() => set({ toast: null })} />
    </div>
  );
}

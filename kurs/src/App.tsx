import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, PieChart, TrendingDown, Wallet } from 'lucide-react';
import { useEffect } from 'react';
import { Toast } from './components/ui';
import { AddExpenseSheet } from './screens/AddExpense';
import { BonusSheet } from './screens/BonusSheet';
import { Budget } from './screens/Budget';
import { Calendar } from './screens/Calendar';
import { DebtSheet } from './screens/DebtSheet';
import { Debts } from './screens/Debts';
import { EventSheet } from './screens/EventSheet';
import { Onboarding } from './screens/Onboarding';
import { updateBadge } from './screens/reminders';
import { ReserveSheet } from './screens/ReserveSheet';
import { ScanSheet } from './screens/Scan';
import { SettingsSheet } from './screens/Settings';
import { Week } from './screens/Week';
import { useStore } from './store/store';
import { useUi, type Tab } from './store/ui';

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'week', label: 'Неделя', icon: Wallet },
  { id: 'calendar', label: 'Платежи', icon: CalendarClock },
  { id: 'debts', label: 'Долги', icon: TrendingDown },
  { id: 'budget', label: 'Бюджет', icon: PieChart },
];

function useTheme() {
  const theme = useStore(s => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0f0d' : '#f2f4f1');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export default function App() {
  useTheme();
  const ready = useStore(s => s.ready);
  const { tab, setTab, toast, set } = useUi();

  useEffect(() => {
    // просим браузер не вычищать данные при нехватке места
    void navigator.storage?.persist?.().catch(() => {});
    updateBadge();
    const onVis = () => document.visibilityState === 'visible' && updateBadge();
    document.addEventListener('visibilitychange', onVis);
    const unsub = useStore.subscribe(() => updateBadge());
    return () => { document.removeEventListener('visibilitychange', onVis); unsub(); };
  }, []);

  if (!ready) return <Onboarding />;

  return (
    <div className="pt-safe mx-auto min-h-dvh w-full max-w-md pb-28">
      <AnimatePresence mode="wait">
        <motion.main key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'week' && <Week />}
          {tab === 'calendar' && <Calendar />}
          {tab === 'debts' && <Debts />}
          {tab === 'budget' && <Budget />}
        </motion.main>
      </AnimatePresence>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md">
          {TABS.map(t => {
            const active = t.id === tab;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={active ? 'page' : undefined}
                className={`relative flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-bold transition-colors ${active ? 'text-accent' : 'text-faint'}`}>
                <t.icon size={23} strokeWidth={active ? 2.3 : 1.8} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <AddExpenseSheet />
      <ScanSheet />
      <EventSheet />
      <BonusSheet />
      <DebtSheet />
      <ReserveSheet />
      <SettingsSheet />
      <Toast text={toast} onDone={() => set({ toast: null })} />
    </div>
  );
}

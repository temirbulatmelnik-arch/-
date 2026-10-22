import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, BookOpen, House, Layers } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Sheet } from './components/ui';
import { unlockAudio } from './engine/cues';
import { dayPlan } from './engine/plan';
import { sessionLevel, type SessionKind } from './engine/program';
import { Check } from './screens/Check';
import { Learn } from './screens/Learn';
import { Onboarding } from './screens/Onboarding';
import { Plan } from './screens/Plan';
import { Player } from './screens/Player';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';
import { useStore } from './store/store';

type Tab = 'today' | 'plan' | 'learn' | 'progress';

const TABS: { id: Tab; label: string; icon: typeof House }[] = [
  { id: 'today', label: 'Сегодня', icon: House },
  { id: 'plan', label: 'Программа', icon: Layers },
  { id: 'learn', label: 'Техника', icon: BookOpen },
  { id: 'progress', label: 'Прогресс', icon: BarChart3 },
];

function useTheme() {
  const theme = useStore(s => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const root = document.documentElement;
    const apply = () => {
      // «как в системе»: тема страницы-хозяина (data-theme), если она задана, иначе тема ОС
      const host = root.getAttribute('data-theme');
      const system = host === 'dark' || host === 'light' ? host === 'dark' : mq.matches;
      const dark = theme === 'dark' || (theme === 'system' && system);
      root.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0b0a' : '#f2eee7');
    };
    apply();
    mq.addEventListener('change', apply);
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', apply); mo.disconnect(); };
  }, [theme]);
}

export default function App() {
  useTheme();
  const onboarded = useStore(s => s.onboarded);
  const finishOnboarding = useStore(s => s.finishOnboarding);
  const levelId = useStore(s => s.levelId);
  const levelSince = useStore(s => s.levelSince);
  const intensive = useStore(s => s.intensive);
  const checks = useStore(s => s.checks);
  const [tab, setTab] = useState<Tab>('today');
  const [playing, setPlaying] = useState<SessionKind | null>(null);
  const [checking, setChecking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => window.scrollTo({ top: 0 }), [tab]);

  if (!onboarded) return <Onboarding onDone={finishOnboarding} />;

  const start = (kind: SessionKind) => {
    unlockAudio();
    setPlaying(kind);
  };
  const level = dayPlan({ levelId, levelSince, intensive, checks }).level;

  return (
    <div className="pt-safe mx-auto min-h-dvh w-full max-w-md pb-28">
      <AnimatePresence mode="wait">
        <motion.main key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'today' && <Today onStart={start} onCheck={() => setChecking(true)} onSettings={() => setSettingsOpen(true)} onPlan={() => setTab('plan')} />}
          {tab === 'plan' && <Plan />}
          {tab === 'learn' && <Learn />}
          {tab === 'progress' && <Progress />}
        </motion.main>
      </AnimatePresence>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md">
          {TABS.map(t => {
            const active = t.id === tab;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={active ? 'page' : undefined}
                className={`relative flex flex-1 flex-col items-center gap-1.5 pt-3 pb-2 text-[10px] font-medium tracking-[0.16em] uppercase transition-colors ${active ? 'text-ink' : 'text-faint'}`}>
                {active && <motion.span layoutId="tab-dot" className="bg-gold-grad absolute top-0 h-[2px] w-10 rounded-full" />}
                <t.icon size={21} strokeWidth={active ? 1.9 : 1.5} className={active ? 'text-gold' : ''} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки">
        <Settings />
      </Sheet>

      <AnimatePresence>
        {playing && (
          <motion.div key="player" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40">
            <Player level={sessionLevel(level, playing)} kind={playing} onClose={() => setPlaying(null)} />
          </motion.div>
        )}
        {checking && (
          <motion.div key="check" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40">
            <Check onClose={() => setChecking(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

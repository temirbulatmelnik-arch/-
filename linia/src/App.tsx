import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, ChartSpline, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ExerciseDemo } from './components/Exercise';
import { Sheet } from './components/ui';
import { unlockAudio } from './engine/cues';
import { EXERCISES, type BlockId, type ExerciseId } from './engine/exercises';
import type { SessionKind } from './engine/program';
import type { CheckKind } from './engine/stats';
import { Block } from './screens/Block';
import { CheckFlow, TechCheck } from './screens/Check';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Onboarding } from './screens/Onboarding';
import { Player } from './screens/Player';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { useStore } from './store/store';

type Tab = 'home' | 'learn' | 'progress';

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'home', label: 'Главная', icon: Sparkles },
  { id: 'learn', label: 'Знания', icon: BookOpen },
  { id: 'progress', label: 'Прогресс', icon: ChartSpline },
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
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#110d0b' : '#f7f2ed');
    };
    apply();
    mq.addEventListener('change', apply);
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', apply); mo.disconnect(); };
  }, [theme]);
}

export interface Actions {
  openBlock: (b: BlockId) => void;
  start: (b: BlockId, kind: SessionKind) => void;
  check: (k: CheckKind) => void;
  tech: (b: BlockId) => void;
  settings: () => void;
}

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

export default function App() {
  useTheme();
  const onboarded = useStore(s => s.onboarded);
  const [tab, setTab] = useState<Tab>('home');
  const [block, setBlock] = useState<BlockId | null>(null);
  const [playing, setPlaying] = useState<{ block: BlockId; kind: SessionKind } | null>(null);
  const [checking, setChecking] = useState<CheckKind | null>(null);
  const [teching, setTeching] = useState<BlockId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => window.scrollTo({ top: 0 }), [tab, block]);

  // служебный просмотр одного упражнения в 3D: #3d=nod_supine или #3d=nod_supine:skin
  const debug = location.hash.match(/^#3d=(\w+)(:skin)?/);
  if (debug && debug[1] in EXERCISES) return <div className="mx-auto max-w-md p-4"><ExerciseDemo ex={debug[1] as ExerciseId} initialXray={!debug[2]} autoRotate={false} /></div>;
  if (!onboarded) return <Onboarding />;

  const actions: Actions = {
    openBlock: setBlock,
    start: (b, kind) => { unlockAudio(); setPlaying({ block: b, kind }); },
    check: setChecking,
    tech: setTeching,
    settings: () => setSettingsOpen(true),
  };

  return (
    <div className="pt-safe mx-auto min-h-dvh w-full max-w-md pb-28">
      <AnimatePresence mode="wait">
        <motion.main key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {tab === 'home' && <Home actions={actions} />}
          {tab === 'learn' && <Learn />}
          {tab === 'progress' && <Progress actions={actions} />}
        </motion.main>
      </AnimatePresence>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md">
          {TABS.map(t => {
            const active = t.id === tab;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={active ? 'page' : undefined}
                className={`relative flex flex-1 flex-col items-center gap-1 pt-3 pb-2 text-[11px] font-semibold tracking-wide transition-colors ${active ? 'text-ink' : 'text-faint'}`}>
                {active && <motion.span layoutId="tab-dot" className="absolute top-0 h-[2px] w-10 rounded-full bg-gold" />}
                <t.icon size={21} strokeWidth={active ? 2 : 1.6} className={active ? 'text-gold' : ''} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>
        {block && (
          <motion.div key="block" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.28 }} className="fixed inset-0 z-30 overflow-y-auto bg-bg">
            <Block block={block} actions={actions} covered={!!playing || !!checking || !!teching} onClose={() => setBlock(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки">
        <Settings />
      </Sheet>

      <AnimatePresence>
        {playing && (
          <motion.div key="player" {...fade} className="fixed inset-0 z-40">
            <Player block={playing.block} kind={playing.kind} onClose={() => setPlaying(null)} />
          </motion.div>
        )}
        {checking && (
          <motion.div key="check" {...fade} className="fixed inset-0 z-40">
            <CheckFlow kind={checking} onClose={() => setChecking(null)} />
          </motion.div>
        )}
        {teching && (
          <motion.div key="tech" {...fade} className="fixed inset-0 z-40">
            <TechCheck block={teching} onClose={() => setTeching(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

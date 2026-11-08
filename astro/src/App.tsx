import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { useApp } from './store';
import { StarField } from './components/StarField';
import { Nebula } from './components/Nebula';
import { Intro } from './components/Intro';
import { TabBar } from './components/TabBar';
import { Tap } from './components/ui';
import { Today } from './screens/Today';
import { Us } from './screens/Us';
import { Calendar } from './screens/Calendar';
import { Charts } from './screens/Charts';
import { spring } from './components/motion';

export default function App() {
  const { tab, setTab, theme, toggleTheme, element } = useApp();
  useEffect(() => {
    const el = document.documentElement;
    for (let i = 0; i < 4; i++) el.classList.toggle(`el-${i}`, i === element);
  }, [element]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#e9edfb' : '#0a0d2a');
  }, [theme]);
  return (
    <MotionConfig reducedMotion="user">
      <Nebula />
      <StarField />
      <Intro />
      <div className="pt-safe relative mx-auto min-h-full max-w-[560px] px-4 pb-32">
        <div className="mb-2 flex justify-end">
          <Tap onClick={toggleTheme} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} className="glass grid size-10 place-items-center rounded-full text-brass">
            <motion.svg key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={spring} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              {theme === 'dark' ? <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /> : <g><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></g>}
            </motion.svg>
          </Tap>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={tab} initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }} transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}>
            {tab === 'today' && <Today />}
            {tab === 'us' && <Us />}
            {tab === 'dates' && <Calendar />}
            {tab === 'charts' && <Charts />}
          </motion.main>
        </AnimatePresence>
      </div>
      <TabBar tab={tab} onChange={setTab} />
    </MotionConfig>
  );
}

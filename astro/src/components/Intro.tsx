// Вступление при запуске: созвездие складывается в знак приложения и растворяется (один раз за сессию).
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

const STARS: [number, number][] = [[50, 12], [78, 30], [86, 62], [64, 86], [32, 84], [14, 58], [22, 28], [50, 50]];
const LINES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [0, 7], [7, 3], [6, 7], [7, 2]];

export function Intro() {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(() => { try { return !sessionStorage.getItem('astro-intro'); } catch { return false; } });
  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem('astro-intro', '1'); } catch { /* приватный режим */ }
    const id = setTimeout(() => setShow(false), reduce ? 300 : 2100);
    return () => clearTimeout(id);
  }, [show, reduce]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center" style={{ background: 'radial-gradient(80% 60% at 50% 40%, #1b1a5a, #070920)' }}
          exit={{ opacity: 0, scale: 1.08, filter: 'blur(12px)' }} transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }} onClick={() => setShow(false)}>
          <div className="flex flex-col items-center gap-5">
            <svg viewBox="0 0 100 100" width="150" height="150" aria-hidden="true">
              {LINES.map(([a, b], i) => (
                <motion.line key={i} x1={STARS[a][0]} y1={STARS[a][1]} x2={STARS[b][0]} y2={STARS[b][1]} stroke="#e2bd72" strokeWidth="0.6" strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.8 }} transition={{ duration: 0.5, delay: 0.25 + i * 0.07 }} />
              ))}
              {STARS.map(([x, y], i) => (
                <motion.circle key={i} cx={x} cy={y} r={i === 7 ? 3.2 : 1.8} fill={i === 7 ? '#fff6dc' : '#ffffff'}
                  initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5, duration: 0.6, delay: i * 0.06 }}
                  style={{ filter: 'drop-shadow(0 0 4px #fff)' }} />
              ))}
            </svg>
            <motion.p className="serif text-[34px] font-semibold text-[#ece9ff]" initial={{ opacity: 0, y: 10, letterSpacing: '0.2em' }} animate={{ opacity: 1, y: 0, letterSpacing: '0.01em' }} transition={{ duration: 1, delay: 0.8 }}>Мой астропрогноз</motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

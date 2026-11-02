// Долгое нажатие, как на iPhone: строка приподнимается над размытым фоном, рядом — меню действий.
// Палец сдвинулся — это прокрутка или свайп, меню не открывается. Отпустили до порога — обычное нажатие.
// Меню растёт от строки (навык emil-design-eng: всплывающее — от источника), щелчок при открытии.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from './haptics';

export interface HoldAction {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

const HOLD = 420;

export function Hold({ children, actions, preview, className = '' }: { children: ReactNode; actions: HoldAction[]; preview: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const pressTimer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pressing, setPressing] = useState(false);
  // портал живёт, пока меню открыто или доигрывает исчезновение
  const [mounted, setMounted] = useState(false);
  useEffect(() => { if (rect) setMounted(true); }, [rect]);

  const cancel = () => { window.clearTimeout(timer.current); window.clearTimeout(pressTimer.current); start.current = null; setPressing(false); };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    fired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    window.clearTimeout(timer.current);
    window.clearTimeout(pressTimer.current);
    // лёгкое «вдавливание» начинается почти сразу — видно, что что-то будет
    pressTimer.current = window.setTimeout(() => setPressing(true), 140);
    timer.current = window.setTimeout(() => {
      fired.current = true;
      setPressing(false);
      haptic();
      setRect(ref.current!.getBoundingClientRect());
    }, HOLD);
  };
  const move = (e: React.PointerEvent) => {
    if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) cancel();
  };
  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(pressTimer.current); }, []);
  useEffect(() => {
    if (!rect) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setRect(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rect]);

  // меню под строкой, а если внизу тесно — над ней
  const below = rect ? rect.bottom + 12 + actions.length * 52 < window.innerHeight - 24 : true;
  return (
    <div ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
      onClickCapture={e => { if (fired.current) { e.stopPropagation(); e.preventDefault(); fired.current = false; } }}
      onContextMenu={e => e.preventDefault()} className={`select-none [-webkit-touch-callout:none] ${className}`}>
      <motion.div animate={{ scale: pressing ? 0.975 : 1 }} transition={{ duration: pressing ? 0.28 : 0.15, ease: [0.23, 1, 0.32, 1] }}>{children}</motion.div>
      {mounted && createPortal(
        <AnimatePresence onExitComplete={() => setMounted(false)}>
          {rect && (
            <motion.div key="hold" className="fixed inset-0 z-[58]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }} onClick={() => setRect(null)}>
              <div className="absolute inset-0 bg-[rgba(4,14,22,.35)] backdrop-blur-[10px]" />
              {/* приподнятая строка — на том же месте, чуть крупнее */}
              <motion.div className="absolute overflow-hidden rounded-[18px] bg-surface shadow-[0_24px_50px_-18px_rgba(4,14,22,.6)]"
                style={{ left: rect.left, top: rect.top, width: rect.width }} initial={{ scale: 0.98 }} animate={{ scale: 1.03 }} exit={{ scale: 1, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}>
                {preview}
              </motion.div>
              <motion.div role="menu" className="absolute w-[min(74vw,280px)] overflow-hidden rounded-[18px] bg-surface/95 shadow-[0_24px_50px_-18px_rgba(4,14,22,.6)] backdrop-blur-xl"
                style={{ left: Math.min(rect.left + 8, window.innerWidth - 296), ...(below ? { top: rect.bottom + 12 } : { bottom: window.innerHeight - rect.top + 12 }), transformOrigin: below ? 'top left' : 'bottom left' }}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }} onClick={e => e.stopPropagation()}>
                {actions.map((a, i) => (
                  <button key={a.label} type="button" role="menuitem" onClick={() => { setRect(null); window.setTimeout(a.onSelect, 120); }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] active:bg-surface-2 ${i ? 'border-t border-line/70' : ''} ${a.danger ? 'text-neg' : ''}`}>
                    {a.label}<span className={a.danger ? 'text-neg' : 'text-muted'}>{a.icon}</span>
                  </button>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
    </div>
  );
}

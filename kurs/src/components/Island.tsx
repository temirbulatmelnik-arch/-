// «Остров» — как Dynamic Island на iPhone. Когда шапка экрана уехала вверх, сверху висит капсула: кольцо и сколько
// ещё можно сегодня. Нажатие — капсула раскрывается: сегодня, неделя, ближайший платёж и быстрые действия.
// Свайп вверх или нажатие мимо — сворачивается обратно (навык apple-design: из источника и обратно в источник).
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Plus, Scale, ScanText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { eventsBetween } from '../domain/calendar';
import { addDays, dayMonth } from '../domain/dates';
import { dayBudget, weekSummary } from '../domain/summary';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';
import { haptic } from './haptics';
import { Roll } from './motion';
import { runQuick } from './TabBar';
import { Money } from './ui';

const morph = { type: 'spring', bounce: 0.18, duration: 0.5 } as const;

function MiniRing({ frac, over, size }: { frac: number; over: boolean; size: number }) {
  const r = size / 2 - 3, L = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" stroke="rgba(255,255,255,.16)" />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" strokeLinecap="round" stroke={over ? '#ff8a5c' : '#5fd0e6'}
        strokeDasharray={L} initial={false} animate={{ strokeDashoffset: L * (1 - Math.min(1, Math.max(0, over ? 1 : frac))) }} transition={{ type: 'spring', bounce: 0, duration: 0.6 }} />
    </svg>
  );
}

export function Island({ show }: { show: boolean }) {
  const now = useToday();
  const cal = useCal();
  const [expenses, debts, overrides, marks] = useStore(useShallow(s => [s.expenses, s.debts, s.weeklyOverrides, s.marks] as const));
  const set = useUi(s => s.set);
  const [open, setOpen] = useState(false);
  const b = useMemo(() => dayBudget(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const w = useMemo(() => weekSummary(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const next = useMemo(() => eventsBetween(cal, addDays(now, -20), addDays(now, 10)).find(e => e.kind === 'payment' && !marks[e.key]?.done), [cal, now, marks]);
  useEffect(() => { if (!show) setOpen(false); }, [show]);
  const over = b.left < 0;
  const frac = b.day > 0 ? b.left / b.day : 0;
  const act = (fn: () => void) => { setOpen(false); window.setTimeout(fn, 160); };

  return (
    <AnimatePresence>
      {show && (
        <>
          {open && <motion.div key="dim" className="fixed inset-0 z-[44] bg-black/25 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />}
          <motion.div key="island" layout role="button" tabIndex={0} aria-expanded={open} aria-label={open ? 'Свернуть' : `Сегодня ${over ? 'перерасход' : 'можно'} ${Math.round(Math.abs(b.left))} ₽. Раскрыть`}
            onClick={() => { if (!open) { setOpen(true); haptic(); } }} onKeyDown={e => e.key === 'Enter' && setOpen(!open)}
            drag={open ? 'y' : false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.3, bottom: 0.05 }} onDragEnd={(_, i) => { if (i.offset.y < -24 || i.velocity.y < -300) setOpen(false); }}
            initial={{ opacity: 0, y: -16, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.94, transition: { duration: 0.16 } }}
            transition={morph} style={{ borderRadius: open ? 32 : 24 }}
            className={`fixed left-0 right-0 top-[calc(env(safe-area-inset-top)+6px)] z-[45] mx-auto overflow-hidden bg-[#06141d] text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,.7)] select-none ${open ? 'w-[min(92vw,392px)] cursor-grab' : 'w-fit cursor-pointer'}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              {!open ? (
                <motion.div key="pill" layout="position" initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, filter: 'blur(4px)' }} transition={{ duration: 0.2 }}
                  className="flex h-11 items-center gap-2.5 pr-4 pl-2">
                  <MiniRing frac={frac} over={over} size={30} />
                  <span className={`font-display text-[16px] font-medium ${over ? 'text-[#ff9a70]' : ''}`}>{over && '−'}<Roll value={Math.abs(b.left)} /></span>
                  <span className="text-[12.5px] text-white/60">{over ? 'сверх дня' : 'сегодня'}</span>
                </motion.div>
              ) : (
                <motion.div key="panel" layout="position" initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)', transition: { delay: 0.08, duration: 0.25 } }} exit={{ opacity: 0, filter: 'blur(6px)', transition: { duration: 0.12 } }}
                  className="px-5 pt-4 pb-4">
                  <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/25" />
                  <div className="flex items-center gap-4">
                    <div className="relative grid size-[64px] place-items-center">
                      <div className="absolute inset-0"><MiniRing frac={frac} over={over} size={64} /></div>
                      <span className="text-[11px] text-white/70">{Math.round(Math.max(0, Math.min(1, frac)) * 100)}%</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px] text-white/60">{over ? 'Сегодня перерасход' : 'Сегодня можно ещё'}</div>
                      <div className={`font-display text-[30px] leading-tight font-medium ${over ? 'text-[#ff9a70]' : ''}`}><Roll value={Math.abs(b.left)} /></div>
                      <div className="text-[12.5px] text-white/60">потрачено <Money value={b.spentToday} /> из <Money value={b.day} /></div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white/[.07] px-4 py-3">
                    <div className="flex items-baseline justify-between text-[13px]"><span className="text-white/65">На неделю, до воскресенья</span><Money value={w.left} className={`font-display text-[15px] ${w.left < 0 ? 'text-[#ff9a70]' : ''}`} /></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/12">
                      <motion.div className="h-full rounded-full bg-[#5fd0e6]" initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, (w.left / Math.max(1, w.limit)) * 100))}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.6, delay: 0.1 }} />
                    </div>
                  </div>
                  {next && (
                    <button type="button" onClick={() => act(() => set({ event: next }))} className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white/[.07] px-4 py-3 text-left">
                      <CalendarClock size={18} strokeWidth={1.7} className="shrink-0 text-[#ffc49a]" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{next.title}</span><span className="block text-[12px] text-white/60">{next.date < now ? 'просрочен' : next.date === now ? 'сегодня' : dayMonth(next.date)}</span></span>
                      <Money value={next.amount} approx={next.approx} className="shrink-0 text-[14px]" />
                    </button>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {([['add', 'Трата', Plus], ['scan', 'Из банка', ScanText], ['checkup', 'Сверка', Scale]] as const).map(([id, label, Icon]) => (
                      <motion.button key={id} type="button" whileTap={{ scale: 0.95 }} onClick={() => act(() => (id === 'add' ? set({ add: {} }) : runQuick(id)))}
                        className={`flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[12px] font-medium ${id === 'add' ? 'bg-[#1f6f8f]' : 'bg-white/[.08]'}`}>
                        <Icon size={18} strokeWidth={1.8} />{label}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

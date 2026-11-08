// Сферы дня как светящиеся кольца: дуга от центра к значению, цвет сферы, мягкое дыхание свечения.
// Под кольцом — кривая дня (утро → день → вечер). Нажатие раскрывает объяснение.
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { Sphere } from '../engine/scores';
import { SPHERES } from '../engine/scores';
import type { SphereNote } from '../engine/synthesis';
import { soft, spring } from './motion';

function Ring({ value, color, size = 74 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 7, c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.abs(value) / 2);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={value >= 0 ? color : 'var(--bad)'} strokeWidth="5" strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2}) ${value < 0 ? `scale(-1 1) translate(${-size} 0)` : ''}`}
        initial={false} animate={{ strokeDasharray: `${c * frac} ${c}` }} transition={soft}
        style={{ filter: `drop-shadow(0 0 6px ${value >= 0 ? color : 'var(--bad)'})` }} />
      <circle cx={size / 2} cy={size / 2} r={r - 9} fill={color} fillOpacity="0.14" style={{ transformOrigin: 'center' }} />
    </svg>
  );
}

function Curve({ vals, color }: { vals: number[]; color: string }) {
  const W = 64, H = 18;
  const pts = vals.map((v, i) => [4 + (i * (W - 8)) / (vals.length - 1), H / 2 - (v / 2) * (H / 2 - 2)]);
  const d = `M${pts[0][0]} ${pts[0][1]} Q${pts[1][0]} ${pts[1][1] * 2 - (pts[0][1] + pts[2][1]) / 2} ${pts[2][0]} ${pts[2][1]}`;
  return (
    <svg width={W} height={H} aria-hidden="true">
      <line x1="2" x2={W - 2} y1={H / 2} y2={H / 2} stroke="var(--line)" />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill={color} />)}
    </svg>
  );
}

export function SphereOrbs({ notes, slots }: { notes: SphereNote[]; slots: Record<Sphere, number>[] }) {
  const [open, setOpen] = useState<Sphere | null>(null);
  const word = (v: number) => (v >= 1.2 ? 'отлично' : v >= 0.5 ? 'хорошо' : v > -0.5 ? 'ровно' : v > -1.2 ? 'напряжённо' : 'трудно');
  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 min-[420px]:grid-cols-5">
        {SPHERES.map((s, i) => {
          const n = notes.find(x => x.sphere === s.id)!;
          const sel = open === s.id;
          return (
            <motion.button key={s.id} onClick={() => setOpen(sel ? null : s.id)} aria-expanded={sel}
              initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: 0.05 * i }} whileTap={{ scale: 0.95 }}
              className={`oracle relative flex flex-col items-center rounded-[22px] px-1 pt-3 pb-2 ${sel ? 'halo' : ''}`}>
              <div className="relative">
                <Ring value={n.score} color={s.color} />
                <span className="num absolute inset-0 grid place-items-center text-[22px] font-semibold">{n.score > 0 ? '+' : n.score < 0 ? '−' : ''}{Math.abs(n.score).toFixed(1).replace('.', ',')}</span>
              </div>
              <span className="mt-1 text-[13.5px] font-semibold">{s.name}</span>
              <span className={`text-[12px] ${n.score >= 0.5 ? 'text-good' : n.score <= -0.5 ? 'text-bad' : 'text-faint'}`}>{word(n.score)}</span>
              <Curve vals={slots.map(x => x[s.id])} color={s.color} />
            </motion.button>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-[13px] text-faint">Кривая под кольцом — утро, день, вечер. Нажмите на сферу, чтобы прочитать разбор.</p>
      <AnimatePresence mode="wait">
        {open && (() => {
          const n = notes.find(x => x.sphere === open)!; const s = SPHERES.find(x => x.id === open)!;
          return (
            <motion.div key={open} initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -6, height: 0 }} transition={spring} className="overflow-hidden">
              <div className="oracle mt-3 rounded-[22px] p-4">
                <p className="flex items-center gap-2 text-[17px] font-semibold"><span className="size-2.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }} />{s.name}</p>
                <p className="mt-1.5 text-[16px] leading-relaxed text-dim">{n.text}</p>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// Шкала −2…+2: ось с центром, заливка от нуля к значению, мягкая пружина при смене дня.
import { motion } from 'motion/react';
import { soft } from './motion';

export function Scale({ label, value, color, min = -2, max = 2, invert, hint }: { label: string; value: number; color: string; min?: number; max?: number; invert?: boolean; hint?: string }) {
  const zero = min < 0 ? 0.5 : 0;
  const frac = (value - min) / (max - min);
  const left = Math.min(zero, frac), width = Math.abs(frac - zero);
  const tone = invert ? (value >= 1.2 ? 'text-bad' : value <= 0.4 ? 'text-good' : 'text-dim') : value >= 0.5 ? 'text-good' : value <= -0.5 ? 'text-bad' : 'text-dim';
  const word = invert ? (value >= 1.2 ? 'высокая' : value >= 0.5 ? 'средняя' : 'низкая') : value >= 1.2 ? 'отлично' : value >= 0.5 ? 'хорошо' : value > -0.5 ? 'ровно' : value > -1.2 ? 'напряжённо' : 'трудно';
  return (
    <div className="py-2" aria-label={`${label}: ${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}, ${word}`}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-[16px] font-medium"><span className="inline-block size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />{label}</span>
        <span className={`text-[15px] ${tone}`}>{word} <span className="num text-[19px] font-semibold">{value > 0 ? '+' : value < 0 ? '−' : ''}{Math.abs(value).toFixed(1).replace('.', ',')}</span></span>
      </div>
      <div className="relative h-2 rounded-full bg-[color:var(--line)]">
        {min < 0 && <span className="absolute top-1/2 left-1/2 h-3.5 w-px -translate-y-1/2 bg-[color:var(--faint)]" />}
        <motion.span className="absolute top-0 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow: `0 0 12px ${color}66` }}
          initial={false} animate={{ left: `${left * 100}%`, width: `${Math.max(width * 100, 1.2)}%` }} transition={soft} />
      </div>
      {hint && <p className="mt-1 text-[14px] text-faint">{hint}</p>}
    </div>
  );
}

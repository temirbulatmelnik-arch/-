// Главная визуализация тренировки: кольцо = мышечное кольцо сфинктера.
// Сжатие — кольцо сужается, утолщается и поднимается вверх (как «подтянуть вверх и внутрь»),
// расслабление — плавно возвращается, вдох — слегка расширяется.
import type { ReactNode } from 'react';
import type { Phase } from '../engine/timeline';

const SIZE = 300;
const C = SIZE / 2;

export function phaseColor(phase: Phase, level: number): string {
  if (phase === 'inhale' || phase === 'exhale' || level < 0) return 'var(--breath)';
  if (phase === 'prep') return 'var(--calm)';
  const p = Math.round(Math.min(1, Math.max(0, level)) * 100);
  return `color-mix(in oklab, var(--squeeze) ${p}%, var(--calm))`;
}

export function SphincterRing({ level, phase, progress, children }: {
  level: number; phase: Phase; progress: number; children?: ReactNode;
}) {
  const squeeze = Math.max(0, level);
  const r = 96 * (1 - 0.36 * squeeze) * (1 - 0.35 * Math.min(0, level));
  const lift = -22 * squeeze;
  const width = 16 + 12 * squeeze;
  const color = phaseColor(phase, level);
  const arcR = 138;
  const arcLen = 2 * Math.PI * arcR;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(78vw,340px)]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id="glow">
            <stop offset="0" style={{ stopColor: color }} stopOpacity="0.32" />
            <stop offset="1" style={{ stopColor: color }} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* прогресс текущего шага */}
        <circle cx={C} cy={C} r={arcR} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx={C} cy={C} r={arcR} fill="none" style={{ stroke: color }} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={arcLen} strokeDashoffset={arcLen * (1 - progress)}
          transform={`rotate(-90 ${C} ${C})`}
        />
        {/* мягкое свечение */}
        <circle cx={C} cy={C + lift} r={r + 34} fill="url(#glow)" />
        {/* «покой» — где кольцо было до сжатия */}
        <circle cx={C} cy={C} r={96} fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="3 7" opacity={squeeze > 0.05 ? 1 : 0} style={{ transition: 'opacity .4s' }} />
        {/* мышечное кольцо */}
        <circle cx={C} cy={C + lift} r={r} fill="none" style={{ stroke: color }} strokeWidth={width} opacity="0.95" />
        <circle cx={C} cy={C + lift} r={r - width / 2 - 6} fill="none" style={{ stroke: color }} strokeWidth="1.5" opacity="0.35" />
        {/* стрелки «вверх» при сжатии */}
        <g opacity={squeeze} transform={`translate(${C} ${C + lift - r - width / 2 - 18})`}>
          <path d="M-14 6 L0 -8 L14 6" fill="none" style={{ stroke: color }} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M-10 18 L0 8 L10 18" fill="none" style={{ stroke: color }} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ transform: `translateY(${(lift / SIZE) * 100}%)` }}>
        {children}
      </div>
    </div>
  );
}

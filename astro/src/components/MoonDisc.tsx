// Луна с настоящей фазой: освещённая часть — полукруг + эллипс терминатора. Растущая освещена справа.
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect } from 'react';

export function moonPath(phase: number, r: number): string {
  const p = ((phase % 360) + 360) % 360;
  const waxing = p < 180;
  const k = Math.cos((p * Math.PI) / 180); // 1 — новолуние, −1 — полнолуние
  const rx = Math.abs(k) * r;
  const sweepOuter = waxing ? 1 : 0;
  // внешний край — полукруг на освещённой стороне; внутренний — эллипс
  const sweepInner = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
  return `M 0 ${-r} A ${r} ${r} 0 0 ${sweepOuter} 0 ${r} A ${rx} ${r} 0 0 ${sweepInner} 0 ${-r} Z`;
}

export function MoonDisc({ phase, size = 64, glow = true, x, y }: { phase: number; size?: number; glow?: boolean; x?: number; y?: number }) {
  const r = size / 2 - 2;
  return (
    <svg x={x} y={y} width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <radialGradient id={`mg${size}`} cx="40%" cy="38%" r="70%">
          <stop offset="0" stopColor="#fbfaff" />
          <stop offset="0.7" stopColor="#d9def8" />
          <stop offset="1" stopColor="#aab3e6" />
        </radialGradient>
        <filter id={`mglow${size}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={size / 14} /></filter>
      </defs>
      {glow && <circle r={r} fill="#cfd8ff" opacity={0.18 + 0.3 * ((1 - Math.cos((phase * Math.PI) / 180)) / 2)} filter={`url(#mglow${size})`} />}
      <circle r={r} fill="#2a2f6b" opacity="0.85" />
      <circle r={r} fill="none" stroke="rgba(207,216,255,.25)" strokeWidth="0.8" />
      <MoonPath phase={phase} r={r} fill={`url(#mg${size})`} />
      {/* кратеры — тонкие, чтобы диск читался как Луна */}
      <g fill="#8d97cc" opacity="0.18">
        <circle cx={-r * 0.3} cy={-r * 0.25} r={r * 0.16} /><circle cx={r * 0.25} cy={r * 0.3} r={r * 0.12} /><circle cx={r * 0.1} cy={-r * 0.45} r={r * 0.08} />
      </g>
    </svg>
  );
}

/** анимируется сама фаза (число), а путь пересчитывается: флаги дуг в SVG не могут быть дробными */
function MoonPath({ phase, r, fill }: { phase: number; r: number; fill: string }) {
  const mv = useMotionValue(phase);
  useEffect(() => {
    const from = mv.get();
    let to = phase;
    if (to - from > 180) to -= 360; else if (from - to > 180) to += 360;
    const c = animate(mv, to, { type: 'spring', bounce: 0, duration: 0.9 });
    return () => c.stop();
  }, [phase, mv]);
  const d = useTransform(mv, v => moonPath(v, r));
  return <motion.path d={d} fill={fill} />;
}

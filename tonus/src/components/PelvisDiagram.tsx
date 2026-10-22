// Упрощённая схема (вид сбоку): мышцы тазового дна натянуты «гамаком» от лобковой кости до копчика.
// При сжатии гамак поднимается, а кольцо сфинктера сужается и уходит вверх и внутрь.
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

export function PelvisDiagram({ auto = true, contracted: forced }: { auto?: boolean; contracted?: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setOn(v => !v), 2600);
    return () => clearInterval(id);
  }, [auto]);
  const c = forced ?? on;
  const ease = { duration: c ? 0.7 : 1.4, ease: 'easeInOut' } as const;

  // глубина провиса гамака в покое и при сжатии
  const sag = c ? 150 : 186;
  const hammock = `M70 118 C 110 ${sag}, 205 ${sag + 6}, 250 112`;

  return (
    <figure className="select-none">
      <svg viewBox="0 0 320 220" className="w-full" role="img" aria-label="Схема мышц тазового дна, вид сбоку">
        {/* лобковая кость */}
        <rect x="40" y="84" width="34" height="46" rx="14" fill="var(--surface-2)" stroke="var(--gold)" strokeOpacity="0.6" strokeWidth="1.2" />
        {/* крестец и копчик */}
        <path d="M262 26 C 290 52, 292 92, 254 116" fill="none" stroke="var(--gold)" strokeWidth="11" strokeLinecap="round" opacity="0.35" />
        {/* гамак мышц */}
        <motion.path d={hammock} initial={false} animate={{ d: hammock }} transition={ease}
          fill="none" stroke="var(--calm)" strokeWidth="14" strokeLinecap="round" opacity="0.9" />
        <motion.path d={hammock} initial={false} animate={{ d: hammock }} transition={ease}
          fill="none" stroke="var(--surface)" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" opacity="0.7" />
        {/* сфинктер на задней части гамака */}
        <motion.circle cx="214" initial={false} animate={{ cy: c ? 132 : 154, r: c ? 8 : 12, strokeWidth: c ? 7 : 5 }} transition={ease}
          fill="var(--bg)" stroke="var(--squeeze)" />
        {/* стрелки вверх */}
        <motion.g initial={false} animate={{ opacity: c ? 1 : 0, y: c ? -4 : 6 }} transition={{ duration: 0.5 }}>
          {[110, 160, 212].map(x => (
            <path key={x} d={`M${x - 8} 108 L${x} 98 L${x + 8} 108 M${x} 99 L${x} 124`} fill="none" stroke="var(--squeeze)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </motion.g>
        <text x="57" y="62" textAnchor="middle" fontSize="9.5" letterSpacing="1.4" fill="var(--muted)">ЛОБКОВАЯ</text>
        <text x="57" y="75" textAnchor="middle" fontSize="9.5" letterSpacing="1.4" fill="var(--muted)">КОСТЬ</text>
        <text x="292" y="132" textAnchor="middle" fontSize="9.5" letterSpacing="1.4" fill="var(--muted)">КОПЧИК</text>
        <text x="140" y="212" textAnchor="middle" fontSize="9.5" letterSpacing="1.4" fill="var(--muted)">МЫШЦЫ ТАЗОВОГО ДНА</text>
        <text x="230" y="186" textAnchor="start" fontSize="9.5" letterSpacing="1.4" fill="var(--muted)">СФИНКТЕР</text>
      </svg>
      <figcaption className="eyebrow mt-2 flex items-center justify-center gap-2.5 text-muted">
        <span className={`size-2.5 rounded-full transition-colors ${c ? 'bg-squeeze' : 'bg-calm'}`} />
        {c ? 'Сжатие: вверх и внутрь' : 'Расслабление: гамак опускается'}
      </figcaption>
    </figure>
  );
}

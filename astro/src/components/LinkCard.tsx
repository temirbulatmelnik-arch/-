// Связка: узел карты в центре и планеты, которые сегодня его задевают, — мини-созвездие с прорисовкой линий.
import { motion } from 'motion/react';
import type { Link } from '../engine/synthesis';
import { ASPECT } from '../engine/aspects';
import { GLYPH, PCOLOR } from './glyphs';

const TONE = { pos: { c: 'var(--asp-soft)', w: 'поддержка' }, neg: { c: 'var(--asp-hard)', w: 'давление' }, mix: { c: 'var(--asp-conj)', w: 'плюс и минус' } };

export function LinkCard({ link, i }: { link: Link; i: number }) {
  const S = 112, C = S / 2, R = 40;
  const players = link.players.slice(0, 6);
  return (
    <motion.article initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.6, delay: i * 0.06, ease: [0.23, 1, 0.32, 1] }}
      className="oracle relative flex gap-3 overflow-hidden rounded-[24px] p-4">
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="shrink-0" aria-hidden="true">
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--line)" strokeDasharray="2 4" />
        {players.map((p, k) => {
          const a = (-90 + (k * 360) / players.length) * (Math.PI / 180);
          const x = C + Math.cos(a) * R, y = C + Math.sin(a) * R;
          const col = p.score >= 0 ? 'var(--asp-soft)' : 'var(--asp-hard)';
          return (
            <g key={k}>
              <motion.line x1={C} y1={C} x2={x} y2={y} stroke={col} strokeWidth="1.3" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 + k * 0.1 }} />
              <circle cx={x} cy={y} r="11" fill="var(--deep)" stroke={col} strokeOpacity=".6" />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="glyph" fontSize="12" fill={PCOLOR[p.t]}>{GLYPH[p.t]}</text>
              <text x={(C + x) / 2} y={(C + y) / 2} textAnchor="middle" dominantBaseline="central" className="glyph" fontSize="8" fill={col}>{ASPECT[p.aspect as 'conj'].glyph}</text>
            </g>
          );
        })}
        <circle cx={C} cy={C} r="15" fill={TONE[link.tone].c} fillOpacity=".22" className="pulse" style={{ transformOrigin: `${C}px ${C}px` }} />
        <circle cx={C} cy={C} r="5" fill={TONE[link.tone].c} />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold" style={{ color: TONE[link.tone].c }}>{TONE[link.tone].w}</p>
        <h3 className="serif text-[22px] leading-tight font-semibold">{link.config.name}</h3>
        <p className="text-[13.5px] leading-snug text-faint">{link.config.short}</p>
        <p className="mt-2 text-[15.5px] leading-relaxed">{link.text}</p>
      </div>
    </motion.article>
  );
}

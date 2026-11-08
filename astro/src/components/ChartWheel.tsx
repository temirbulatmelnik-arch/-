// Колесо карты (SVG): одиночное или би-колесо синастрии. Линии аспектов прорисовываются при открытии.
import { motion } from 'motion/react';
import type { PointId } from '../engine/core';
import type { Chart } from '../engine/chart';
import { ASPECT, aspectsWithin, natalOrb, synastryOrb } from '../engine/aspects';
import { natureOf } from '../content/compose';
import { ASPECT_COLOR, GLYPH, PCOLOR } from './glyphs';
import { arcPath, spread, toXY } from './geometry';

const SIGN_G = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const ELEM_FILL = ['rgba(255,140,110,.13)', 'rgba(140,200,120,.11)', 'rgba(242,211,138,.12)', 'rgba(130,180,255,.13)'];
const ELEM_TEXT = ['#ff9b7a', '#9fd18b', '#f2d38a', '#8fc6ff'];
const SHOW: PointId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'node', 'chiron', 'lilith', 'fortune', 'vertex'];

export function ChartWheel({ inner, outer, id }: { inner: Chart; outer?: Chart; id: string }) {
  const S = 380, C = S / 2;
  const asc = inner.houses.asc;
  const R0 = 186, R1 = 160, Rh = outer ? 100 : 118, Rp = outer ? 112 : 138, Ro = 146, Ra = outer ? 88 : 104;
  const pts = SHOW.map(p => ({ id: p, lon: inner.points[p].lon }));
  const shown = spread(pts, 7.5);
  const oPts = outer ? SHOW.map(p => ({ id: p, lon: outer.points[p].lon })) : [];
  const oShown = outer ? spread(oPts, 7.5) : {};
  const hits = outer ? aspectsWithin(inner.points, outer.points, synastryOrb, false) : aspectsWithin(inner.points, inner.points, natalOrb, true);
  const lines = hits.filter(h => SHOW.includes(h.a) && SHOW.includes(h.b) && ASPECT[h.aspect].id !== 'conj' && (ASPECT[h.aspect].major || h.orb < 1)).slice(0, 40);
  return (
    <svg key={id} viewBox={`-16 -16 ${S + 32} ${S + 32}`} className="mx-auto block w-full max-w-[420px]" role="img" aria-label="Колесо карты">
      {SIGN_G.map((g, i) => {
        const m = toXY(i * 30 + 15, asc, (R0 + R1) / 2, C, C);
        return (
          <g key={i}>
            <path d={arcPath(R1, R0, i * 30, i * 30 + 30, asc)} transform={`translate(${C} ${C})`} fill={ELEM_FILL[i % 4]} stroke="var(--line)" />
            <text x={m.x} y={m.y} textAnchor="middle" dominantBaseline="central" className="glyph" fontSize="14" fill={ELEM_TEXT[i % 4]}>{g}</text>
          </g>
        );
      })}
      <circle cx={C} cy={C} r={R1} fill="none" stroke="var(--brass)" strokeOpacity=".6" />
      {outer && <circle cx={C} cy={C} r={Ro - 14} fill="none" stroke="var(--line)" />}
      <circle cx={C} cy={C} r={Ra} fill="var(--dial-in)" stroke="var(--line)" />
      {inner.houses.cusps.map((c, i) => {
        const a = toXY(c, asc, Ra, C, C), b = toXY(c, asc, R1, C, C);
        const ang = i % 3 === 0;
        const n = toXY(c + 4, asc, Ra + 8, C, C);
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ang ? 'var(--brass)' : 'var(--line)'} strokeWidth={ang ? 1.4 : 0.8} />
            <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" fontSize="7.5" fill="var(--faint)" fontFamily="var(--font-sans)">{i + 1}</text>
          </g>
        );
      })}
      {lines.map((h, i) => {
        const a = toXY(inner.points[h.a].lon, asc, Ra, C, C);
        const b = toXY((outer ?? inner).points[h.b].lon, asc, Ra, C, C);
        return <motion.line key={`${id}${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ASPECT_COLOR[natureOf(h.aspect)]} strokeWidth={ASPECT[h.aspect].major ? 0.9 : 0.5} strokeDasharray={ASPECT[h.aspect].major ? undefined : '2 2'}
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.75 }} transition={{ duration: 0.8, delay: 0.15 + i * 0.025, ease: [0.23, 1, 0.32, 1] }} />;
      })}
      {pts.map(p => {
        const q = toXY(shown[p.id], asc, outer ? Rh : Rp, C, C);
        const t = toXY(p.lon, asc, R1, C, C), t2 = toXY(p.lon, asc, R1 - 5, C, C);
        return (
          <g key={p.id}>
            <line x1={t.x} y1={t.y} x2={t2.x} y2={t2.y} stroke={PCOLOR[p.id]} strokeWidth="1.2" />
            <text x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" className="glyph" fontSize="14" fill={PCOLOR[p.id]}>{GLYPH[p.id]}</text>
          </g>
        );
      })}
      {outer && oPts.map(p => {
        const q = toXY((oShown as Record<string, number>)[p.id], asc, Ro, C, C);
        return <text key={'o' + p.id} x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" className="glyph" fontSize="13" fill={PCOLOR[p.id]} opacity="0.85" style={{ filter: 'drop-shadow(0 0 3px rgba(143,168,255,.7))' }}>{GLYPH[p.id]}</text>;
      })}
      {[['Asc', inner.houses.asc], ['MC', inner.houses.mc]].map(([l, v]) => {
        const p = toXY(v as number, asc, R0 + 9, C, C);
        return <text key={l as string} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize="10" fill="var(--brass)" fontWeight="700" fontFamily="var(--font-sans)">{l}</text>;
      })}
    </svg>
  );
}

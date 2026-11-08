// Астролябия — главный образ «Сегодня»: латунное кольцо зодиака, натальная карта внутри, небо дня по кругу.
// Планеты дня плавно переезжают на новые места при смене даты; линии аспектов к натальным точкам прорисовываются.
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { diff, type PointId } from '../engine/core';
import type { Chart } from '../engine/chart';
import type { TransitCard } from '../engine/day';
import { natureOf } from '../content/compose';
import { ASPECT_COLOR, GLYPH, PCOLOR } from './glyphs';
import { spread, toXY } from './geometry';
import { MoonDisc } from './MoonDisc';
import { celestial } from './motion';

const SIGN_G = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const ELEMENT = ['#ff9b7a', '#9fd18b', '#f2d38a', '#8fc6ff'];
const S = 360, C = S / 2;
const R_OUT = 172, R_SIGN = 150, R_TR = 128, R_NAT = 92, R_IN = 74;

function Planet({ id, lon, shown, asc, retro }: { id: PointId; lon: number; shown: number; asc: number; retro: boolean }) {
  const mv = useMotionValue(shown);
  useEffect(() => {
    const from = mv.get();
    const ctrl = animate(mv, from + diff(from, shown), celestial);
    return () => ctrl.stop();
  }, [shown, mv]);
  const x = useTransform(mv, v => toXY(v, asc, R_TR, C, C).x);
  const y = useTransform(mv, v => toXY(v, asc, R_TR, C, C).y);
  const real = toXY(lon, asc, R_SIGN - 9, C, C);
  return (
    <g>
      <motion.circle initial={false} animate={{ cx: real.x, cy: real.y }} transition={celestial} r="2.4" fill={PCOLOR[id]} />
      <motion.g style={{ x, y }}>
        <circle r="13" fill="var(--deep)" opacity="0.72" />
        <circle r="13" fill="none" stroke={PCOLOR[id]} strokeOpacity="0.35" strokeWidth="0.8" />
        <text textAnchor="middle" dominantBaseline="central" className="glyph" fontSize="15" fill={PCOLOR[id]}>{GLYPH[id]}</text>
        {retro && <text x="9" y="9" fontSize="7.5" fill={PCOLOR[id]} fontFamily="var(--font-sans)">R</text>}
      </motion.g>
    </g>
  );
}

export function Astrolabe({ natal, sky, transits, moonPhase, dateKey }: { natal: Chart; sky: { id: PointId; lon: number; retro: boolean }[]; transits: TransitCard[]; moonPhase: number; dateKey: string }) {
  const asc = natal.houses.asc;
  const shownSky = spread(sky.map(s => ({ id: s.id, lon: s.lon })), 9.5);
  const natPts = (['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'node', 'chiron', 'lilith'] as PointId[]).map(id => ({ id, lon: natal.points[id].lon }));
  const shownNat = spread(natPts, 8);
  const lines = transits.filter(t => t.t !== 'node' && natal.points[t.n]).slice(0, 7);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto block w-full max-w-[380px] select-none overflow-visible" role="img" aria-label="Небо дня поверх натальной карты">
      <defs>
        <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dea6" /><stop offset="0.5" stopColor="var(--brass)" /><stop offset="1" stopColor="#9b7330" />
        </linearGradient>
        <radialGradient id="dial" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="var(--dial-a)" /><stop offset="1" stopColor="var(--dial-b)" />
        </radialGradient>
      </defs>
      {/* вращающаяся «паутина» астролябии — едва заметная, 4 минуты на оборот */}
      <g style={{ transformOrigin: `${C}px ${C}px`, animation: 'spin-slow 240s linear infinite' }} opacity="0.35">
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i * 15 * Math.PI) / 180;
          return <line key={i} x1={C + Math.cos(a) * R_IN} y1={C + Math.sin(a) * R_IN} x2={C + Math.cos(a) * (R_OUT + 6)} y2={C + Math.sin(a) * (R_OUT + 6)} stroke="url(#brass)" strokeWidth="0.3" />;
        })}
        <circle cx={C} cy={C} r={R_OUT + 6} fill="none" stroke="url(#brass)" strokeWidth="0.5" strokeDasharray="1 5" />
      </g>
      <circle cx={C} cy={C} r={R_OUT} fill="url(#dial)" stroke="url(#brass)" strokeWidth="2.2" />
      <circle cx={C} cy={C} r={R_SIGN - 12} fill="none" stroke="url(#brass)" strokeWidth="1" opacity="0.8" />
      {/* знаки и градусная шкала */}
      {SIGN_G.map((g, i) => {
        const a = toXY(i * 30, asc, R_OUT, C, C), b = toXY(i * 30, asc, R_SIGN - 12, C, C);
        const m = toXY(i * 30 + 15, asc, (R_OUT + R_SIGN - 12) / 2, C, C);
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="url(#brass)" strokeWidth="0.9" />
            <text x={m.x} y={m.y} textAnchor="middle" dominantBaseline="central" className="glyph" fontSize="15" fill={ELEMENT[i % 4]} opacity="0.95">{g}</text>
          </g>
        );
      })}
      {Array.from({ length: 72 }, (_, i) => {
        const a = toXY(i * 5, asc, R_SIGN - 12, C, C), b = toXY(i * 5, asc, R_SIGN - (i % 2 ? 15 : 18), C, C);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--brass)" strokeWidth="0.6" opacity="0.6" />;
      })}
      {/* натальная карта: куспиды и точки */}
      <circle cx={C} cy={C} r={R_IN} fill="var(--dial-in)" stroke="var(--line)" />
      {natal.houses.cusps.map((c, i) => {
        const a = toXY(c, asc, R_IN, C, C), b = toXY(c, asc, R_SIGN - 18, C, C);
        const angle = i % 3 === 0;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={angle ? 'var(--brass)' : 'var(--line)'} strokeWidth={angle ? 1.2 : 0.7} opacity={angle ? 0.9 : 1} />;
      })}
      {natPts.map(p => {
        const q = toXY(shownNat[p.id], asc, R_NAT + 9, C, C);
        return <text key={p.id} x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" className="glyph" fontSize="10.5" fill={PCOLOR[p.id]} opacity="0.7">{GLYPH[p.id]}</text>;
      })}
      {/* аспекты дня: от планеты на небе к натальной точке */}
      <g key={dateKey}>
        {lines.map((t, i) => {
          const sk = sky.find(s => s.id === t.t);
          if (!sk) return null;
          const a = toXY(sk.lon, asc, R_SIGN - 20, C, C);
          const b = toXY(natal.points[t.n].lon, asc, R_IN, C, C);
          const col = ASPECT_COLOR[natureOf(t.aspect)];
          return <motion.line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={0.6 + t.strength * 0.8} strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.8 }} transition={{ duration: 0.9, delay: 0.3 + i * 0.08, ease: [0.23, 1, 0.32, 1] }} />;
        })}
      </g>
      {/* Асцендент и MC */}
      {[['Asc', asc], ['MC', natal.houses.mc]].map(([l, v]) => {
        const p = toXY(v as number, asc, R_IN - 11, C, C);
        return <text key={l as string} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize="8.5" fill="var(--brass)" fontFamily="var(--font-sans)" fontWeight="700">{l}</text>;
      })}
      {sky.map(s => <Planet key={s.id} id={s.id} lon={s.lon} shown={shownSky[s.id]} asc={asc} retro={s.retro} />)}
      <MoonDisc phase={moonPhase} size={60} x={C - 30} y={C - 30} />
    </svg>
  );
}

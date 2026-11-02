// «План и факт» — крупно и по делу: сверху одной фразой, где вы относительно плана; ниже линии плана, факта, прогноза
// и «только минималки». По умолчанию — ближайший год (видно, что происходит сейчас), переключатель — весь план.
// Ведите пальцем по графику — сверху значения месяца.
import { motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { addMonths, monthKey, monthName, monthShort, monthsBetween } from '../domain/dates';
import { rub, rubShort } from '../domain/money';
import { haptic } from './haptics';
import { ease, spring } from './motion';
import { Money } from './ui';

type Series = [string, number][];

const W = 360, H = 250, PAD = { l: 52, r: 12, t: 14, b: 30 };

/** Значение ряда в месяце: точное или линейная интерполяция между соседними точками */
function valueAt(s: Series, m: string): number | null {
  if (!s.length || m < s[0][0] || m > s[s.length - 1][0]) return null;
  const i = s.findIndex(p => p[0] >= m);
  if (s[i][0] === m) return s[i][1];
  const [a, b] = [s[i - 1], s[i]];
  const t = monthsBetween(a[0], m) / monthsBetween(a[0], b[0]);
  return a[1] + (b[1] - a[1]) * t;
}

/** Ряд, обрезанный по окну месяцев, с точками на краях окна */
function clip(s: Series, from: string, to: string): Series {
  const inside = s.filter(p => p[0] >= from && p[0] <= to);
  const a = valueAt(s, from), b = valueAt(s, to);
  if (a != null && inside[0]?.[0] !== from) inside.unshift([from, a]);
  if (b != null && inside.at(-1)?.[0] !== to) inside.push([to, b]);
  return inside;
}

export function DebtChart({ plan, fact, forecast, baseline }: { plan: Series; fact: Series; forecast: Series; baseline: Series }) {
  const [range, setRange] = useState<'year' | 'all'>('year');
  const first = [plan[0]?.[0], fact[0]?.[0]].filter(Boolean).sort()[0] ?? fact[0][0];
  const last = [plan.at(-1)?.[0], forecast.at(-1)?.[0], fact.at(-1)?.[0]].filter(Boolean).sort().at(-1)!;
  const now = fact.at(-1)?.[0] ?? monthKey(new Date().toISOString());
  const start = range === 'year' ? (fact[0]?.[0] && monthsBetween(fact[0][0], now) <= 3 ? fact[0][0] : addMonths(now, -3)) : first;
  const end = range === 'year' ? addMonths(start, 12) : last;
  const n = Math.max(1, monthsBetween(start, end));
  const months = useMemo(() => Array.from({ length: n + 1 }, (_, i) => addMonths(start, i)), [start, n]);
  const S = useMemo(() => ({ plan: clip(plan, start, end), fact: clip(fact, start, end), forecast: clip(forecast, start, end), base: clip(baseline, start, end) }), [plan, fact, forecast, baseline, start, end]);
  const vals = [...S.plan, ...S.fact, ...S.forecast, ...S.base].map(p => p[1]);
  const max = Math.max(...vals, 1), min = range === 'year' ? Math.max(0, Math.min(...vals) * 0.96) : 0;
  const x = (m: string) => PAD.l + (monthsBetween(start, m) / n) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);
  const path = (s: Series) => s.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');

  const [hover, setHover] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width * W - PAD.l) / (W - PAD.l - PAD.r);
    const m = months[Math.round(Math.min(1, Math.max(0, t)) * n)];
    if (m !== hover) { setHover(m); haptic(); }
  };

  // главное одной фразой: факт против плана в последнем известном месяце
  const factNow = fact.at(-1)?.[1];
  const planNow = fact.length ? valueAt(plan, fact.at(-1)![0]) : null;
  const diff = factNow != null && planNow != null ? factNow - planNow : null;

  const step = range === 'year' ? 3 : 12;
  const ticks = months.filter((m, i) => (range === 'year' ? i % step === 0 : m.endsWith('-01') && monthsBetween(start, m) >= 3) || m === start);
  const grid = [0, 0.5, 1].map(f => min + (max - min) * f);
  const shown = hover ?? now;
  const rows = [
    { name: 'План', color: 'var(--chart-plan)', v: valueAt(plan, shown) },
    { name: fact.some(f => f[0] === shown) ? 'Факт' : 'Прогноз', color: 'var(--chart-fact)', v: valueAt(fact, shown) ?? valueAt(forecast, shown) },
    { name: 'Только минималки', color: 'var(--chart-base)', v: valueAt(baseline, shown) },
  ].filter(r => r.v != null);

  return (
    <div>
      {diff != null && (
        <p className={`mb-3 text-[15px] leading-snug ${diff <= 0 ? 'text-pos' : 'text-warn'}`}>
          {Math.abs(diff) < 1000 ? 'Идёте точно по плану.' : diff < 0 ? <>Долг на <Money value={-diff} className="font-semibold" /> меньше, чем по плану, — вы впереди.</> : <>Долг на <Money value={diff} className="font-semibold" /> больше, чем по плану.</>}
        </p>
      )}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex rounded-[12px] bg-surface-2 p-[3px] text-[13px] font-medium" role="tablist">
          {(['year', 'all'] as const).map(r => (
            <button key={r} type="button" role="tab" aria-selected={range === r} onClick={() => { setRange(r); setHover(null); }}
              className={`relative rounded-[9px] px-3.5 py-1.5 ${range === r ? 'text-ink' : 'text-muted'}`}>
              {range === r && <motion.span layoutId="debt-range" className="absolute inset-0 rounded-[9px] bg-surface shadow-[0_1px_3px_rgba(10,36,51,.12)]" transition={spring} />}
              <span className="relative">{r === 'year' ? 'Год' : 'Весь план'}</span>
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-muted first-letter:uppercase">{monthName(shown)}</span>
      </div>
      {/* значения месяца под пальцем — крупно, над графиком, чтобы палец их не закрывал */}
      <div className="mb-2 grid grid-cols-3 gap-2">
        {rows.map(r => (
          <div key={r.name} className="min-w-0 rounded-[14px] bg-surface-2/70 px-2.5 py-2">
            <div className="flex items-center gap-1.5 truncate text-[11.5px] text-muted"><span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />{r.name}</div>
            <div className="font-display mt-0.5 truncate text-[14.5px] font-medium">{rubShort(r.v!)}</div>
          </div>
        ))}
      </div>
      <div className="relative" data-noswipe>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img"
          aria-label={`Общий долг: план ${rubShort(plan.at(-1)?.[1] ?? 0)} к ${monthName(last)}, сейчас ${rubShort(factNow ?? 0)}`}
          onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); onMove(e); }} onPointerMove={e => (e.buttons || e.pointerType === 'mouse' ? onMove(e) : undefined)}>
          {grid.map(v => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--muted)" style={{ fontFamily: 'var(--font-sans)' }}>{rubShort(v)}</text>
            </g>
          ))}
          {ticks.map(m => <text key={m} x={x(m)} y={H - 8} fontSize={12} textAnchor={m === start ? 'start' : 'middle'} fill="var(--muted)" style={{ fontFamily: 'var(--font-sans)' }}>{monthShort(m)}</text>)}
          <motion.g key={range} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: ease.out }}>
            <path d={path(S.base)} fill="none" stroke="var(--chart-base)" strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" />
            <path d={path(S.plan)} fill="none" stroke="var(--chart-plan)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            <path d={path(S.forecast)} fill="none" stroke="var(--chart-fact)" strokeWidth={2.5} strokeDasharray="6 5" strokeLinecap="round" opacity={0.85} />
            <motion.path d={path(S.fact)} fill="none" stroke="var(--chart-fact)" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: ease.out, delay: 0.1 }} />
            {S.fact.filter(p => fact.some(f => f[0] === p[0])).map(p => <circle key={p[0]} cx={x(p[0])} cy={y(p[1])} r={4.5} fill="var(--chart-fact)" stroke="var(--surface)" strokeWidth={2} />)}
          </motion.g>
          <line x1={x(shown)} x2={x(shown)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3" />
          {rows.map(r => <circle key={r.name} cx={x(shown)} cy={y(r.v!)} r={4} fill={r.color} stroke="var(--surface)" strokeWidth={1.5} />)}
        </svg>
      </div>
      <p className="mt-1 text-[12px] text-faint">Ведите пальцем по графику — значения месяца сверху. Пунктир серый — если платить только минимальные платежи.</p>
      <span className="sr-only">{rows.map(r => `${r.name}: ${rub(r.v!)}`).join(', ')}</span>
    </div>
  );
}

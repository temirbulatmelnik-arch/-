// График общего долга: план, факт, прогноз при текущих суммах и «как сейчас» (только минималки).
// Касание или ведение пальцем показывает значения за месяц.
import { useMemo, useRef, useState } from 'react';
import { addMonths, monthName, monthShort, monthsBetween } from '../domain/dates';
import { rub, rubShort } from '../domain/money';

type Series = [string, number][];

const W = 340, H = 190, PAD = { l: 8, r: 8, t: 12, b: 22 };

/** Значение ряда в месяце: точное или линейная интерполяция между соседними точками */
function valueAt(s: Series, m: string): number | null {
  if (!s.length || m < s[0][0] || m > s[s.length - 1][0]) return null;
  const i = s.findIndex(p => p[0] >= m);
  if (s[i][0] === m) return s[i][1];
  const [a, b] = [s[i - 1], s[i]];
  const t = monthsBetween(a[0], m) / monthsBetween(a[0], b[0]);
  return a[1] + (b[1] - a[1]) * t;
}

export function DebtChart({ plan, fact, forecast, baseline }: { plan: Series; fact: Series; forecast: Series; baseline: Series }) {
  const start = [plan[0]?.[0], fact[0]?.[0]].filter(Boolean).sort()[0] ?? fact[0][0];
  const end = [plan.at(-1)?.[0], forecast.at(-1)?.[0], fact.at(-1)?.[0]].filter(Boolean).sort().at(-1)!;
  const n = Math.max(1, monthsBetween(start, end));
  const months = useMemo(() => Array.from({ length: n + 1 }, (_, i) => addMonths(start, i)), [start, n]);
  const max = Math.max(...plan.map(p => p[1]), ...fact.map(p => p[1]), ...baseline.map(p => p[1]), 1);
  const x = (m: string) => PAD.l + (monthsBetween(start, m) / n) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const path = (s: Series) => s.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const baseLine: Series = months.map(m => [m, valueAt(baseline, m)] as [string, number | null]).filter((p): p is [string, number] => p[1] != null);

  const [hover, setHover] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width * W - PAD.l) / (W - PAD.l - PAD.r);
    setHover(months[Math.round(Math.min(1, Math.max(0, t)) * n)]);
  };

  // подписи оси: начало и январи (январь вплотную к началу не подписываем — налезет)
  const ticks = months.filter(m => m === start || (m.endsWith('-01') && monthsBetween(start, m) >= 3));
  const rows = hover ? [
    { name: 'План', color: 'var(--chart-plan)', v: valueAt(plan, hover) },
    { name: 'Факт', color: 'var(--chart-fact)', v: valueAt(fact, hover) },
    { name: 'Прогноз', color: 'var(--chart-fact)', v: fact.some(f => f[0] === hover) ? null : valueAt(forecast, hover) },
    { name: 'Как сейчас', color: 'var(--chart-base)', v: valueAt(baseLine, hover) },
  ].filter(r => r.v != null) : [];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold text-muted">
        <Legend color="var(--chart-plan)">План</Legend>
        <Legend color="var(--chart-fact)">Факт</Legend>
        <Legend color="var(--chart-fact)" dashed>Прогноз</Legend>
        <Legend color="var(--chart-base)" dashed>Только минималки</Legend>
      </div>
      <div className="relative">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img"
          aria-label={`Общий долг: план ${rubShort(plan.at(-1)?.[1] ?? 0)} к ${end}, сейчас ${rubShort(fact.at(-1)?.[1] ?? 0)}`}
          onPointerDown={onMove} onPointerMove={e => e.buttons || e.pointerType === 'mouse' ? onMove(e) : undefined} onPointerLeave={() => setHover(null)}>
          {[0.25, 0.5, 0.75, 1].map(f => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth={1} />
              <text x={W - PAD.r} y={y(max * f) - 3} textAnchor="end" fontSize={9.5} fill="var(--faint)">{rubShort(max * f)}</text>
            </g>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth={1.5} />
          {ticks.map(m => <text key={m} x={x(m)} y={H - 6} fontSize={9.5} textAnchor={m === start ? 'start' : 'middle'} fill="var(--faint)">{monthShort(m)}</text>)}
          <path d={path(baseLine)} fill="none" stroke="var(--chart-base)" strokeWidth={1.5} strokeDasharray="4 4" />
          <path d={path(plan)} fill="none" stroke="var(--chart-plan)" strokeWidth={2} strokeLinejoin="round" />
          <path d={path(forecast)} fill="none" stroke="var(--chart-fact)" strokeWidth={2} strokeDasharray="5 4" opacity={0.8} />
          <path d={path(fact)} fill="none" stroke="var(--chart-fact)" strokeWidth={2.5} strokeLinejoin="round" />
          {fact.map(p => <circle key={p[0]} cx={x(p[0])} cy={y(p[1])} r={3.5} fill="var(--chart-fact)" stroke="var(--surface)" strokeWidth={2} />)}
          {hover && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} stroke="var(--muted)" strokeWidth={1} />}
        </svg>
        {hover && rows.length > 0 && (
          <div className="pointer-events-none absolute top-0 rounded-xl bg-ink px-3 py-2 text-[12px] text-bg shadow-lg"
            style={{ left: x(hover) / W > 0.55 ? undefined : `${(x(hover) / W) * 100 + 3}%`, right: x(hover) / W > 0.55 ? `${(1 - x(hover) / W) * 100 + 3}%` : undefined }}>
            <div className="mb-1 font-bold capitalize">{monthName(hover)}</div>
            {rows.map(r => <div key={r.name} className="flex justify-between gap-3"><span className="opacity-75">{r.name}</span><b>{rub(r.v!)}</b></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, dashed, children }: { color: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="18" height="6" aria-hidden><line x1="1" x2="17" y1="3" y2="3" stroke={color} strokeWidth={2.5} strokeDasharray={dashed ? '4 3' : undefined} strokeLinecap="round" /></svg>
      {children}
    </span>
  );
}

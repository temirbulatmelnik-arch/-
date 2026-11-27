import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChartNoAxesCombined, Grid2X2, Navigation, OctagonAlert, ShieldCheck, Waves } from 'lucide-react';
import { useId, useMemo, useState, type PointerEvent } from 'react';
import { reserveByDay, type Coverage } from '../domain/coverage';
import { coverageDayDetails } from '../domain/financialView';
import { addDays, dayMonth, ddmm } from '../domain/dates';
import { useUi } from '../store/ui';
import { useCoverage } from '../components/Coverage';
import { Money, Sheet } from '../components/ui';
import { Glyph, IconLabel, Jump } from './Visuals';

const horizons = [14, 30, 60];
const scenarios = [
  { id: 'base', text: 'Базовый', icon: Navigation },
  { id: 'cautious', text: 'Осторожный', icon: ShieldCheck },
  { id: 'stress', text: 'Стресс', icon: OctagonAlert },
] as const;

export function TideChart({ coverage, days, interactive = true }: { coverage: Coverage; days: number; interactive?: boolean }) {
  const id = useId();
  const [picked, select] = useState<number | null>(null);
  const series = useMemo(() => {
    const map = reserveByDay(coverage, coverage.from, addDays(coverage.from, days));
    return Object.entries(map).flatMap(([date, value]) => value == null ? [] : [{ date, value }]);
  }, [coverage, days]);
  if (!series.length) return null;
  const { minIndex, min, max } = series.reduce((prev, { value }, index) => ({
    minIndex: value < series[prev.minIndex].value ? index : prev.minIndex,
    min: Math.min(value, prev.min), max: Math.max(value, prev.max),
  }), { minIndex: 0, min: 0, max: 1 });
  const active = Math.min(series.length - 1, picked ?? minIndex);
  const current = series[active];
  const detail = coverageDayDetails(coverage, current.date);
  const steps = coverage.steps.filter(s => s.date === current.date);
  const width = 340, start = 12, span = width - start * 2, top = 12, bottom = 126;
  const x = (i: number) => start + i / Math.max(1, series.length - 1) * span;
  const y = (v: number) => top + (max - v) / Math.max(1, max - min) * (bottom - top);
  const line = series.map(({ value }, i) => i ? `H${x(i)}V${y(value)}` : `M${x(i)} ${y(value)}`).join('');
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const index = Math.round(((e.clientX - rect.left) / rect.width * width - start) / span * (series.length - 1));
    select(Math.min(series.length - 1, Math.max(0, index)));
  };
  return <>
    <div className="nv-chart-value" aria-live={interactive ? 'polite' : 'off'}>
      <div><IconLabel icon={CalendarDays}>{dayMonth(current.date)}</IconLabel>
        <strong className="nv-chart-money" data-negative={current.value < 0}><Money value={current.value} kopecks /></strong>
      </div>
      {detail && <div className="nv-floor"><Waves size={14} aria-hidden="true" /> Мин. за день <Money value={detail.low} kopecks /></div>}
    </div>
    <div className="nv-plot" role={interactive ? 'slider' : undefined} tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? 'Дата прогноза резерва' : undefined}
      aria-valuemin={interactive ? 0 : undefined} aria-valuemax={interactive ? series.length - 1 : undefined}
      aria-valuenow={interactive ? active : undefined} aria-valuetext={interactive ? `${dayMonth(current.date)}, ${current.value} рублей` : undefined}
      onPointerDown={interactive ? e => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e); } : undefined}
      onPointerMove={interactive ? e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e); } : undefined}
      onKeyDown={interactive ? e => {
        const next = { ArrowLeft: active - 1, ArrowDown: active - 1, ArrowRight: active + 1, ArrowUp: active + 1, Home: 0, End: series.length - 1 }[e.key];
        if (next !== undefined) { e.preventDefault(); select(Math.min(series.length - 1, Math.max(0, next))); }
      } : undefined}>
      <svg viewBox={`0 0 ${width} 151`} className="nv-plot-svg" aria-hidden="true">
        <defs>
          <linearGradient id={id + 'sea'} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--nv-aqua)" stopOpacity=".46"/><stop offset="1" stopColor="var(--nv-aqua)" stopOpacity=".02" />
          </linearGradient>
          <clipPath id={id + 'below'}><rect x="0" y={y(0)} width={width} height={151-y(0)} /></clipPath>
        </defs>
        {[top, (top + bottom) / 2, bottom].map(pos => <path key={pos} d={`M0 ${pos}H${width}`} className="nv-plot-guide" />)}
        <path d={`M0 ${y(0)}H${width}`} className="nv-plot-zero" />
        <path d={line + `V${y(0)}H${x(0)}Z`} fill={`url(#${id}sea)`} />
        <path d={line} fill="none" stroke="var(--nv-aqua)" strokeWidth="2.2" strokeLinejoin="round" />
        <path d={line} fill="none" stroke="var(--neg)" strokeWidth="2.5" clipPath={`url(#${id}below)`} />
        <path d={`M${x(active)} 8V131`} stroke="var(--nv-amber)" strokeWidth="1" strokeDasharray="2 3" />
        <circle cx={x(active)} cy={y(current.value)} r="10" fill="var(--nv-amber)" opacity=".22" />
        <circle cx={x(active)} cy={y(current.value)} r="4.5" fill="var(--nv-amber)" stroke="var(--surface)" strokeWidth="2" />
        <text x={start} y="146" textAnchor="start">{ddmm(series[0].date)}</text>
        <text x={width / 2} y="146" textAnchor="middle">{ddmm(series[Math.floor((series.length-1)/2)].date)}</text>
        <text x={width - start} y="146" textAnchor="end">{ddmm(series.at(-1)!.date)}</text>
      </svg>
    </div>
    {!!steps.length && <div className="nv-chart-events" aria-label="Движение за день">
      {steps.slice(0,2).map((s,i) => <span key={s.key ?? i} className="nv-line">
        <Glyph icon={s.delta >= 0 ? ArrowDownLeft : ArrowUpRight} tone={s.delta >= 0 ? 'aqua' : 'amber'} size={14}/>
        <span>{s.title}</span><Money value={s.delta} kopecks />
      </span>)}
    </div>}
  </>;
}

export function ForecastCard() {
  const { cov } = useCoverage();
  const scenario = useUi(s => s.scenario);
  const set = useUi(s => s.set);
  const go = useUi(s => s.setTab);
  const [days, setDays] = useState(30);
  const [table, showTable] = useState(false);
  const points = useMemo(() => Object.entries(reserveByDay(cov, cov.from, addDays(cov.from, days))).filter((row): row is [string, number] => row[1] !== null),
    [cov, days]);
  const reason = cov.shortage ?? cov.accountRisk ?? cov.bufferRisk;
  return <section className="nv-forecast nv-glass" aria-label="Прогноз денег">
    <header className="nv-widget-head"><IconLabel icon={ChartNoAxesCombined}>Прогноз денег</IconLabel>
      <button type="button" className="nv-iconbtn nv-press" onClick={() => showTable(true)} aria-label="Таблица прогноза"><Grid2X2 size={17} /></button>
    </header>
    <div className="nv-switch nv-switch-scenarios" aria-label="Сценарий">
      {scenarios.map(({id, icon: Icon, text}) => <button type="button" key={id} className="nv-press" aria-pressed={scenario === id}
        onClick={() => set({ scenario: id })}><Icon size={16} aria-hidden="true" /><span>{text}</span></button>)}
    </div>
    <TideChart key={scenario + days} coverage={cov} days={days} />
    <div className="nv-switch nv-switch-horizons" aria-label="Горизонт прогноза">
      {horizons.map(h => <button type="button" key={h} aria-pressed={h === days} onClick={() => setDays(h)}>{h} дней</button>)}
    </div>
    {reason && <div className="nv-forecast-jump">
      <Jump icon={OctagonAlert} tone="amber" label={cov.shortage ? 'Первый кассовый разрыв' : cov.accountRisk ? 'Риск по счёту' : 'Резерв ниже запаса'}
        onClick={() => { go('payments'); set({ payView: 'cover' }); }}>
        {dayMonth(reason.date)}{'title' in reason ? ` · ${reason.title}` : ''}
      </Jump>
    </div>}
    <Sheet open={table} title="Точки прогноза" onClose={() => showTable(false)}>
      <table className="nv-table"><thead><tr><th>День</th><th>Мин. за день</th><th>К вечеру</th></tr></thead>
        <tbody>{points.map(([date, value]) => <tr key={date}><td>{dayMonth(date)}</td><td><Money value={coverageDayDetails(cov, date)?.low ?? value} kopecks /></td><td><Money value={value} kopecks /></td></tr>)}</tbody>
      </table>
    </Sheet>
  </section>;
}

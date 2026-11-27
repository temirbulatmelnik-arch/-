import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChartNoAxesCombined, Grid2X2, Navigation, OctagonAlert, ShieldCheck, Waves } from 'lucide-react';
import { useId, useMemo, useState, type PointerEvent } from 'react';
import { reserveByDay, type Coverage } from '../domain/coverage';
import { coverageDayDetails, SCENARIO_LABEL } from '../domain/financialView';
import { addDays, dayMonth, ddmm } from '../domain/dates';
import { useUi } from '../store/ui';
import { useCoverage } from '../components/Coverage';
import { Money, Sheet } from '../components/ui';
import { ActionArrow, Glyph, IconLabel } from './Visuals';

const horizons = [14, 30, 60];
const scenarios = [
  { id: 'base', text: 'Базовый', icon: Navigation },
  { id: 'cautious', text: 'Осторожный', icon: ShieldCheck },
  { id: 'stress', text: 'Стресс', icon: OctagonAlert },
] as const;

export function TideChart({ coverage, days, interactive = true, flow = false }: { coverage: Coverage; days: number; interactive?: boolean; flow?: boolean }) {
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
  const blue = flow ? 'var(--nf-accent)' : 'var(--nv-aqua)';
  const red = flow ? 'var(--nf-warn)' : 'var(--neg)';
  const visibleZero = !flow || min < 0;
  return <>
    <div className="nv-chart-value" aria-live={interactive ? 'polite' : 'off'}>
      <div><IconLabel icon={CalendarDays}>{dayMonth(current.date)}</IconLabel>
        <strong className="nv-chart-money" data-negative={current.value < 0}><Money value={current.value} kopecks className={flow ? "nf-exact" : undefined} /></strong>
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
            <stop stopColor={blue} stopOpacity={flow ? ".18" : ".46"}/><stop offset="1" stopColor={blue} stopOpacity=".02" />
          </linearGradient>
          <clipPath id={id + 'below'}><rect x="0" y={y(0)} width={width} height={151-y(0)} /></clipPath>
        </defs>
        {[top, (top + bottom) / 2, bottom].map(pos => <path key={pos} d={`M0 ${pos}H${width}`} className="nv-plot-guide" />)}
        {flow && min < 0 && <rect x="0" y={y(0)} width={width} height={bottom-y(0)} fill="var(--nf-warn-bg)" />}
        <path d={line + `V${y(0)}H${x(0)}Z`} fill={`url(#${id}sea)`} />
        {visibleZero && <path d={`M0 ${y(0)}H${width}`} className="nv-plot-zero" />}
        <path d={line} fill="none" stroke={blue} strokeWidth="2.2" strokeLinejoin="round" />
        <path d={line} fill="none" stroke={red} strokeWidth="2.5" clipPath={`url(#${id}below)`} />
        <path d={`M${x(active)} 8V131`} stroke="var(--nv-amber)" strokeWidth="1" strokeDasharray="2 3" />
        <circle cx={x(active)} cy={y(current.value)} r="10" fill="var(--nv-amber)" opacity=".22" />
        <circle cx={x(active)} cy={y(current.value)} r="4.5" fill="var(--nv-amber)" stroke="var(--surface)" strokeWidth="2" />
        {flow && min < 0 && <text x={start} y={Math.max(11, y(0) - 3)}>0 ₽</text>}
        <text x={start} y="146" textAnchor="start">{ddmm(series[0].date)}</text>
        <text x={width / 2} y="146" textAnchor="middle">{ddmm(series[Math.floor((series.length-1)/2)].date)}</text>
        <text x={width - start} y="146" textAnchor="end">{ddmm(series.at(-1)!.date)}</text>
      </svg>
    </div>
    {flow && <p className="nf-axis-note">На конец дня · шкала от <Money value={min} kopecks /> до <Money value={max} kopecks /></p>}
    {!!steps.length && <div className="nv-chart-events" aria-label="Движение за день">
      {(flow ? steps : steps.slice(0,2)).map((s,i) => <span key={s.key ?? i} className="nv-line">
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
  const route = () => { go('payments'); set({ payView: 'cover' }); };
  return <section className="nf-panel nf-chart" aria-label="Прогноз денег">
    <header className="nf-head"><h2><IconLabel icon={ChartNoAxesCombined}>Прогноз денег</IconLabel></h2>
      <button type="button" className="nv-iconbtn nf-press" onClick={() => showTable(true)} aria-label="Таблица прогноза"><Grid2X2 size={17} /></button>
    </header>
    <div className="nv-switch nv-switch-scenarios" role="group" aria-label="Сценарий">
      {scenarios.map(({id, icon: Icon, text}) => <button type="button" key={id} className="nf-press" aria-pressed={scenario === id}
        onClick={() => set({ scenario: id })}><Icon size={16} aria-hidden="true" /><span>{text}</span></button>)}
    </div>
    <RiskSummary cov={cov} scenario={scenario} onOpen={route} />
    <div className="nv-switch nv-switch-horizons" role="group" aria-label="Горизонт прогноза">
      {horizons.map(h => <button type="button" key={h} className="nf-press" aria-pressed={h === days} onClick={() => setDays(h)}>{h} дней</button>)}
    </div>
    <div className="nf-chart-body" key={scenario + days}><TideChart coverage={cov} days={days} flow /></div>
    <Sheet open={table} title="Точки прогноза" onClose={() => showTable(false)}>
      <table className="nv-table"><thead><tr><th>День</th><th>Мин. за день</th><th>К вечеру</th></tr></thead>
        <tbody>{points.map(([date, value]) => <tr key={date}><td>{dayMonth(date)}</td><td><Money value={coverageDayDetails(cov, date)?.low ?? value} kopecks /></td><td><Money value={value} kopecks /></td></tr>)}</tbody>
      </table>
    </Sheet>
  </section>;
}


function RiskSummary({ cov, scenario, onOpen }: { cov: Coverage; scenario: keyof typeof SCENARIO_LABEL; onOpen: () => void }) {
  const gap = cov.shortage;
  const account = cov.accountRisk;
  const buffer = cov.bufferRisk;
  if (!gap && !account && !buffer) return null;
  return <div className="nf-alert" aria-label="Риски по сценарию">
    <p className="nv-meta">{SCENARIO_LABEL[scenario]} · до {dayMonth(cov.to)}</p>
    {gap && <div>
      <h3>Первый кассовый разрыв · {dayMonth(gap.date)}</h3>
      <strong className="nf-alert-amount"><Money value={-gap.amount} kopecks className="nf-exact" /></strong>
      <p>{gap.title}</p>
      <p className="nv-meta">Максимальная нехватка <Money value={cov.maxShortfall} kopecks />{cov.min ? ` · ${dayMonth(cov.min.date)}` : ''}</p>
    </div>}
    {account && <p><strong>{account.reason === 'insufficient' ? 'Не хватает на счёте списания' : 'Нужно сверить счёт списания'}</strong>
      {' · '}{dayMonth(account.date)} · {account.title}
      {account.amount != null && <> · <Money value={account.amount} kopecks /></>}
    </p>}
    {buffer && <p><strong>Резерв ниже запаса</strong> · {dayMonth(buffer.date)} · не хватает <Money value={buffer.amount} kopecks /> до запаса</p>}
    <button type="button" className="nf-alert-button" onClick={onOpen}>Проверить остатки и обязательства <ActionArrow /></button>
  </div>;
}

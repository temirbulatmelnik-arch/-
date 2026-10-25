// Месяц на «Платежах»: каждый день наполняется водой по деньгам на карте и в резерве,
// под календарём — одна линия уровня с выводом словами. Одни данные, два взгляда.
import { useLayoutEffect, useRef, useState } from 'react';
import { LOW_WATER } from '../domain/cashflow';
import { fromKey, lastDay } from '../domain/dates';
import { num } from '../domain/money';
import { isWorkday } from '../domain/workdays';

export interface DayMoney {
  date: string;
  out: number;
  in: number;
  /** все платежи дня отмечены оплаченными */
  paid: boolean;
  /** деньги на карте и в резерве к вечеру */
  total?: number;
  /** день уже прошёл: вода бледнее, в вывод не идёт */
  past?: boolean;
}

/** −14,7к / +450 */
export function short(n: number): string {
  const a = Math.abs(n);
  const s = a < 1000 ? String(Math.round(a)) : `${(a / 1000).toFixed(1).replace('.', ',').replace(',0', '')}к`;
  return `${n < 0 ? '−' : '+'}${s}`;
}

const WAVE = 'M0 4 Q7.5 1 15 4 T30 4 T45 4 T60 4 T75 4 T90 4 T105 4 T120 4';

export function MonthGrid({ month, days, top, now, selected, onSelect, onSwipe }: {
  month: string; days: DayMoney[]; top: number; now: string; selected: string;
  onSelect: (d: string) => void; onSwipe: (dir: 1 | -1) => void;
}) {
  const lead = (fromKey(`${month}-01`).getDay() + 6) % 7;
  const touch = useRef<number | null>(null);
  return (
    <div onTouchStart={e => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 60) onSwipe(dx < 0 ? 1 : -1);
      }}>
      <div className="grid grid-cols-7 gap-1 text-center text-[12px] text-muted">
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
        {days.map((d, i) => {
          const n = Number(d.date.slice(8));
          const on = d.date === selected, isToday = d.date === now;
          const low = d.total != null && d.total < LOW_WATER;
          const level = d.total == null ? 0 : Math.max(10, Math.min(80, (Math.max(0, d.total) / (top || 1)) * 80));
          const aria = [`${n}`, !isWorkday(d.date) && 'выходной', d.out > 0 && `уходит ${num(d.out)} ₽${d.paid ? ', оплачено' : ''}`,
            d.in > 0 && `приходит ${num(d.in)} ₽`, d.total != null && `на карте и в резерве ${num(d.total)} ₽`].filter(Boolean).join(', ');
          return (
            <button key={d.date} type="button" onClick={() => onSelect(d.date)} aria-label={aria} aria-pressed={on}
              className="relative flex h-[46px] flex-col items-start gap-px overflow-hidden rounded-t-[15px] rounded-b-[5px] border border-line bg-surface px-[5px] pt-1 text-left [text-shadow:0_0_3px_var(--surface),0_0_2px_var(--surface)]">
              {level > 0 && (
                <span className="sc-fill absolute inset-x-0 bottom-0" style={{
                  height: `${level}%`, animationDelay: `${0.1 + i * 0.03}s`, opacity: d.past ? 0.5 : 1,
                  background: `linear-gradient(180deg, var(${low ? '--water-low-a' : '--water-a'}), var(${low ? '--water-low-b' : '--water-b'}))`,
                }}>
                  <svg className="sc-wave absolute -top-1 left-0 h-1.5 w-[200%]" viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true">
                    <path d={WAVE} fill="none" strokeWidth="1.3" style={{ stroke: low ? 'var(--mark-out)' : 'var(--sea)' }} />
                  </svg>
                  <span className="absolute -top-px left-[34%] h-0.5 w-[34%] rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,150,100,.95),transparent)]" />
                </span>
              )}
              <span className={`relative text-[11.5px] leading-tight ${on || isToday ? 'font-semibold' : ''} ${isToday ? 'text-sea' : isWorkday(d.date) ? '' : 'text-faint'}`}>{n}</span>
              {d.out > 0 && <span className={`relative text-[10px] leading-tight font-medium ${d.paid ? 'text-muted line-through' : 'text-neg'}`}>{short(-d.out)}</span>}
              {d.in > 0 && <span className="relative text-[10px] leading-tight font-medium text-pos">{short(d.in)}</span>}
              {isToday && !on && <span className="absolute inset-0 rounded-t-[14px] rounded-b-[4px] ring-[1.5px] ring-sea ring-inset" />}
              {on && (
                <>
                  <span className="absolute inset-0 rounded-t-[14px] rounded-b-[4px] ring-2 ring-ink ring-inset" />
                  {level > 0 && <span key={selected} className="sc-ring absolute left-1/2 -ml-3 h-2 w-6 rounded-[50%] border-[1.5px] border-white" style={{ bottom: `calc(${level}% - 4px)` }} />}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(358);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Линия уровня денег по дням: ступенька — день; оранжевым — ниже запаса; точка — самое низкое место */
export function LevelChart({ month, days, top, selected, onSelect }: {
  month: string; days: DayMoney[]; top: number; selected: string; onSelect: (d: string) => void;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const N = lastDay(month), BASE = 52, H = 46, bw = W / N;
  const y = (v: number) => +(BASE - (Math.max(0, v) / (top || 1)) * H).toFixed(1);
  const x0 = (n: number) => +((n - 1) * bw).toFixed(1);
  const cx = (n: number) => +((n - 0.5) * bw).toFixed(1);
  const known = days.filter(d => d.total != null) as (DayMoney & { total: number })[];
  if (!known.length) return null;

  const first = Number(known[0].date.slice(8));
  let line = `M${x0(first)} ${y(known[0].total)}`;
  known.forEach((d, i) => {
    const n = Number(d.date.slice(8));
    if (i) line += ` V${y(d.total)}`;
    line += ` H${x0(n + 1)}`;
  });
  const area = `${line} V${BASE} H${x0(first)} Z`;
  const low = known.filter(d => d.total < LOW_WATER).map(d => `M${x0(Number(d.date.slice(8)))} ${y(d.total)} H${x0(Number(d.date.slice(8)) + 1)}`).join(' ');
  const ahead = known.filter(d => !d.past);
  const min = (ahead.length ? ahead : known).reduce((m, d) => (d.total < m.total ? d : m), (ahead.length ? ahead : known)[0]);
  const tri = (d: DayMoney) => {
    const c = cx(Number(d.date.slice(8)));
    const both = d.out > 0 && d.in > 0;
    return {
      out: d.out > 0 ? `M${c - (both ? 6 : 2.5)} 56 h5 l-2.5 5 Z` : '',
      in: d.in > 0 ? `M${c + (both ? 1 : -2.5)} 61 h5 l-2.5 -5 Z` : '',
    };
  };
  const rug = days.map(tri);
  const sel = days.find(d => d.date === selected);
  const ticks = [1, 10, 20, N];

  return (
    <div ref={ref} className="relative h-[78px]">
      <svg width={W} height="78" className="absolute inset-0 overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="lvl-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--sea)', stopOpacity: 0.26 }} /><stop offset="1" style={{ stopColor: 'var(--sea)', stopOpacity: 0.05 }} />
          </linearGradient>
        </defs>
        <path className="sc-fade" d={area} fill="url(#lvl-area)" />
        <path d={`M0 ${y(LOW_WATER)} H${W}`} strokeWidth="1" style={{ stroke: 'var(--mark-out)' }} opacity=".35" />
        <text x="2" y={y(LOW_WATER) - 3} fontSize="10" style={{ fill: 'var(--muted)' }}>{num(LOW_WATER)}</text>
        <path className="sc-draw" pathLength={1} d={line} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--sea)' }} />
        {low && <path className="sc-fade" d={low} fill="none" strokeWidth="2.4" strokeLinecap="round" style={{ stroke: 'var(--mark-out)' }} />}
        <path d={`M0 ${BASE + 0.5} H${W}`} strokeWidth="1" style={{ stroke: 'var(--faint)' }} />
        <path d={rug.map(r => r.out).join(' ')} style={{ fill: 'var(--mark-out)' }} />
        <path d={rug.map(r => r.in).join(' ')} style={{ fill: 'var(--mark-in)' }} />
        {ticks.map(t => <text key={t} x={cx(t)} y="76" textAnchor="middle" fontSize="10.5" style={{ fill: 'var(--muted)' }}>{t}</text>)}
        <circle className="sc-fade" cx={cx(Number(min.date.slice(8)))} cy={y(min.total)} r="4" strokeWidth="2" style={{ fill: 'var(--mark-out)', stroke: 'var(--bg)' }} />
        {sel?.total != null && (
          <g style={{ transform: `translateX(${cx(Number(sel.date.slice(8)))}px)`, transition: 'transform .45s cubic-bezier(.3,.8,.3,1)' }}>
            <path d="M0 2 V52" strokeWidth="1" opacity=".45" style={{ stroke: 'var(--ink)' }} />
            <circle cx="0" cy={y(sel.total)} r="4.5" strokeWidth="2" style={{ fill: sel.total < LOW_WATER ? 'var(--mark-out)' : 'var(--sea)', stroke: 'var(--bg)' }} />
          </g>
        )}
      </svg>
      <div className="absolute inset-x-0 top-0 flex h-[62px]">
        {days.map(d => (
          <button key={d.date} type="button" onClick={() => onSelect(d.date)} className="h-full flex-1"
            aria-label={`${Number(d.date.slice(8))}-е${d.total != null ? `: ${num(d.total)} ₽` : ''}`} />
        ))}
      </div>
    </div>
  );
}

/** Вывод словами по дням, которые ещё впереди */
export function verdict(days: DayMoney[]): string | null {
  const known = days.filter(d => d.total != null && !d.past) as (DayMoney & { total: number })[];
  if (!known.length) return null;
  const minV = Math.min(...known.map(d => d.total));
  const at = known.filter(d => d.total === minV).map(d => Number(d.date.slice(8)));
  const range = at.length > 1 && at[at.length - 1] - at[0] === at.length - 1 ? `${at[0]}–${at[at.length - 1]}-го` : `${at[0]}-го`;
  if (minV < 0) return `Не хватит ${num(-minV)} ₽ к ${at[0]}-му, даже с резервом`;
  if (minV < LOW_WATER) return `Хватает, но ${range} останется мало: ${num(minV)} ₽`;
  return `Хватает на весь месяц, меньше всего ${range}: ${num(minV)} ₽`;
}

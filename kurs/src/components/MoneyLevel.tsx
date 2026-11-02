// Месяц на «Платежах»: каждый день наполняется водой по деньгам на карте и в резерве,
// под календарём — одна линия уровня с выводом словами. Одни данные, два взгляда.
import { useLayoutEffect, useRef } from 'react';
import { LOW_WATER } from '../domain/cashflow';
import { fromKey, weekday } from '../domain/dates';
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
              className="relative flex h-[54px] flex-col items-start gap-px overflow-hidden rounded-t-[16px] rounded-b-[6px] border border-line bg-surface px-[5px] pt-1 text-left [text-shadow:0_0_3px_var(--surface),0_0_2px_var(--surface)]">
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
              <span className={`relative text-[13px] leading-tight ${on || isToday ? 'font-semibold' : 'font-medium'} ${isToday ? 'text-sea' : isWorkday(d.date) ? '' : 'text-faint'}`}>{n}</span>
              {d.out > 0 && <span className={`relative text-[10.5px] leading-tight font-semibold tracking-[-0.01em] ${d.paid ? 'text-muted line-through' : 'text-neg'}`}>{short(-d.out)}</span>}
              {d.in > 0 && <span className="relative text-[10.5px] leading-tight font-semibold tracking-[-0.01em] text-pos">{short(d.in)}</span>}
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

/** Линия денег по дням: крупно, около шести дней на экране, остальное листается вбок. Между днями — плавные
 *  S-образные переходы с горизонтальными касательными в центре дня (без ступенек и без ложных выбросов). Ниже нуля —
 *  кредит: линия и заливка красные; ниже подушки 30 000 — оранжевые. */
const DW = 56, H = 200, TOP = 26, BOTTOM = 150;

export function LevelChart({ days, selected, onSelect }: {
  month: string; days: DayMoney[]; top: number; selected: string; onSelect: (d: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const known = days.filter(d => d.total != null) as (DayMoney & { total: number })[];
  const max = Math.max(LOW_WATER * 1.3, ...known.map(d => d.total));
  const min = Math.min(0, ...known.map(d => d.total));
  // одна ось от минимума до максимума: ноль — где выпадет, минус виден в том же масштабе, что и плюс
  const y = (v: number) => +(BOTTOM - ((v - min) / (max - min || 1)) * (BOTTOM - TOP)).toFixed(1);
  const BASE = y(0);
  const cx = (i: number) => i * DW + DW / 2;
  const W = days.length * DW;
  const idx = new Map(days.map((d, i) => [d.date, i]));
  const sel = idx.get(selected) ?? -1;

  // к выбранному дню (и при открытии) — плавно подъезжаем, он оказывается по центру
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || sel < 0) return;
    const to = Math.max(0, cx(sel) - el.clientWidth / 2);
    if (Math.abs(el.scrollLeft - to) > 2) el.scrollTo({ left: to, behavior: el.dataset.ready ? 'smooth' : 'auto' });
    el.dataset.ready = '1';
  }, [sel]);

  if (!known.length) return null;
  const pts = known.map(d => [cx(idx.get(d.date)!), y(d.total)] as const);
  let line = `M${pts[0][0] - DW / 2} ${pts[0][1]} L${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i], k = (x2 - x1) * 0.5;
    line += ` C${x1 + k} ${y1} ${x2 - k} ${y2} ${x2} ${y2}`;
  }
  const last = pts[pts.length - 1];
  line += ` L${last[0] + DW / 2} ${last[1]}`;
  const area = `${line} V${BASE} H${pts[0][0] - DW / 2} Z`;
  const lowY = y(LOW_WATER);
  const s = sel >= 0 ? days[sel] : undefined;
  const sx = sel >= 0 ? cx(sel) : 0, sy = s?.total != null ? y(s.total) : BASE;
  const tone = (v: number) => (v < 0 ? 'var(--neg)' : v < LOW_WATER ? 'var(--warn)' : 'var(--sea)');

  return (
    <div ref={scroller} className="hs -mx-4 overflow-x-auto overscroll-x-contain" style={{ scrollSnapType: 'x proximity' }}>
      <div className="relative" style={{ width: W + 32, height: H, paddingLeft: 16 }}>
        <svg width={W} height={H} className="absolute top-0 left-4 overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="lvl-up" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--sea)', stopOpacity: 0.42 }} /><stop offset="1" style={{ stopColor: 'var(--sea)', stopOpacity: 0.04 }} />
            </linearGradient>
            <linearGradient id="lvl-dn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--neg)', stopOpacity: 0.1 }} /><stop offset="1" style={{ stopColor: 'var(--neg)', stopOpacity: 0.5 }} />
            </linearGradient>
            <clipPath id="lvl-above"><rect x="-40" y="-40" width={W + 80} height={BASE + 40} /></clipPath>
            <clipPath id="lvl-below"><rect x="-40" y={BASE} width={W + 80} height={H - BASE} /></clipPath>
            <clipPath id="lvl-cushion"><rect x="-40" y="-40" width={W + 80} height={lowY + 40} /></clipPath>
            <clipPath id="lvl-low"><rect x="-40" y={lowY} width={W + 80} height={BASE - lowY} /></clipPath>
          </defs>
          {days.map((d, i) => fromKey(d.date).getDay() === 0 && <rect key={d.date} x={i * DW} y="0" width={DW} height={H} rx="14" style={{ fill: 'var(--surface)' }} opacity=".55" />)}
          {sel >= 0 && <rect x={sel * DW + 3} y="0" width={DW - 6} height={H} rx="16" style={{ fill: 'var(--sea)' }} opacity=".12" />}
          <path d={`M0 ${lowY} H${W}`} strokeDasharray="4 5" strokeWidth="1" style={{ stroke: 'var(--warn)' }} opacity=".55" />
          <path className="sc-fade" d={area} fill="url(#lvl-up)" clipPath="url(#lvl-above)" />
          <path className="sc-fade" d={area} fill="url(#lvl-dn)" clipPath="url(#lvl-below)" />
          <path d={`M0 ${BASE} H${W}`} strokeWidth="1.2" style={{ stroke: 'var(--ink)' }} opacity=".35" />
          <g className="sc-draw-line">
            <path d={line} fill="none" strokeWidth="2.6" strokeLinecap="round" clipPath="url(#lvl-cushion)" style={{ stroke: 'var(--sea)' }} />
            <path d={line} fill="none" strokeWidth="2.8" strokeLinecap="round" clipPath="url(#lvl-low)" style={{ stroke: 'var(--warn)' }} />
            <path d={line} fill="none" strokeWidth="3" strokeLinecap="round" clipPath="url(#lvl-below)" style={{ stroke: 'var(--neg)' }} />
          </g>
          {min < 0 && <text x="6" y={Math.min(BOTTOM, BASE + 15)} fontSize="10.5" style={{ fill: 'var(--neg)' }}>ниже нуля — кредит</text>}
          <text x="6" y={lowY - 5} fontSize="10.5" style={{ fill: 'var(--warn)' }}>{num(LOW_WATER)}</text>
          {days.map((d, i) => (
            <g key={d.date} transform={`translate(${cx(i)} 0)`}>
              {d.out > 0 && <path d={`M${d.in > 0 ? -7 : -3} ${BOTTOM + 8} h6 l-3 6 Z`} style={{ fill: 'var(--mark-out)' }} />}
              {d.in > 0 && <path d={`M${d.out > 0 ? 1 : -3} ${BOTTOM + 14} h6 l-3 -6 Z`} style={{ fill: 'var(--mark-in)' }} />}
              <text y={H - 22} textAnchor="middle" fontSize="15" fontWeight={i === sel ? 600 : 400} style={{ fill: i === sel ? 'var(--ink)' : 'var(--muted)', fontFamily: 'var(--font-display)' }}>{Number(d.date.slice(8))}</text>
              <text y={H - 6} textAnchor="middle" fontSize="10.5" style={{ fill: fromKey(d.date).getDay() === 0 ? 'var(--neg)' : 'var(--faint)' }}>{weekday(d.date)}</text>
            </g>
          ))}
          {s?.total != null && (
            <g style={{ transform: `translateX(${sx}px)`, transition: 'transform .45s cubic-bezier(.3,.8,.3,1)' }}>
              <path d={`M0 ${sy + 6} V${BOTTOM}`} strokeWidth="1" opacity=".4" style={{ stroke: 'var(--ink)' }} />
              <circle cy={sy} r="6" strokeWidth="2.5" style={{ fill: tone(s.total), stroke: 'var(--bg)' }} />
            </g>
          )}
        </svg>
        {s?.total != null && (
          <div className="pointer-events-none absolute rounded-xl border border-line bg-surface px-2.5 py-1 text-[12.5px] font-medium whitespace-nowrap shadow-sm transition-[left,top] duration-500"
            style={{ left: 16 + Math.min(Math.max(sx - 56, 0), W - 112), top: Math.max(0, sy - 40), color: tone(s.total) }}>
            {s.total < 0 ? '−' : ''}{num(Math.abs(s.total))} ₽
          </div>
        )}
        <div className="absolute top-0 left-4 flex" style={{ height: H }}>
          {days.map(d => (
            <button key={d.date} type="button" onClick={() => onSelect(d.date)} className="h-full" style={{ width: DW, scrollSnapAlign: 'center' }}
              aria-label={`${Number(d.date.slice(8))}-е${d.total != null ? `: ${num(d.total)} ₽` : ''}`} />
          ))}
        </div>
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

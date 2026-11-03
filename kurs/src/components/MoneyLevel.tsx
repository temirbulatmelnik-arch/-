// Месяц на «Платежах»: каждый день наполняется водой по резерву к вечеру — это прогноз покрытия, тот же, что в
// «Хватит ли» и в status.coverage для чата (monthDays в domain/coverage.ts); под календарём — линия того же резерва.
// Ячейка — сумма неоплаченных событий дня; оплаченное на числа не влияет.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NARROW, type DayMoney } from '../domain/coverage';
import { fromKey, lastDay, weekday } from '../domain/dates';
import { num } from '../domain/money';
import { isWorkday } from '../domain/workdays';

export type { DayMoney };

/** −14,7к / +450 */
export function short(n: number): string {
  const a = Math.abs(n);
  const s = a < 1000 ? String(Math.round(a)) : `${(a / 1000).toFixed(1).replace('.', ',').replace(',0', '')}к`;
  return `${n < 0 ? '−' : '+'}${s}`;
}

const WAVE = 'M0 4 Q7.5 1 15 4 T30 4 T45 4 T60 4 T75 4 T90 4 T105 4 T120 4';

/** Ячейка дня и зазор между ними, px: по ним высота месяца считается без измерений (лента месяцев на «Платежах») */
const CELL = 54, GAP = 4;
const lead = (month: string) => (fromKey(`${month}-01`).getDay() + 6) % 7;
/** Высота сетки месяца: 4–6 строк по неделям */
export const monthHeight = (month: string) => {
  const rows = Math.ceil((lead(month) + lastDay(month)) / 7);
  return rows * CELL + (rows - 1) * GAP;
};

/** Дни недели над сеткой — одни на все месяцы, при листании стоят на месте */
export function Weekdays() {
  return (
    <div className="grid grid-cols-7 gap-1 text-center text-[12px] text-muted" aria-hidden="true">
      {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => <span key={d}>{d}</span>)}
    </div>
  );
}

export function MonthGrid({ month, days, top, now, selected, still = false, onSelect, onOpen }: {
  month: string; days: DayMoney[]; top: number; now: string; selected: string;
  /** без наполнения водой: соседние месяцы ленты приезжают уже налитыми */
  still?: boolean;
  onSelect: (d: string) => void;
  /** нажатие на день — раскрыть его карточку прямо из ячейки: from — где ячейка на экране */
  onOpen?: (d: string, from: DOMRect) => void;
}) {
  // вода наполняет ячейки один раз: скрытая вкладка (display:none) при каждом показе перезапускала бы наполнение
  // всех ячеек. Считаем окончания — после последнего класс sc-once снимает анимацию (и слои видеокарты вместе с ней)
  const [filled, setFilled] = useState(still);
  const ends = useRef(0);
  const fills = days.filter(d => d.total != null).length;
  // обработчик нажатия — один и тот же между перерисовками, иначе запомненные ячейки перерисовывались бы все
  const cb = useRef({ onSelect, onOpen });
  cb.current = { onSelect, onOpen };
  const tap = useCallback((date: string, from: DOMRect) => { cb.current.onSelect(date); cb.current.onOpen?.(date, from); }, []);
  return (
    <div className={`grid grid-cols-7 gap-1 ${filled ? 'sc-once' : ''}`}
      onAnimationEnd={e => { if (e.animationName === 'sc-fill' && ++ends.current >= fills) setFilled(true); }}>
      {Array.from({ length: lead(month) }, (_, i) => <span key={`e${i}`} />)}
      {days.map((d, i) => <DayCell key={d.date} d={d} i={i} top={top} on={d.date === selected} isToday={d.date === now} onTap={tap} />)}
    </div>
  );
}

/** Ячейка дня. Запомнена (memo): при нажатии на день перерисовываются две ячейки — старый и новый выбор, а не все 30.
 *  Волна качается только в выбранной: бесконечная анимация в каждой из 30 скруглённых ячеек — 30 слоёв с масками
 *  на видеокарте iPhone, от них календарь и подвисал */
const DayCell = memo(function DayCell({ d, i, top, on, isToday, onTap }: {
  d: DayMoney; i: number; top: number; on: boolean; isToday: boolean; onTap: (date: string, from: DOMRect) => void;
}) {
  const n = Number(d.date.slice(8));
  const low = d.total != null && d.total < NARROW;
  const level = d.total == null ? 0 : Math.max(10, Math.min(80, (Math.max(0, d.total) / (top || 1)) * 80));
  const aria = [`${n}`, !isWorkday(d.date) && 'выходной', d.sum !== 0 && `${d.sum < 0 ? 'уходит' : 'приходит'} ${num(Math.abs(d.sum))} ₽`,
    d.paid && 'всё отмечено', d.total != null && `в резерве к вечеру ${num(d.total)} ₽`].filter(Boolean).join(', ');
  return (
    <button type="button" onClick={e => onTap(d.date, e.currentTarget.getBoundingClientRect())} aria-label={aria} aria-pressed={on}
      className="relative flex h-[54px] flex-col items-start gap-px overflow-hidden rounded-t-[16px] rounded-b-[6px] border border-line bg-surface px-[5px] pt-1 text-left [text-shadow:0_0_3px_var(--surface),0_0_2px_var(--surface)]">
      {level > 0 && (
        <span className="sc-fill absolute inset-x-0 bottom-0" style={{
          height: `${level}%`, animationDelay: `${0.1 + i * 0.03}s`, opacity: d.past ? 0.5 : 1,
          background: `linear-gradient(180deg, var(${low ? '--water-low-a' : '--water-a'}), var(${low ? '--water-low-b' : '--water-b'}))`,
        }}>
          <svg className={`absolute -top-1 left-0 h-1.5 w-[200%] ${on ? 'sc-wave' : ''}`} viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true">
            <path d={WAVE} fill="none" strokeWidth="1.3" style={{ stroke: low ? 'var(--mark-out)' : 'var(--sea)' }} />
          </svg>
          <span className="absolute -top-px left-[34%] h-0.5 w-[34%] rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,150,100,.95),transparent)]" />
        </span>
      )}
      <span className={`relative text-[13px] leading-tight ${on || isToday ? 'font-semibold' : 'font-medium'} ${isToday ? 'text-sea' : isWorkday(d.date) ? '' : 'text-faint'}`}>{n}</span>
      {/* сумма неоплаченных событий дня со знаком; если всё отмечено — что ушло, зачёркнуто и бледно */}
      {d.sum !== 0
        ? <span className={`relative text-[10.5px] leading-tight font-semibold tracking-[-0.01em] ${d.sum < 0 ? 'text-neg' : 'text-pos'}`}>{short(d.sum)}</span>
        : d.paid && d.paidTotal > 0 && <span className="relative text-[10.5px] leading-tight font-semibold tracking-[-0.01em] text-muted line-through">{short(-d.paidTotal).slice(1)}</span>}
      {isToday && !on && <span className="absolute inset-0 rounded-t-[14px] rounded-b-[4px] ring-[1.5px] ring-sea ring-inset" />}
      {on && (
        <>
          <span className="absolute inset-0 rounded-t-[14px] rounded-b-[4px] ring-2 ring-ink ring-inset" />
          {level > 0 && <span className="sc-ring absolute left-1/2 -ml-3 h-2 w-6 rounded-[50%] border-[1.5px] border-white" style={{ bottom: `calc(${level}% - 4px)` }} />}
        </>
      )}
    </button>
  );
});

/** Линия денег по дням: крупно, около шести дней на экране, остальное листается вбок. Между днями — плавные
 *  S-образные переходы с горизонтальными касательными в центре дня (без ступенек и без ложных выбросов). Ниже нуля —
 *  кредит: линия и заливка красные; ниже подушки 30 000 — оранжевые. */
const DW = 56, H = 200, TOP = 26, BOTTOM = 150;

export function LevelChart({ days, selected, onSelect }: {
  month: string; days: DayMoney[]; top: number; selected: string; onSelect: (d: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const known = days.filter(d => d.total != null) as (DayMoney & { total: number })[];
  const max = Math.max(NARROW * 4, ...known.map(d => d.total));
  const min = Math.min(0, ...known.map(d => d.total));
  // одна ось от минимума до максимума: ноль — где выпадет, минус виден в том же масштабе, что и плюс
  const y = (v: number) => +(BOTTOM - ((v - min) / (max - min || 1)) * (BOTTOM - TOP)).toFixed(1);
  const BASE = y(0);
  const cx = (i: number) => i * DW + DW / 2;
  const W = days.length * DW;
  const idx = new Map(days.map((d, i) => [d.date, i]));
  const sel = idx.get(selected) ?? -1;

  // к выбранному дню (и при открытии) — плавно подъезжаем, он оказывается по центру
  const center = (smooth: boolean) => {
    const el = scroller.current;
    if (!el || sel < 0 || !el.clientWidth) return false;
    const to = Math.max(0, cx(sel) - el.clientWidth / 2);
    if (Math.abs(el.scrollLeft - to) > 2) el.scrollTo({ left: to, behavior: smooth ? 'smooth' : 'auto' });
    el.dataset.ready = '1';
    return true;
  };
  // в кадре анимации, а не посреди обновления: иначе браузер пересчитывает раскладку страницы дважды
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => center(!!scroller.current?.dataset.ready));
    return () => cancelAnimationFrame(id);
  }, [sel]);
  // вкладка собрана скрытой (display:none) — ширины ещё нет; как только её показали, сразу встаём на выбранный день.
  // ResizeObserver срабатывает после раскладки, до отрисовки — рывка не видно
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.dataset.ready) return;
    const ro = new ResizeObserver(() => { if (center(false)) ro.disconnect(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sel]);
  // проявление линии и заливки — один раз: скрытая вкладка при каждом показе перезапускала бы CSS-анимации
  const [drawn, setDrawn] = useState(false);
  const fades = useRef(0);

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
  const lowY = y(NARROW);
  // подписи у нуля и у запаса: если резерв уходит в минус совсем чуть-чуть, линии почти сливаются — подпись запаса
  // поднимается над подписью «ниже нуля», а не налезает на неё
  const belowY = Math.min(BOTTOM, BASE + 15);
  const narrowY = min < 0 ? Math.min(lowY - 5, belowY - 13) : lowY - 5;
  const s = sel >= 0 ? days[sel] : undefined;
  const sx = sel >= 0 ? cx(sel) : 0, sy = s?.total != null ? y(s.total) : BASE;
  const tone = (v: number) => (v < 0 ? 'var(--neg)' : v < NARROW ? 'var(--warn)' : 'var(--sea)');

  return (
    <div ref={scroller} className="hs -mx-4 overflow-x-auto overscroll-x-contain" style={{ scrollSnapType: 'x proximity' }}>
      <div className="relative" style={{ width: W + 32, height: H, paddingLeft: 16 }}>
        <svg width={W} height={H} className={`absolute top-0 left-4 overflow-visible ${drawn ? 'sc-once' : ''}`} aria-hidden="true"
          onAnimationEnd={e => { if (e.animationName === 'sc-fade' && ++fades.current >= 3) setDrawn(true); }}>
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
          {min < 0 && <text x="6" y={belowY} fontSize="10.5" style={{ fill: 'var(--neg)' }}>ниже нуля — резерва не хватит</text>}
          <text x="6" y={narrowY} fontSize="10.5" style={{ fill: 'var(--warn)' }}>{num(NARROW)}</text>
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
/** Вывод по резерву за месяц словами: те же числа, что в календаре и в «Хватит ли» (только дни прогноза) */
export function verdict(days: DayMoney[]): { text: string; tone: 'neg' | 'warn' | 'pos' } | null {
  const known = days.filter(d => d.total != null && !d.past) as (DayMoney & { total: number })[];
  if (!known.length) return null;
  const minV = Math.min(...known.map(d => d.total));
  const at = known.filter(d => d.total === minV).map(d => Number(d.date.slice(8)));
  const range = at.length > 1 && at[at.length - 1] - at[0] === at.length - 1 ? `${at[0]}–${at[at.length - 1]}-го` : `${at[0]}-го`;
  // с какого дня не хватает — тот же первый день нехватки, что в «Хватит ли»
  const first = known.find(d => d.total < 0);
  if (minV < 0) return { text: `Резерва не хватит с ${Number(first!.date.slice(8))}-го, меньше всего ${range}: ${num(minV)} ₽`, tone: 'neg' };
  if (minV < NARROW) return { text: `Резерва хватает, но ${range} останется мало: ${num(minV)} ₽`, tone: 'warn' };
  return { text: `Резерва хватает на весь месяц, меньше всего ${range}: ${num(minV)} ₽`, tone: 'pos' };
}

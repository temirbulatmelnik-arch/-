// Кольцо дня на «Неделе»: стеклянный круг над небом сцены, внутри — сколько ещё можно потратить сегодня; нажатие — траты дня.
// Трата — дуга тает вместе с числом; перерасход — красная дуга в обратную сторону. Дуга считается от досчитывающегося
// числа и рисуется атрибутом, а не CSS-переходом: Safari на iPhone не всегда анимирует переходы на элементах SVG.
import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { rub } from '../domain/money';
import { Money } from './ui';
import { useCountUp } from './useCountUp';

const C = 70, R = 58, L = 2 * Math.PI * R;
/** вода внутри кольца: радиус, волна на поверхности (две волны на ширину — бесшовный сдвиг на половину) */
const WR = R - 7;
const WAVE = `M0 6 ${Array.from({ length: 8 }, () => 'q 8.75 -6 17.5 0 t 17.5 0').join(' ')} V${2 * WR + 14} H0 Z`;
const v = (name: string): CSSProperties => ({ stopColor: `var(${name})` });

function Arc({ frac, reverse, stroke }: { frac: number; reverse?: boolean; stroke: string }) {
  if (frac < 0.004) return null;
  // от «12 часов» по часовой стрелке; перерасход — против
  const turn = reverse ? `translate(${C} ${C}) scale(-1 1) rotate(-90) translate(${-C} ${-C})` : `rotate(-90 ${C} ${C})`;
  return (
    <circle cx={C} cy={C} r={R} fill="none" strokeWidth="7" strokeLinecap="round" transform={turn}
      strokeDasharray={`${L} ${L}`} strokeDashoffset={L * (1 - frac)} style={{ stroke }} />
  );
}

/** Кольцо показывает, сколько ещё можно сегодня, и никогда не уходит в минус: сверх нормы дня — красная дуга в обратную
 *  сторону и подпись «сверх нормы на …»; лимит недели исчерпан — 0 и «до воскресенья» (итог недели — в заголовке) */
export function DayRing({ day, canSpend, mode, overDay, nextWeek, onClick }: {
  day: number; canSpend: number; mode: 'ok' | 'day' | 'week'; overDay: number; nextWeek: boolean; onClick: () => void;
}) {
  const shown = useCountUp(canSpend, 1100, day);
  const over = mode !== 'ok';
  const frac = day > 0 && !over ? Math.min(1, Math.max(0, shown / day)) : 0;
  const overFrac = mode === 'day' ? (day > 0 ? Math.min(1, overDay / day) : 1) : 0;
  const ink = over ? 'var(--ring-neg)' : 'var(--ring-ink)';
  const label = mode === 'week' ? (nextWeek ? 'до понедельника' : 'до воскресенья') : mode === 'day' ? 'сверх нормы' : 'на сегодня';
  const aria = mode === 'week' ? 'Лимит недели исчерпан, сегодня можно 0 ₽' : mode === 'day' ? `Сегодня сверх нормы на ${rub(overDay)}` : `На сегодня осталось ${rub(canSpend)} из ${rub(day)}`;
  return (
    <button type="button" onClick={onClick} aria-label={`${aria}. Траты за сегодня`}
      className="pointer-events-auto relative grid size-[140px] shrink-0 place-items-center rounded-full border backdrop-blur-md backdrop-saturate-150 transition-[background-color,transform] duration-700 active:scale-[.97]"
      style={{ background: over ? 'var(--glass-over)' : 'var(--glass)', borderColor: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      <svg viewBox="0 0 140 140" className="absolute -inset-px size-[140px]" aria-hidden="true">
        <defs>
          <linearGradient id="day-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={v('--ring-1')} /><stop offset=".6" style={v('--ring-2')} /><stop offset="1" style={v('--ring-3')} />
          </linearGradient>
        </defs>
        <defs>
          <clipPath id="day-water"><circle cx={C} cy={C} r={WR} /></clipPath>
          <linearGradient id="day-water-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: over ? 'var(--ring-over)' : 'var(--ring-1)' }} stopOpacity=".42" />
            <stop offset="1" style={{ stopColor: over ? 'var(--ring-over)' : 'var(--ring-2)' }} stopOpacity=".16" />
          </linearGradient>
        </defs>
        {/* вода: уровень — сколько осталось на сегодня; трата — вода опускается с лёгким покачиванием */}
        <g clipPath="url(#day-water)">
          <motion.g initial={false} animate={{ y: C - WR + (1 - Math.max(0.05, over ? 0.06 : frac)) * 2 * WR - 6 }} transition={{ type: 'spring', bounce: 0.3, duration: 1.4 }}>
            <g className="sc-wave" style={{ transformBox: 'fill-box' }}>
              <path d={WAVE} fill="url(#day-water-g)" transform={`translate(${C - WR - 2} 0)`} />
            </g>
          </motion.g>
        </g>
        <circle cx={C} cy={C} r={R} fill="none" stroke="#fff" strokeWidth="7" style={{ strokeOpacity: 'var(--ring-track)' }} />
        <Arc frac={frac} stroke="url(#day-ring)" />
        <Arc frac={overFrac} reverse stroke="var(--ring-over)" />
      </svg>
      <span className="relative flex flex-col items-center gap-[3px]" aria-hidden="true">
        <span className="figure text-[25px] leading-none" style={{ color: ink }}><Money value={Math.max(0, shown)} /></span>
        <span className="text-center text-[11.5px] leading-tight" style={{ color: over ? 'var(--ring-neg)' : 'var(--ring-label)' }}>
          {label}{mode === 'day' && <><br />на <Money value={overDay} /></>}
        </span>
      </span>
    </button>
  );
}

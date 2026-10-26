// Кольцо дня на «Неделе»: стеклянный круг над небом сцены, внутри — сколько ещё можно потратить сегодня.
// Трата — дуга тает вместе с числом; перерасход — красная дуга в обратную сторону. Дуга считается от досчитывающегося
// числа и рисуется атрибутом, а не CSS-переходом: Safari на iPhone не всегда анимирует переходы на элементах SVG.
import type { CSSProperties } from 'react';
import { rub } from '../domain/money';
import { Money } from './ui';
import { useCountUp } from './useCountUp';

const C = 70, R = 58, L = 2 * Math.PI * R;
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

export function DayRing({ day, left }: { day: number; left: number }) {
  const shown = useCountUp(left, 1100, day);
  const over = shown < -0.5;
  const frac = day > 0 ? Math.min(1, Math.max(0, shown / day)) : 0;
  const overFrac = !over ? 0 : day > 0 ? Math.min(1, -shown / day) : 1;
  const ink = over ? 'var(--ring-neg)' : 'var(--ring-ink)';
  return (
    <div role="img" aria-label={left < 0 ? `Сегодня перерасход ${rub(-left)}` : `На сегодня осталось ${rub(left)} из ${rub(day)}`}
      className="relative grid size-[140px] shrink-0 place-items-center rounded-full border backdrop-blur-md backdrop-saturate-150 transition-colors duration-700"
      style={{ background: over ? 'var(--glass-over)' : 'var(--glass)', borderColor: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      <svg viewBox="0 0 140 140" className="absolute -inset-px size-[140px]" aria-hidden="true">
        <defs>
          <linearGradient id="day-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={v('--ring-1')} /><stop offset=".6" style={v('--ring-2')} /><stop offset="1" style={v('--ring-3')} />
          </linearGradient>
        </defs>
        <circle cx={C} cy={C} r={R} fill="none" stroke="#fff" strokeWidth="7" style={{ strokeOpacity: 'var(--ring-track)' }} />
        <Arc frac={frac} stroke="url(#day-ring)" />
        <Arc frac={overFrac} reverse stroke="var(--ring-over)" />
      </svg>
      <span className="relative flex flex-col items-center gap-[3px]" aria-hidden="true">
        <span className="figure text-[25px] leading-none" style={{ color: ink }}>{over && '−'}<Money value={Math.abs(shown)} /></span>
        <span className="text-[11.5px]" style={{ color: over ? 'var(--ring-neg)' : 'var(--ring-label)' }}>{over ? 'сверх лимита' : 'на сегодня'}</span>
      </span>
    </div>
  );
}

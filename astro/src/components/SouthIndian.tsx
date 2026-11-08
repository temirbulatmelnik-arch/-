// Ведическая карта в южноиндийском стиле: знаки на постоянных местах (Рыбы — слева сверху), лагна отмечена чертой.
import type { VedicChart } from '../engine/vedic';
import { GRAHA_ABBR, type Graha } from '../engine/vedic';

const POS: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [3, 0], [2, 0], [1, 0], [0, 0]]; // [ряд, столбец] для Овна…Рыб
const SIGN_SHORT = ['Овен', 'Телец', 'Близн.', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорп.', 'Стрел.', 'Козер.', 'Водол.', 'Рыбы'];
const COL: Record<Graha, string> = { sun: '#ffd27a', moon: '#dfe6ff', mars: '#ff7f6e', mercury: '#9fe3ff', jupiter: '#ffc58a', venus: '#ffb3d1', saturn: '#d9c7a0', rahu: '#e2bd72', ketu: '#a48a5c' };

export function SouthIndian({ v, title }: { v: VedicChart; title: string }) {
  const cell = 86, S = cell * 4;
  return (
    <svg viewBox={`-2 -2 ${S + 4} ${S + 4}`} className="mx-auto block w-full max-w-[400px]" role="img" aria-label={`Ведическая карта: ${title}`}>
      {POS.map(([r, c], sign) => {
        const x = c * cell, y = r * cell;
        const gs = (Object.values(v.grahas)).filter(g => g.sign === sign);
        const isLagna = v.lagnaSign === sign;
        return (
          <g key={sign}>
            <rect x={x} y={y} width={cell} height={cell} fill={isLagna ? 'rgba(226,189,114,.12)' : 'rgba(28,33,86,.35)'} stroke="var(--brass)" strokeOpacity=".5" />
            {isLagna && <line x1={x} y1={y + 18} x2={x + 18} y2={y} stroke="var(--brass)" strokeWidth="1.6" />}
            <text x={x + cell - 5} y={y + 13} textAnchor="end" fontSize="9" fill="var(--faint)" fontFamily="var(--font-sans)">{SIGN_SHORT[sign]}</text>
            {gs.map((g, i) => (
              <text key={g.g} x={x + 7 + (i % 2) * 40} y={y + 32 + Math.floor(i / 2) * 18} fontSize="12.5" fontWeight="700" fill={COL[g.g]} fontFamily="var(--font-sans)">
                {GRAHA_ABBR[g.g]}<tspan fontSize="9" fontWeight="500" fill="var(--dim)"> {Math.floor(g.deg)}°{g.retro && g.g !== 'rahu' && g.g !== 'ketu' ? 'R' : ''}</tspan>
              </text>
            ))}
            {isLagna && <text x={x + 7} y={y + cell - 8} fontSize="9.5" fill="var(--brass)" fontFamily="var(--font-sans)" fontWeight="700">Лагна {Math.floor(v.lagna % 30)}°</text>}
          </g>
        );
      })}
      <text x={S / 2} y={S / 2 - 6} textAnchor="middle" className="serif" fontSize="22" fill="var(--ink)" fontWeight="600">{title}</text>
      <text x={S / 2} y={S / 2 + 16} textAnchor="middle" fontSize="10" fill="var(--faint)" fontFamily="var(--font-sans)">Лахири · раши</text>
    </svg>
  );
}

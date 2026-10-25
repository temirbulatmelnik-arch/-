// Иллюстрация «Петербург»: закат над Невой, Петропавловка, Исаакий, Адмиралтейство и Дворцовый мост.
// Мост на «Неделе» разводится по мере трат, фонари набережной — дни недели. Цвета — из index.css (--sky-*, --city-*),
// поэтому тёмная тема превращает закат в поздние сумерки без отдельной картинки.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const f = (v: string): CSSProperties => ({ fill: `var(${v})` });
const stop = (v: string, opacity?: number): CSSProperties => ({ stopColor: `var(${v})`, stopOpacity: opacity });

/** Силуэты города в координатах 390×330 (горизонт — y=330), шпиль Петропавловки по центру */
function City() {
  return (
    <>
      <g transform="matrix(.85 0 0 .85 270.5 49.5)" style={f('--city-far')} opacity=".72">
        <rect x="20" y="314" width="96" height="16" /><rect x="60" y="300" width="20" height="14" /><rect x="64" y="290" width="12" height="10" />
        <path d="M68.4 290 L70 238 L71.6 290 Z" /><circle cx="70" cy="236.5" r="1.6" />
      </g>
      <g transform="matrix(.85 0 0 .85 -74.3 49.5)" style={f('--city-mid')} opacity=".85">
        <rect x="126" y="310" width="64" height="20" /><rect x="140" y="296" width="36" height="14" />
        <path d="M140 297 Q158 266 176 297 Z" /><rect x="156" y="272" width="4" height="10" /><rect x="157.4" y="264" width="1.2" height="8" />
        <path d="M128 311 Q132 302 136 311 Z M180 311 Q184 302 188 311 Z" />
      </g>
      <path d="M0 330 V324 H22 V321 H34 V324 H112 V330 Z" style={f('--city-mid')} opacity=".7" />
      <path d="M262 330 V325 H296 V321 H330 V325 H390 V330 Z" style={f('--city-near')} opacity=".8" />
      <g transform="matrix(.85 0 0 .85 -60 49.5)" style={f('--city-near')} opacity=".95">
        <path d="M206 330 V322 L222 317 H262 L270 322 H390 V330 Z" />
        <rect x="282" y="304" width="44" height="18" /><path d="M316 305 Q321 295 326 305 Z" />
        <rect x="292" y="290" width="16" height="14" /><rect x="294.5" y="280" width="11" height="10" /><rect x="296.5" y="272" width="7" height="8" />
        <path d="M297.6 272 L300 190 L302.4 272 Z" /><path d="M296.5 189 H303.5 L300 185 Z" /><circle cx="300" cy="182" r="1.7" />
      </g>
    </>
  );
}

function SkyGradients({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={stop('--sky-1')} /><stop offset=".5" style={stop('--sky-2')} /><stop offset=".85" style={stop('--sky-3')} /><stop offset="1" style={stop('--sky-4')} />
      </linearGradient>
      <linearGradient id={`${id}-warm`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={stop('--skyw-1')} /><stop offset=".45" style={stop('--skyw-2')} /><stop offset=".78" style={stop('--skyw-3')} /><stop offset="1" style={stop('--skyw-4')} />
      </linearGradient>
      <radialGradient id={`${id}-sun`}><stop offset="0" stopColor="#FFF1D6" /><stop offset=".55" stopColor="#FFC48A" /><stop offset="1" stopColor="#FF9152" /></radialGradient>
      <radialGradient id={`${id}-halo`}><stop offset="0" stopColor="#FFC08A" stopOpacity=".85" /><stop offset=".3" stopColor="#FBA27F" stopOpacity=".45" /><stop offset="1" stopColor="#F1A487" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={stop('--water-1')} /><stop offset=".14" style={stop('--water-2')} /><stop offset=".38" style={stop('--water-3')} /><stop offset=".72" style={stop('--water-4')} /><stop offset="1" style={stop('--water-5')} />
      </linearGradient>
    </>
  );
}

const GLITTER: [number, number, number][] = [[226, 337, 22], [220, 346, 14], [240, 352, 18], [214, 364, 24], [246, 374, 16], [206, 388, 20], [238, 400, 26], [200, 416, 18], [252, 430, 22], [210, 446, 28], [260, 460, 18]];
const WINDOWS: [number, number][] = [[40, 318], [76, 318], [132, 325], [152, 325], [258, 325], [318, 324], [352, 327]];

/** Пролёт моста: решётчатая ферма, у опоры глубже, к середине реки тоньше. Начало координат — верх настила у опоры. */
function Leaf() {
  return (
    <g style={{ stroke: 'var(--bridge)' }} fill="none">
      <path d="M-16 0 H107 V16 L96.3 17.2 L85.6 19 L74.9 21 L64.2 23.3 L53.5 25.7 L42.8 28.4 L32.1 31.1 L21.4 34 L10.7 36.9 L0 40 L-16 38 Z" style={f('--bridge')} stroke="none" opacity=".42" />
      <path strokeWidth="1.3" d="M10.7 0 V36.9 M21.4 0 V34 M32.1 0 V31.1 M42.8 0 V28.4 M53.5 0 V25.7 M64.2 0 V23.3 M74.9 0 V21 M85.6 0 V19 M96.3 0 V17.2" />
      <path strokeWidth="1" d="M0 0 L10.7 36.9 M0 40 L10.7 0 M10.7 0 L21.4 34 M10.7 36.9 L21.4 0 M21.4 0 L32.1 31.1 M21.4 34 L32.1 0 M32.1 0 L42.8 28.4 M32.1 31.1 L42.8 0 M42.8 0 L53.5 25.7 M42.8 28.4 L53.5 0 M53.5 0 L64.2 23.3 M53.5 25.7 L64.2 0 M64.2 0 L74.9 21 M64.2 23.3 L74.9 0 M74.9 0 L85.6 19 M74.9 21 L85.6 0 M85.6 0 L96.3 17.2 M85.6 19 L96.3 0 M96.3 0 L107 16 M96.3 17.2 L107 0" />
      <path strokeWidth="1" d="M0 20 L10.7 18.4 L21.4 17 L32.1 15.6 L42.8 14.2 L53.5 12.8 L64.2 11.7 L74.9 10.5 L85.6 9.5 L96.3 8.6 L107 8" />
      <path strokeWidth="4.5" d="M-16 0 H107" />
      <path strokeWidth="2.6" strokeLinejoin="round" d="M107 0 V16 L96.3 17.2 L85.6 19 L74.9 21 L64.2 23.3 L53.5 25.7 L42.8 28.4 L32.1 31.1 L21.4 34 L10.7 36.9 L0 40 L-16 38 M0 0 V40" />
      <path strokeWidth="1" d="M0 -5 H106 M10.7 -5 V0 M21.4 -5 V0 M32.1 -5 V0 M42.8 -5 V0 M53.5 -5 V0 M64.2 -5 V0 M74.9 -5 V0 M85.6 -5 V0 M96.3 -5 V0" />
      <path strokeWidth="1.4" d="M24 0 V-19 M78 0 V-19 M51 0 V-16 M101 0 V-14" />
      <g stroke="none">
        <circle cx="24" cy="-20" r="6" fill="#FFD49A" opacity=".3" /><circle cx="78" cy="-20" r="6" fill="#FFD49A" opacity=".3" />
        <circle cx="24" cy="-20" r="2" fill="#FFE6C9" /><circle cx="78" cy="-20" r="2" fill="#FFE6C9" />
        <path d="M51 -16 L60 -13.5 L51 -11 Z" fill="#EE6125" opacity=".9" /><path d="M101 -14 L109 -12 L101 -10 Z" fill="#45A9CB" />
        <g fill="#FFD49A" opacity=".85"><circle cx="16" cy="-2" r="1" /><circle cx="37.5" cy="-2" r="1" /><circle cx="59" cy="-2" r="1" /><circle cx="80.3" cy="-2" r="1" /><circle cx="102" cy="-2" r="1" /></g>
        <circle className="sc-blink" cx="105" cy="-8" r="2" fill="#FF5A3C" />
      </g>
    </g>
  );
}

function Pier({ x, lampX }: { x: number; lampX: number }) {
  return (
    <g>
      <rect x={x} y="349" width="76" height="50" style={f('--pier')} />
      <path d={`M${x} 362 h76 M${x} 375 h76 M${x} 388 h76`} style={{ stroke: 'var(--pier-line)' }} strokeWidth="1" />
      <rect x={x - 4} y="344" width="84" height="6" style={f('--pier-top')} />
      <path d={`M${x - 4} 344 h84`} stroke="#F1A487" strokeWidth="1.2" opacity=".65" />
      <rect x={x - 2} y="397" width="80" height="6" style={f('--bridge')} opacity=".8" />
      <path d={`M${lampX} 344 V320 M${lampX - 5} 324 h10`} style={{ stroke: 'var(--bridge)' }} strokeWidth="1.6" />
      <circle cx={lampX - 5} cy="323" r="6" fill="#FFD49A" opacity=".32" /><circle cx={lampX + 5} cy="323" r="6" fill="#FFD49A" opacity=".32" />
      <circle cx={lampX - 5} cy="323" r="2" fill="#FFE6C9" /><circle cx={lampX + 5} cy="323" r="2" fill="#FFE6C9" />
    </g>
  );
}

/** Угол пролётов растёт с тратами; поднимаются плавно, с постоянной скоростью, чтобы движение было видно */
function useLift(target: number) {
  const [state, setState] = useState({ angle: 0, dur: 3 });
  const shown = useRef(0);
  useEffect(() => {
    const go = () => {
      const dur = Math.max(3, Math.abs(target - shown.current) / 4.5);
      shown.current = target;
      setState({ angle: target, dur });
    };
    // при открытии мост секунду стоит сведённым, потом разводится до уровня трат
    const t = setTimeout(go, shown.current === 0 && target > 0 ? 1200 : 0);
    return () => clearTimeout(t);
  }, [target]);
  return state;
}

const DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/**
 * Сцена «Недели». spent — доля недельного лимита (0…1, больше — перерасход), today — индекс дня недели (пн = 0).
 * children — текст поверх неба (дата, остаток).
 */
export function WeekScene({ spent, today, children }: { spent: number; today: number; children: ReactNode }) {
  const target = 72 * Math.sqrt(Math.min(1, Math.max(0, spent)));
  const { angle, dur } = useLift(target);
  const leaf = (origin: number): CSSProperties => ({
    transformBox: 'view-box', transformOrigin: `${origin}px 386px`,
    transform: `rotate(${origin < 195 ? -angle : angle}deg)`, transition: `transform ${dur}s cubic-bezier(.42,0,.4,1)`,
  });
  return (
    <div className="relative">
      <svg viewBox="0 34 390 478" className="block h-auto w-full" role="img"
        aria-label={`Дворцовый мост ${angle < 2 ? 'сведён' : angle > 65 ? 'разведён полностью' : 'разводится'}: потрачено ${Math.round(Math.min(1, spent) * 100)}% недели`}>
        <defs>
          <SkyGradients id="ws" />
          <linearGradient id="ws-path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFD9B0" stopOpacity=".9" /><stop offset="1" stopColor="#FFD9B0" stopOpacity="0" /></linearGradient>
          <linearGradient id="ws-cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={stop('--cloud-1')} /><stop offset="1" style={stop('--cloud-2')} /></linearGradient>
          <clipPath id="ws-skyclip"><rect y="0" width="390" height="331" /></clipPath>
          <clipPath id="ws-river"><rect x="0" y="330" width="390" height="140" /></clipPath>
          <filter id="ws-rip" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.11" numOctaves="1" seed="3" /><feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G" /></filter>
        </defs>

        <rect width="390" height="331" fill="url(#ws-sky)" />
        <rect className="sc-warm" width="390" height="331" fill="url(#ws-warm)" />
        <g clipPath="url(#ws-skyclip)">
          <g className="sc-set">
            <circle className="sc-halo" cx="238" cy="322" r="150" fill="url(#ws-halo)" />
            <circle cx="238" cy="322" r="20" fill="url(#ws-sun)" />
          </g>
        </g>

        <g className="sc-cloud">
          <path d="M206 206 Q280 194 392 202 Q320 214 206 206 Z" fill="url(#ws-cloud)" opacity=".9" />
          <path d="M240 250 Q300 242 360 248 Q300 256 240 250 Z" fill="url(#ws-cloud)" opacity=".8" />
        </g>
        <g className="sc-cloud" style={{ animationDuration: '34s', animationDelay: '-10s' }}>
          <path d="M-10 226 Q50 216 150 222 Q80 232 -10 226 Z" fill="url(#ws-cloud)" opacity=".85" />
          <path d="M40 272 Q90 265 150 270 Q96 278 40 272 Z" fill="url(#ws-cloud)" opacity=".7" />
        </g>
        <g className="sc-gull" style={{ stroke: 'var(--city-near)' }} fill="none" strokeLinecap="round">
          <g transform="translate(0 238)"><path className="sc-flap" d="M0 4 Q4 0 8 4 Q12 0 16 4" strokeWidth="1.4" /></g>
          <g transform="translate(26 248) scale(.75)"><path className="sc-flap" style={{ animationDelay: '-.4s' }} d="M0 4 Q4 0 8 4 Q12 0 16 4" strokeWidth="1.6" /></g>
        </g>

        <City />
        <g fill="#FFD9A0">{WINDOWS.map(([x, y], i) => <circle key={i} className="sc-tw" style={{ animationDelay: `${-i * 0.7}s` }} cx={x} cy={y} r="1" />)}</g>

        <rect y="330" width="390" height="140" fill="url(#ws-water)" />
        <g clipPath="url(#ws-river)">
          <g className="sc-refl"><g filter="url(#ws-rip)" opacity=".34" transform="translate(0 660) scale(1 -1)"><City /></g></g>
          <path d="M218 331 L258 331 L300 470 L176 470 Z" fill="url(#ws-path)" opacity=".35" />
          <g stroke="#FFE0BE" strokeWidth="1.6" strokeLinecap="round">
            {GLITTER.map(([x, y, w], i) => <path key={i} className="sc-glit" style={{ animationDelay: `${-i * 0.37}s` }} d={`M${x} ${y} h${w}`} />)}
          </g>
          <g style={f('--bridge')} opacity=".3"><rect x="22" y="403" width="76" height="30" /><rect x="292" y="403" width="76" height="30" /></g>
        </g>

        <g style={leaf(88)}><g transform="translate(88 352)"><Leaf /></g></g>
        <g style={leaf(302)}><g transform="translate(302 352) scale(-1 1)"><Leaf /></g></g>

        <g style={f('--bridge')}>
          <rect x="-10" y="352" width="36" height="6" /><path d="M-10 358 H24 V362 Q8 372 -10 366 Z" />
          <rect x="364" y="352" width="36" height="6" /><path d="M366 358 H400 V366 Q382 372 366 362 Z" />
        </g>
        <path d="M-10 348.5 H24 M366 348.5 H400 M9 352 V316 M3 320 H15 M381 352 V316 M375 320 H387" style={{ stroke: 'var(--bridge)' }} strokeWidth="1.4" />
        <g fill="#FFD49A" opacity=".3"><circle cx="3" cy="319" r="6" /><circle cx="15" cy="319" r="6" /><circle cx="375" cy="319" r="6" /><circle cx="387" cy="319" r="6" /></g>
        <g fill="#FFE6C9"><circle cx="3" cy="319" r="2" /><circle cx="15" cy="319" r="2" /><circle cx="375" cy="319" r="2" /><circle cx="387" cy="319" r="2" /></g>
        <Pier x={22} lampX={30} />
        <Pier x={292} lampX={360} />

        <rect y="470" width="390" height="9" style={f('--parapet')} />
        <path d="M0 470.5 H390" style={{ stroke: 'var(--parapet-line)' }} />
        {DAYS.map((d, i) => {
          const x = 18 + (i + 0.5) * (354 / 7);
          const past = i < today, now = i === today;
          return (
            <g key={d} transform={`translate(${x - 14} 420)`}>
              {now && <circle className="sc-glow" cx="14" cy="10" r="15" fill="#FF7B42" opacity=".35" />}
              <circle cx="14" cy="10" r="9" fill={now ? 'rgba(255,123,66,.55)' : past ? 'transparent' : 'rgba(255,214,160,.6)'} />
              <path d="M9 6 H19 L17 15 H11 Z" fill={now ? '#FF9A63' : past ? '#8FA6B3' : '#FFE0B8'} />
              <path d="M8 6.5 L14 1 L20 6.5 Z M13 15 h2 v38 h-2 Z M10 52 h8 v6 h-8 Z" style={f('--bridge')} />
              <text x="14" y="76" textAnchor="middle" fontSize="12" fontWeight={now ? 600 : 400}
                style={{ fill: now ? 'var(--neg)' : 'var(--muted)', fontFamily: 'var(--font-sans)' }}>{d}</text>
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-x-0 top-0">{children}</div>
    </div>
  );
}

/** Узкая панорама для шапок «Платежей», «Плана» и «Бюджета»: закат, город, полоска воды */
export function SkyHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="relative">
      <svg viewBox="0 0 390 160" className="block h-auto w-full" aria-hidden="true">
        <defs>
          <SkyGradients id="sh" />
          <clipPath id="sh-skyclip"><rect width="390" height="149" /></clipPath>
        </defs>
        <rect width="390" height="149" fill="url(#sh-sky)" />
        <rect className="sc-warm" width="390" height="149" fill="url(#sh-warm)" />
        <g clipPath="url(#sh-skyclip)">
          <g className="sc-set-short">
            <circle className="sc-halo" cx="340" cy="146" r="70" fill="url(#sh-halo)" />
            <circle cx="340" cy="146" r="11" fill="url(#sh-sun)" />
          </g>
        </g>
        <g className="sc-gull" style={{ stroke: 'var(--city-near)', animationDuration: '32s' }} fill="none" strokeLinecap="round">
          <path d="M0 122 Q3.5 118.5 7 122 Q10.5 118.5 14 122" strokeWidth="1.3" />
        </g>
        <rect x="0" y="145" width="390" height="4" style={f('--city-far')} opacity=".55" />
        <g transform="translate(186 9.4) scale(.42)"><City /></g>
        <rect y="148" width="390" height="12" fill="url(#sh-water)" />
        <g stroke="#FFE0BE" strokeWidth="1.2" strokeLinecap="round">
          <path className="sc-glit" d="M330 151 h18" /><path className="sc-glit" style={{ animationDelay: '-.9s' }} d="M322 155 h12" /><path className="sc-glit" style={{ animationDelay: '-1.7s' }} d="M344 157 h16" />
        </g>
      </svg>
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0" style={{ color: 'var(--scene-ink)' }}>
          <h1 className="font-display text-[24px] leading-tight font-medium first-letter:uppercase">{title}</h1>
          {subtitle && <div className="mt-1 text-[13.5px]" style={{ color: 'var(--scene-muted)' }}>{subtitle}</div>}
        </div>
        {action}
      </div>
    </header>
  );
}

/** Кнопка поверх неба: полупрозрачная, чтобы не спорить с закатом */
export function SkyButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-black/15 bg-white/35 text-[#0a2433] backdrop-blur-md transition active:scale-95 dark:border-white/15 dark:bg-white/10 dark:text-[#f2f6f8]">
      {children}
    </button>
  );
}

/* ---------- значки нижней панели ---------- */

type IconProps = { size?: number; strokeWidth?: number; className?: string };

export function BridgeIcon({ size = 22, strokeWidth = 1.6, className }: IconProps) {
  return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true"><path d="M2 15h6.5M15.5 15H22M9 15 6 7M15 15l3-8M6 15v5M18 15v5M1 20h22" /></svg>;
}

export function SpireIcon({ size = 20, strokeWidth = 1.6, className }: IconProps) {
  return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true"><path d="M12 2v7M10 9h4l1 4H9zM9 13v7M15 13v7M5 20h14" /></svg>;
}

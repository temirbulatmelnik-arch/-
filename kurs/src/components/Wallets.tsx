// «Где деньги» на «Сегодня» (версия 0.3): три сосуда с уровнем воды — свои на карте, взятое в долг по мосту и
// резерв. Сплошная вода — свои деньги, штриховка — чужие. Нажатие — подробности счёта.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { BridgeState } from '../domain/bridge';
import { Money } from './ui';

const WAVE = 'M0 4 Q7.5 1 15 4 T30 4 T45 4 T60 4 T75 4 T90 4 T105 4 T120 4';

function Vessel({ label, value, caption, level, fill, ink, onClick, i, alert }: {
  label: string; value: number; caption: ReactNode; level: number; fill: string; ink: string; onClick: () => void; i: number; alert?: boolean;
}) {
  const h = Math.max(0.08, Math.min(1, level));
  // деньги ушли или пришли (отметили платёж, записали трату) — по воде расходится круг, уровень плавно меняется
  const prev = useRef(value);
  const [ripple, setRipple] = useState(0);
  useEffect(() => { if (Math.round(prev.current) !== Math.round(value)) { prev.current = value; setRipple(n => n + 1); } }, [value]);
  return (
    <button type="button" onClick={onClick}
      className="relative flex min-h-[86px] min-w-0 flex-col items-start overflow-hidden rounded-[20px] border bg-surface px-3 pt-2.5 pb-2.5 text-left transition-transform duration-100 active:scale-[.97]"
      style={{ borderColor: `color-mix(in oklab, ${ink} 26%, var(--line))`, boxShadow: `0 12px 22px -18px ${ink}` }}>
      {/* вода: уровень — доля от нужного; поднимается при появлении и плавно меняется вместе с числом */}
      <span aria-hidden="true" className="sc-fill absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-[cubic-bezier(.32,.72,0,1)]"
        style={{ height: `${h * 100}%`, background: fill, opacity: 0.3, animationDelay: `${0.25 + i * 0.08}s` }}>
        {/* волна качается: три маленьких слоя на весь экран — дёшево (в календаре их было 30, там волна только у выбранного дня) */}
        <svg className="sc-wave absolute -top-1 left-0 h-1.5 w-[200%]" viewBox="0 0 120 8" preserveAspectRatio="none"><path d={WAVE} fill="none" strokeWidth="1.3" style={{ stroke: ink }} /></svg>
      </span>
      <span className="relative text-[12px] font-medium" style={{ color: ink }}>{label}</span>
      {ripple > 0 && <span key={ripple} aria-hidden="true" className="vessel-ripple absolute left-1/2 size-10 rounded-[50%] border-2" style={{ bottom: `calc(${h * 100}% - 20px)`, borderColor: ink }} />}
      <span className={`figure relative mt-0.5 max-w-full whitespace-nowrap text-[clamp(15px,4.6vw,20px)] leading-tight ${alert ? 'text-warn' : ''}`}><Money value={value} kopecks /></span>
      <span className="relative mt-auto pt-1 text-[11px] leading-tight text-muted">{caption}</span>
    </button>
  );
}

export function Wallets({ card, weekLimit, loan, reserve, onCard, onLoan, onReserve }: {
  /** остаток карты по учёту; null — нет точки отсчёта */
  card: number | null; weekLimit: number;
  /** мост на кредитке; null — моста нет, с кредиток не берём */
  loan: BridgeState | null;
  reserve: number;
  onCard: () => void; onLoan: () => void; onReserve: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2" style={{ '--own-fill': 'linear-gradient(180deg, var(--own-2), var(--own))' } as CSSProperties}>
        <Vessel i={0} label="Свои на неделю" value={Math.max(0, card ?? 0)} caption={card == null ? 'уточнить остаток' : 'на покупки'}
          level={(card ?? 0) / Math.max(1, weekLimit)} fill="linear-gradient(180deg, var(--own-2), var(--own))" ink="var(--own)" onClick={onCard} />
        <Vessel i={1} label="Резерв" value={reserve} caption="платежи и запас"
          level={reserve / Math.max(1, weekLimit * 6)} fill="linear-gradient(180deg, var(--rsv-2), var(--rsv))" ink="var(--rsv)" onClick={onReserve} />
      </div>
      {loan && loan.used > 0 && <button type="button" onClick={onLoan} className="flex min-h-11 w-full flex-wrap items-center justify-between gap-1 rounded-xl bg-surface px-3 py-2 text-left text-[13px]" style={{ color: 'var(--loan)' }}>
        <span>Кредитный мост · уже использовано</span><Money value={loan.used} kopecks />
      </button>}
    </div>
  );
}

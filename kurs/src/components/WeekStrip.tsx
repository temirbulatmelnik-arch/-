// Строка «Неделя» под сценой «Сегодня» (вариант Б — решение владельца, DESIGN.md): сколько недели ушло и откуда — свои
// деньги, в долг по мосту (кредитка в лимите недели) и сверх лимита (новый долг, красным за чертой лимита). Ниже — сколько
// моста взято из общего лимита и до какого числа вернуть. Нажатие — итог недели.
import { ChevronRight } from 'lucide-react';
import type { BridgeState, WeekMoney } from '../domain/bridge';
import { weekParts } from '../domain/bridge';
import { ddmm } from '../domain/dates';
import { Money } from './ui';

const LOAN = 'repeating-linear-gradient(135deg, #c77dff 0 5px, #9b5de5 5px 10px)';
const OVER = 'repeating-linear-gradient(135deg, #ee6125 0 5px, #c9471a 5px 10px)';
const pct = (x: number, of: number) => `${of > 0 ? (Math.max(0, x) / of) * 100 : 0}%`;

export function WeekStrip({ money, bridge, onOpen }: { money: WeekMoney; bridge: BridgeState | null; onOpen: () => void }) {
  const p = weekParts(money);
  const left = money.limit - money.spent;
  const parts = [
    { key: 'own', label: 'свои', value: p.own, fill: 'linear-gradient(90deg, var(--ring-1), var(--ring-2))', ink: 'var(--ink)' },
    { key: 'loan', label: 'в долг', value: p.loan, fill: LOAN, ink: 'var(--loan-ink)' },
    { key: 'over', label: 'сверх лимита', value: p.over, fill: OVER, ink: 'var(--neg)' },
  ];
  return (
    <button type="button" onClick={onOpen} aria-label={`Неделя: потрачено ${Math.round(money.spent)} из ${Math.round(money.limit)} ₽. Итог недели`}
      className="card block w-full px-4 pt-3 pb-3 text-left transition-transform duration-100 active:scale-[.985]">
      <span className="flex items-baseline justify-between gap-3 text-[13.5px]">
        <span className="font-medium whitespace-nowrap">Неделя: <Money value={money.spent} className="font-display" /> из <Money value={money.limit} className="font-display" /></span>
        {/* при перерасходе он уже в итоге недели и в легенде красным — второй раз не пишем */}
        <span className="flex shrink-0 items-center gap-0.5 text-[12.5px]" style={{ color: 'var(--pos)' }}>
          {p.over === 0 && <>осталось <Money value={left} /></>}
          <ChevronRight size={14} className="text-faint" />
        </span>
      </span>
      {/* полоса: шкала — лимит или все траты; черта — лимит недели, правее неё — красное */}
      <span className="relative mt-2.5 flex h-3.5 overflow-hidden rounded-full" style={{ background: 'color-mix(in oklab, var(--ink) 9%, transparent)' }}>
        {parts.map(x => <span key={x.key} className="h-full" style={{ width: pct(x.value, p.scale), background: x.fill }} />)}
        {p.over > 0 && <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: pct(money.limit, p.scale) }} />}
      </span>
      <span className="mt-2.5 grid grid-cols-3 gap-1.5 text-[11.5px] leading-tight text-muted">
        {parts.map(x => (
          <span key={x.key} className={x.value > 0 || x.key === 'own' ? '' : 'opacity-40'}>
            <span className="mr-1.5 inline-block size-2.5 rounded-[3px] align-[-1px]" style={{ background: x.fill }} />{x.label}
            <span className="figure mt-0.5 block text-[15px]" style={{ color: x.ink }}><Money value={x.value} /></span>
          </span>
        ))}
      </span>
      {bridge && (
        <>
          <span className="my-2.5 block h-px" style={{ background: 'var(--line)' }} />
          <span className="flex items-center gap-2.5 text-[12px] text-muted">
            <span className="whitespace-nowrap">Мост <span className="font-medium" style={{ color: 'var(--loan-ink)' }}><Money value={bridge.used} /></span> из <Money value={bridge.bridge.cap} /></span>
            <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in oklab, var(--loan-ink) 16%, transparent)' }}>
              <span className="block h-full rounded-full" style={{ width: pct(Math.min(bridge.used, bridge.bridge.cap), bridge.bridge.cap), background: bridge.used > bridge.bridge.cap ? OVER : LOAN }} />
            </span>
            {bridge.bridge.repayBy && <span className="whitespace-nowrap">вернуть до {ddmm(bridge.bridge.repayBy)}</span>}
          </span>
        </>
      )}
    </button>
  );
}

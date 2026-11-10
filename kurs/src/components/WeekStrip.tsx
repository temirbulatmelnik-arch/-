// Строка «Неделя» под сценой «Сегодня» (вариант Б — решение владельца, DESIGN.md): сколько недели ушло и откуда — свои
// деньги, в долг по мосту (кредитка в лимите недели) и сверх лимита (новый долг, красным за чертой лимита). Сколько моста
// взято всего — в сосуде «В долг» ниже (components/Wallets.tsx). Нажатие — итог недели.
import { ChevronRight } from 'lucide-react';
import type { WeekMoney } from '../domain/bridge';
import { weekParts } from '../domain/bridge';
import { Money } from './ui';

const LOAN = 'var(--loan-hatch)';
const OVER = 'var(--over-hatch)';
const pct = (x: number, of: number) => `${of > 0 ? (Math.max(0, x) / of) * 100 : 0}%`;

export function WeekStrip({ money, onOpen }: { money: WeekMoney; onOpen: () => void }) {
  const p = weekParts(money);
  const left = money.limit - money.spent;
  const parts = [
    { key: 'own', label: 'свои', value: p.own, fill: 'linear-gradient(90deg, var(--ring-1), var(--ring-2))', ink: 'var(--ink)' },
    { key: 'loan', label: 'в долг', value: p.loan, fill: LOAN, ink: 'var(--loan)' },
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
    </button>
  );
}

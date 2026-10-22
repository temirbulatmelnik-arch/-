// Платёж, поступление или понедельник: отметить, поправить сумму, распределить премию.
import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { dayMonth, relDays, weekdayFull } from '../domain/dates';
import { parseAmount, rub } from '../domain/money';
import type { CalEvent } from '../domain/types';
import { useStore } from '../store/store';
import { toast, useToday, useUi } from '../store/ui';

const BONUS_KINDS = ['bonusQuarter', 'bonusYear', 'vacation', 'thirteenth'];
export const isBonus = (e: CalEvent) => e.kind === 'income' && !!e.incomeKind && BONUS_KINDS.includes(e.incomeKind);

export function EventSheet() {
  const e = useUi(s => s.event);
  const set = useUi(s => s.set);
  return (
    <Sheet open={!!e} onClose={() => set({ event: null })} title={e?.kind === 'income' ? 'Поступление' : e?.kind === 'weekly' ? 'Понедельник' : 'Платёж'}>
      {e && <Body key={e.key} e={e} />}
    </Sheet>
  );
}

function Body({ e }: { e: CalEvent }) {
  const now = useToday();
  const mark = useStore(s => s.marks[e.key]);
  const debt = useStore(s => (e.debtId ? s.debts.find(d => d.id === e.debtId) : undefined));
  const markEvent = useStore(s => s.markEvent);
  const set = useUi(s => s.set);
  const [amount, setAmount] = useState(String(Math.round((mark?.amount ?? e.amount) * 100) / 100));
  const value = parseAmount(amount) ?? 0;
  const close = () => set({ event: null });

  const when = e.dateMode === 'until' ? `до ${dayMonth(e.date)}` : e.dateMode === 'approx' ? `около ${dayMonth(e.date)}` : e.dateMode === 'month' ? 'в течение месяца' : `${dayMonth(e.date)}, ${weekdayFull(e.date)}`;

  const done = () => {
    if (isBonus(e)) { set({ event: null, bonus: { event: { ...e, amount: value } } }); return; }
    markEvent(e, true, value);
    toast(e.kind === 'income' ? 'Отмечено: пришло' : e.kind === 'weekly' ? 'Отмечено: лимит переведён' : debt ? `Оплачено. Остаток ${debt.short} пересчитан` : 'Отмечено: оплачено');
    close();
  };

  return (
    <div className="space-y-4 pt-1">
      <div className="card p-5">
        <div className="text-[18px] leading-snug font-extrabold">{e.title}</div>
        <div className="mt-1 text-[14px] font-medium text-muted">{when}{e.dateMode !== 'month' ? ` · ${relDays(now, e.date)}` : ''}</div>
        <div className={`mt-3 text-[34px] font-extrabold tracking-tight ${e.kind === 'income' ? 'text-accent' : ''}`}>{rub(mark?.amount ?? e.amount, { approx: e.approx && !mark?.done })}</div>
        {e.note && <p className="mt-2 rounded-xl bg-warn/12 px-3 py-2 text-[13.5px] leading-snug">{e.note}</p>}
        {debt && (
          <button type="button" onClick={() => set({ event: null, debt: debt.id })} className="mt-3 text-[14px] font-semibold text-accent">
            {debt.name}: остаток {rub(debt.balance)} →
          </button>
        )}
      </div>

      {mark?.done ? (
        <>
          <p className="rounded-2xl bg-accent/10 p-4 text-[14px] font-semibold text-accent">
            {e.kind === 'income' ? 'Пришло' : e.kind === 'weekly' ? 'Лимит переведён' : 'Оплачено'}: {rub(mark.amount ?? e.amount)}
          </p>
          <SecondaryButton onClick={() => { markEvent(e, false); toast('Отметка снята'); close(); }} className="w-full"><Undo2 size={17} /> Снять отметку</SecondaryButton>
        </>
      ) : (
        <>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-muted">{e.kind === 'income' ? 'Сколько пришло' : e.kind === 'weekly' ? 'Сколько перевели' : 'Сколько заплатили'}</span>
            <div className="flex items-baseline gap-2 rounded-2xl bg-surface-2 px-4 py-3">
              <input value={amount} onChange={x => setAmount(x.target.value)} inputMode="decimal" className="w-full bg-transparent text-[26px] font-extrabold outline-none" />
              <span className="text-[20px] font-bold text-muted">₽</span>
            </div>
          </label>
          {e.kind === 'payment' && debt && debt.rule.type !== 'schedule' && (
            <p className="text-[13px] leading-snug text-muted">Остаток долга уменьшится примерно на {rub(Math.max(0, value - (debt.balance * debt.rate) / 12))}: часть платежа уходит на проценты ({rub((debt.balance * debt.rate) / 12)} в месяц). Точный остаток — со скриншота банка.</p>
          )}
          {isBonus(e) && <p className="text-[13px] leading-snug text-muted">Дальше — распределение премии: резерв до следующей премии, остальное сегодня же в долг.</p>}
          <PrimaryButton onClick={done} disabled={value <= 0}>
            {e.kind === 'income' ? (isBonus(e) ? 'Пришла — распределить' : 'Пришло') : e.kind === 'weekly' ? 'Перевёл' : 'Оплачено'}
          </PrimaryButton>
        </>
      )}
    </div>
  );
}

// Платёж, поступление или понедельник: отметить, поправить сумму и дату (у кредиток они плавают), распределить премию.
import { CalendarDays, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { AmountInput, Money, PrimaryButton, Row, SecondaryButton, Sheet } from '../components/ui';
import { GROUP_LABEL, whenText } from '../components/rows';
import { eventGroup } from '../domain/calendar';
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
    <Sheet open={!!e} onClose={() => set({ event: null })} title={e?.title ?? ''} subtitle={e ? GROUP_LABEL[eventGroup(e)] : undefined}>
      {e && <Body key={e.key} e={e} />}
    </Sheet>
  );
}

function Body({ e }: { e: CalEvent }) {
  const now = useToday();
  const mark = useStore(s => s.marks[e.key]);
  const override = useStore(s => s.overrides[e.key]);
  const debt = useStore(s => (e.debtId ? s.debts.find(d => d.id === e.debtId) : undefined));
  const { markEvent, setOverride, clearOverride, updateDebt } = useStore.getState();
  const set = useUi(s => s.set);
  const group = eventGroup(e);
  const [amount, setAmount] = useState(String(Math.round((mark?.amount ?? e.amount) * 100) / 100));
  const [editing, setEditing] = useState(false);
  const [newAmount, setNewAmount] = useState(String(e.amount));
  const [newDate, setNewDate] = useState(e.date);
  const value = parseAmount(amount) ?? 0;
  const close = () => set({ event: null });

  const done = () => {
    if (isBonus(e)) { set({ event: null, bonus: { event: { ...e, amount: value } } }); return; }
    markEvent(e, true, value);
    toast(e.kind === 'income' ? 'Отмечено: пришло' : e.kind === 'weekly' ? 'Отмечено: лимит переведён' : debt ? `Оплачено. Остаток ${debt.short} пересчитан` : 'Отмечено: оплачено');
    close();
  };

  const saveEdit = () => {
    const a = parseAmount(newAmount);
    setOverride(e.key, { ...(a != null && a !== e.amount ? { amount: a } : {}), ...(newDate && newDate !== e.date ? { date: newDate } : {}) });
    toast('Сумма и дата обновлены');
    close();
  };

  return (
    <div className="space-y-4 pt-1">
      <div className="card px-5 py-4">
        <Money value={mark?.done && mark.amount != null ? mark.amount : e.amount} approx={e.approx && !mark?.done} sign={e.kind === 'income'}
          className={`figure block text-[40px] leading-none ${e.kind === 'income' ? 'text-pos' : ''}`} />
        <div className="mt-3 divide-y divide-line">
          <Row label="Когда">{e.dateMode === 'month' ? 'в течение месяца' : `${whenText(e)}, ${weekdayFull(e.date)}`}</Row>
          {e.dateMode !== 'month' && !mark?.done && <Row label="Осталось">{relDays(now, e.date)}</Row>}
          {debt && <Row label="Остаток долга"><button type="button" onClick={() => set({ event: null, debt: debt.id })} className="text-brass"><Money value={debt.balance} /></button></Row>}
          {override && <Row label="Изменено вручную"><button type="button" onClick={() => { clearOverride(e.key); toast('Вернул расчётные сумму и дату'); close(); }} className="text-brass">вернуть расчёт</button></Row>}
        </div>
        {e.note && <p className="mt-3 rounded-xl bg-brass/10 px-3 py-2.5 text-[13px] leading-snug">{e.note}</p>}
      </div>

      {mark?.done ? (
        <>
          <p className="rounded-2xl bg-pos/10 px-4 py-3 text-[14px] text-pos">
            {e.kind === 'income' ? 'Пришло' : e.kind === 'weekly' ? 'Лимит переведён' : 'Оплачено'}: {rub(mark.amount ?? e.amount)}
          </p>
          <SecondaryButton onClick={() => { markEvent(e, false); toast('Отметка снята'); close(); }} className="w-full"><Undo2 size={16} strokeWidth={1.5} /> Снять отметку</SecondaryButton>
        </>
      ) : editing ? (
        <div className="card space-y-3 p-4">
          <div className="text-[13px] text-muted">{group === 'debt' ? 'Сумма и дата из приложения банка — у кредиток они меняются каждый месяц.' : 'Только для этого месяца.'}</div>
          <AmountInput value={newAmount} onChange={setNewAmount} size="md" />
          <input type="date" value={newDate} onChange={x => setNewDate(x.target.value || e.date)} className="field" aria-label="Дата платежа" />
          {debt && typeof debt.dueDay === 'number' && newDate.slice(8) !== String(debt.dueDay).padStart(2, '0') && (
            <button type="button" onClick={() => { updateDebt(debt.id, { dueDay: Number(newDate.slice(8)) }); toast(`Теперь ${debt.short} — ${Number(newDate.slice(8))}-го каждый месяц`); }}
              className="text-[13px] font-medium text-brass">Сделать {Number(newDate.slice(8))}-е днём платежа каждый месяц</button>
          )}
          <PrimaryButton onClick={saveEdit} tone="ink">Сохранить</PrimaryButton>
        </div>
      ) : (
        <>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-muted">{e.kind === 'income' ? 'Сколько пришло' : e.kind === 'weekly' ? 'Сколько перевели' : 'Сколько заплатили'}</div>
            <AmountInput value={amount} onChange={setAmount} size="md" />
          </div>
          {e.kind === 'payment' && debt && debt.rule.type !== 'schedule' && (
            <p className="text-[12.5px] leading-snug text-muted">Долг уменьшится примерно на {rub(Math.max(0, value - (debt.balance * debt.rate) / 12))}: часть платежа съедают проценты ({rub((debt.balance * debt.rate) / 12)} в месяц). Точный остаток — из выписки или скриншота банка.</p>
          )}
          {isBonus(e) && <p className="text-[12.5px] leading-snug text-muted">Дальше — распределение премии: резерв до следующей премии, остальное сегодня же в долг.</p>}
          <PrimaryButton onClick={done} disabled={value <= 0}>
            {e.kind === 'income' ? (isBonus(e) ? 'Пришла — распределить' : 'Пришло') : e.kind === 'weekly' ? 'Перевёл' : 'Оплачено'}
          </PrimaryButton>
          {e.kind !== 'weekly' && (
            <SecondaryButton onClick={() => (group === 'fixed' ? set({ event: null, fixed: true }) : setEditing(true))} className="w-full">
              <CalendarDays size={16} strokeWidth={1.5} /> {group === 'fixed' ? 'Изменить сумму или число месяца' : `Изменить сумму или дату${e.dateMode !== 'month' ? ` (${dayMonth(e.date)})` : ''}`}
            </SecondaryButton>
          )}
        </>
      )}
    </div>
  );
}

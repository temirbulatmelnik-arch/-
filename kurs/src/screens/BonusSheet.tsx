// Пришла премия: сколько оставить в резерве и сколько сегодня же отправить досрочно в долг.
import { useState } from 'react';
import { AmountInput, Field, PrimaryButton, Sheet } from '../components/ui';
import { LIFE_ACCOUNT } from '../domain/accounts';
import { parseAmount } from '../domain/money';
import { uid, useStore } from '../store/store';
import { toast, useToday, useUi } from '../store/ui';

export function BonusSheet() {
  const b = useUi(s => s.bonus);
  const set = useUi(s => s.set);
  return (
    <Sheet open={!!b} onClose={() => set({ bonus: null })} title="Пришла премия">
      {b && <Body key={b.event?.key ?? 'manual'} />}
    </Sheet>
  );
}

function Body() {
  const now = useToday();
  const ev = useUi(s => s.bonus?.event);
  const set = useUi(s => s.set);
  const applyBonus = useStore(s => s.applyBonus);
  const [id] = useState(uid);
  const [amount, setAmount] = useState(ev ? String(ev.amount) : '');
  const [date, setDate] = useState(now);
  const value = parseAmount(amount) ?? 0;
  const receive = () => {
    if (!applyBonus({ id, amount: value, accountId: LIFE_ACCOUNT, title: ev?.title ?? 'Премия', eventKey: ev?.key, date })) {
      toast('Поступление уже учтено или данные неполны');
      return;
    }
    toast('Фактическое поступление записано');
    set({ bonus: null });
  };

  return (
    <div className="space-y-4 pt-1">
      <div className="card space-y-3 p-4">
        <Field label={ev?.title ?? 'Сумма поступления'}><AmountInput value={amount} onChange={setAmount} /></Field>
        <p className="text-[13px] text-muted">Зачисление на карту жизни. После подтверждения появится предложение перевести деньги в резерв.</p>
        <Field label="Фактическая дата"><input className="field" type="date" value={date} max={now} onChange={e => setDate(e.target.value)} /></Field>
      </div>
      <PrimaryButton onClick={receive} disabled={value <= 0 || !date || date > now}>Подтвердить зачисление</PrimaryButton>
    </div>
  );
}

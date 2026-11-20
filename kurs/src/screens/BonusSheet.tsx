// Пришла премия: сколько оставить в резерве и сколько сегодня же отправить досрочно в долг.
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCoverage } from '../components/Coverage';
import { AmountInput, Field, Money, PrimaryButton, Sheet } from '../components/ui';
import { accountOptions, LIFE_ACCOUNT } from '../domain/accounts';
import { safePrepayment } from '../domain/coverage';
import { parseAmount } from '../domain/money';
import { splitBonus } from '../domain/plan';
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
  const [debts, book, applyBonus] = useStore(useShallow(s => [s.debts, s.accountBook, s.applyBonus]));
  const { input } = useCoverage('cautious');
  const [id] = useState(uid);
  const [amount, setAmount] = useState(ev ? String(ev.amount) : '');
  const [account, setAccount] = useState(LIFE_ACCOUNT);
  const [date, setDate] = useState(now);
  const value = parseAmount(amount) ?? 0;
  const current = input.cash?.[account];
  // Введённая сумма только для превью. Не моделируем второй приход ожидаемой выплаты из календаря.
  const safe = useMemo(() => current == null || !input.cash ? 0 : safePrepayment({
    ...input, cash: { ...input.cash, [account]: current + value },
    marks: ev ? { ...input.marks, [ev.key]: { done: true, at: '' } } : input.marks,
  }, now, account), [current, input, account, value, ev, now]);
  const split = useMemo(() => splitBonus({ amount: value, reserve: current ?? 0, date: now, debts, safeLimit: safe }), [value, current, now, debts, safe]);

  const receive = () => {
    if (!applyBonus({ id, amount: value, accountId: account, title: ev?.title ?? 'Премия', eventKey: ev?.key, date })) {
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
        <Field label="Счёт зачисления"><select className="field" value={account} onChange={e => setAccount(e.target.value)}>
          {accountOptions(book).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></Field>
        <Field label="Фактическая дата"><input className="field" type="date" value={date} max={now} onChange={e => setDate(e.target.value)} /></Field>
      </div>
      <div className="card space-y-2 p-4">
        <div className="text-[13px] text-muted">Прогноз после фактического зачисления</div>
        <p>По осторожному сценарию доступно на досрочное погашение до <Money value={safe} />.</p>
        <p className="text-[13px] text-muted">Целевой запас по плану <Money value={split.keep} />.</p>
        {split.allocations.map(a => <div key={a.debt.id}>{a.debt.short} · <Money value={a.amount} /></div>)}
        <p className="text-[13px] text-muted">Фактически выполненный платёж отмечается отдельно в карточке долга.</p>
      </div>
      <PrimaryButton onClick={receive} disabled={value <= 0 || !date || date > now}>Подтвердить зачисление</PrimaryButton>
    </div>
  );
}

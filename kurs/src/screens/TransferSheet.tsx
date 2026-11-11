// Перевод из резерва на карту под обязательные платежи. Платежи списываются с карты, поэтому накануне вечером
// приложение напоминает перевести деньги; перевод сразу уменьшает резерв — он совпадает с банком, — а деньги на карте
// числятся «под платёж», пока платёж не отмечен. Сумму можно поправить: сколько перевели на самом деле.
import { useState } from 'react';
import { Field, Money, PrimaryButton, Sheet } from '../components/ui';
import type { TransferPlan } from '../domain/ledger';
import { parseAmount, rub } from '../domain/money';
import { useStore } from '../store/store';
import { useUi, withUndo } from '../store/ui';
import { useLedger } from './Checkup';

/** Записать перевод: резерв меньше на сумму, карта больше, платежи помечены «деньги на карте». С «Отменить» */
export function recordTransfer(plan: TransferPlan, amount: number, reserveBefore: number) {
  const names = plan.events.map(e => e.title).join(', ');
  withUndo(
    amount > 0 ? `Переведено ${rub(amount)}. В резерве ${rub(reserveBefore - amount)}` : 'Записано: деньги под платёж уже на карте',
    () => useStore.getState().moveReserve(-amount, amount > 0 ? `На карту под платёж: ${names}` : `Платёж с карты без перевода: ${names}`, amount, plan.keys),
  );
}

export function TransferSheet() {
  const plan = useUi(s => s.transfer);
  const set = useUi(s => s.set);
  return (
    <Sheet open={!!plan} onClose={() => set({ transfer: null })} title="Перевод на карту" subtitle="Из резерва — под платёж">
      {plan && <Body plan={plan} onDone={() => set({ transfer: null })} />}
    </Sheet>
  );
}

function Body({ plan, onDone }: { plan: TransferPlan; onDone: () => void }) {
  const led = useLedger();
  const [amount, setAmount] = useState(String(plan.amount).replace('.', ','));
  const value = parseAmount(amount);
  const ok = value != null && value >= 0;
  return (
    <div className="space-y-4 pt-1">
      <div className="card divide-hair px-4 py-1">
        {plan.events.map(e => (
          <div key={e.key} className="flex items-center justify-between gap-3 py-2.5 text-[14.5px]">
            <span className="min-w-0 truncate font-medium">{e.title}</span>
            <Money value={e.amount} approx={e.approx} className="shrink-0" />
          </div>
        ))}
        {plan.onCard > 0 && (
          <div className="flex items-center justify-between gap-3 py-2.5 text-[13.5px] text-muted">
            <span>Поступления уже на карте</span><span className="shrink-0">−<Money value={plan.onCard} /></span>
          </div>
        )}
      </div>
      <div className="card space-y-3 p-4">
        <Field label="Перевёл из резерва на карту" hint="Сколько перевели на самом деле. Ноль — если деньги уже были на карте.">
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0" autoFocus className="field text-[20px] font-medium" />
        </Field>
        <p className="text-[13.5px] leading-snug" style={{ color: 'var(--rsv)' }} aria-live="polite">
          {ok ? <>В резерве станет <Money value={led.reserve - value} className="font-medium" /> — сверьте с банком</> : 'Введите сумму'}
        </p>
        <PrimaryButton onClick={() => { if (!ok) return; recordTransfer(plan, value, led.reserve); onDone(); }} disabled={!ok}>Записать перевод</PrimaryButton>
      </div>
    </div>
  );
}

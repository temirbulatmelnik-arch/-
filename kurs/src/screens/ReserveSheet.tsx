// Резерв: баланс, сколько он должен держать до следующей премии, история движений.
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Field, Money, PrimaryButton, SecondaryButton, Segmented, Sheet } from '../components/ui';
import { addMonths, ddmm, monthIn, monthKey, monthsBetween } from '../domain/dates';
import { parseAmount, rub } from '../domain/money';
import { nextBonusMonth, RESERVE_BUFFER, shortfallFor } from '../domain/plan';
import { useStore } from '../store/store';
import { toast, useToday, useUi } from '../store/ui';

export function ReserveSheet() {
  const open = useUi(s => s.reserve);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ reserve: false })} title="Резерв">
      {open && <Body />}
    </Sheet>
  );
}

type Mode = 'out' | 'in' | 'set';

function Body() {
  const now = useToday();
  const [reserve, log, debts, moveReserve, setReserve] = useStore(useShallow(s => [s.reserve, s.reserveLog, s.debts, s.moveReserve, s.setReserve]));
  const [mode, setMode] = useState<Mode>('out');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const value = parseAmount(amount) ?? 0;

  const month = monthKey(now);
  const next = nextBonusMonth(month);
  const months = Array.from({ length: Math.max(0, monthsBetween(month, next) - 1) }, (_, i) => addMonths(month, i + 1));
  // резерв должен держать подушку и нехватку за оставшиеся месяцы до премии (текущий месяц тоже ещё не прожит)
  const need = RESERVE_BUFFER + [month, ...months].reduce((s, m) => s + shortfallFor(m, debts), 0);

  const apply = () => {
    if (mode === 'set') setReserve(value, note.trim() || 'Сверка с банком');
    else moveReserve(mode === 'in' ? value : -value, note.trim() || (mode === 'in' ? 'Пополнение' : 'Нехватка зарплаты'));
    toast('Резерв обновлён');
    setAmount(''); setNote('');
  };

  return (
    <div className="space-y-4 pt-1">
      <div className="card p-5">
        <div className="text-[13px] font-medium text-muted">Сейчас</div>
        <Money value={reserve} className="figure mt-1 block text-[40px] leading-none" />
        <p className={`mt-2 text-[13.5px] leading-snug ${reserve < need ? 'text-warn' : 'text-muted'}`}>
          До премии {monthIn(next)} резерв должен держать ≈ {rub(need)}: {rub(RESERVE_BUFFER)} на непредвиденное и нехватку зарплаты за {[month, ...months].length} мес.
          {reserve < need ? ' Сейчас меньше — трать строго по недельному лимиту.' : ''}
        </p>
      </div>

      <div className="card space-y-3 p-4">
        <Segmented<Mode> value={mode} onChange={setMode} options={[{ id: 'out', label: 'Взял' }, { id: 'in', label: 'Положил' }, { id: 'set', label: 'Сверить' }]} />
        <Field label={mode === 'set' ? 'Баланс в приложении банка' : 'Сумма'} hint={mode === 'out' ? 'Только нехватка по плану, здоровье и срочное.' : mode === 'set' ? 'Или загрузите скриншот накопительного счёта.' : undefined}>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className="field text-[18px] font-medium" />
        </Field>
        {mode !== 'set' && <input value={note} onChange={e => setNote(e.target.value)} placeholder="На что" className="field" />}
        <PrimaryButton onClick={apply} disabled={mode === 'set' ? parseAmount(amount) == null : value <= 0}>Сохранить</PrimaryButton>
      </div>

      <div>
        <div className="mb-2 px-1 text-[13px] font-medium text-muted">История</div>
        <div className="card divide-y divide-line overflow-hidden">
          {[...log].reverse().slice(0, 30).map(m => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0"><span className="block truncate text-[14px] font-medium">{m.note}</span><span className="text-[12px] text-faint">{ddmm(m.date)}</span></span>
              <span className={`shrink-0 text-[14px] font-medium ${m.amount >= 0 ? 'text-brass' : ''}`}>{rub(m.amount, { sign: true })}</span>
            </div>
          ))}
        </div>
      </div>
      <SecondaryButton onClick={() => useUi.getState().set({ reserve: false, bonus: {} })} className="w-full">Пришла премия — распределить</SecondaryButton>
    </div>
  );
}

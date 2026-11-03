// Зарплатная карта (точка отсчёта учёта карты) и копилка недельных остатков.
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AmountInput, Field, Money, PrimaryButton, Segmented, Sheet } from '../components/ui';
import { useCoverage } from '../components/Coverage';
import { NARROW } from '../domain/coverage';
import { addDays, dayMonth, ddmm, today } from '../domain/dates';
import { parseAmount } from '../domain/money';
import { useStore } from '../store/store';
import { toast, useUi } from '../store/ui';

export function CardSheet() {
  const open = useUi(s => s.card);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ card: false })} title="Зарплатная карта" subtitle="Остаток карты жизни — точка отсчёта учёта">
      {open && <CardBody onClose={() => set({ card: false })} />}
    </Sheet>
  );
}

function CardBody({ onClose }: { onClose: () => void }) {
  const [cardBalance, setCardBalance] = useStore(useShallow(s => [s.cardBalance, s.setCardBalance] as const));
  const [amount, setAmount] = useState(cardBalance ? String(cardBalance.amount) : '');
  const [date, setDate] = useState(today());
  const value = parseAmount(amount);
  // прогноз — общий: резерв к вечеру, как в календаре, в «Хватит ли» и в status.coverage; от остатка карты он не зависит
  const { cov } = useCoverage();
  const s = cov.shortage, low = cov.min;

  return (
    <div className="space-y-4 pt-1">
      <Field label="Сколько сейчас на карте" hint="От этого остатка приложение ведёт учёт карты до следующей сверки. Выписка обновит остаток сама.">
        <AmountInput value={amount} onChange={setAmount} size="md" />
      </Field>
      <input type="date" value={date} onChange={e => setDate(e.target.value || today())} className="field" aria-label="На какую дату" />
      <PrimaryButton onClick={() => { setCardBalance({ amount: value!, date, source: 'manual' }); toast('Остаток обновлён'); onClose(); }} disabled={value == null}>Сохранить</PrimaryButton>

      {(s || low) && (
        <p className={`rounded-xl px-3 py-2.5 text-[13px] leading-snug ${s ? 'bg-neg/10 text-neg' : low && low.balance < NARROW ? 'bg-warn/10 text-warn' : 'bg-surface-2 text-muted'}`}>
          {s
            ? <>С {dayMonth(s.date)} резерва не хватает: <Money value={s.amount} /> — на «{s.title}».</>
            : <>Самая тонкая точка — {dayMonth(low!.date)}: в резерве останется <Money value={low!.balance} />.</>}
          {' '}Недельные деньги на карте к дням платежей не прибавляются: по плану они тратятся до нуля.
        </p>
      )}
    </div>
  );
}

export function SavingsSheet() {
  const open = useUi(s => s.savings);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ savings: false })} title="Остатки недель" subtitle="Отдельный счёт: сюда — то, что не потрачено за неделю">
      {open && <SavingsBody />}
    </Sheet>
  );
}

function SavingsBody() {
  const [savings, log, closures, moveSavings] = useStore(useShallow(s => [s.savings, s.savingsLog, s.closures, s.moveSavings] as const));
  const [mode, setMode] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const value = parseAmount(amount) ?? 0;
  const weeks = Object.values(closures).sort((a, b) => b.monday.localeCompare(a.monday));

  return (
    <div className="space-y-4 pt-1">
      <div className="deep-card px-6 py-5">
        <div className="text-[13px] text-card-muted">На счёте остатков</div>
        <Money value={savings} className="figure mt-1 block text-[44px] leading-none" />
        <div className="mt-3 text-[12.5px] text-card-muted">{weeks.length ? `Закрыто недель: ${weeks.length}, с остатком: ${weeks.filter(w => w.transferred > 0).length}` : 'Закройте первую неделю в воскресенье — остаток появится здесь.'}</div>
      </div>

      <div className="card space-y-3 p-4">
        <Segmented value={mode} onChange={setMode} options={[{ id: 'out', label: 'Потратил' }, { id: 'in', label: 'Положил' }]} />
        <AmountInput value={amount} onChange={setAmount} size="md" />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder={mode === 'out' ? 'На что (например, досрочно в долг)' : 'Откуда'} className="field" />
        <PrimaryButton tone="ink" disabled={value <= 0} onClick={() => { moveSavings(mode === 'in' ? value : -value, note.trim() || (mode === 'in' ? 'Пополнение' : 'Списание')); setAmount(''); setNote(''); toast('Сохранено'); }}>Сохранить</PrimaryButton>
      </div>

      {weeks.length > 0 && (
        <div>
          <div className="eyebrow mb-2 px-1 text-muted">Недели</div>
          <div className="card divide-hair overflow-hidden">
            {weeks.slice(0, 12).map(w => (
              <div key={w.monday} className="flex items-baseline justify-between gap-3 px-4 py-3 text-[13.5px]">
                <span className="text-muted">{ddmm(w.monday)}–{ddmm(addDays(w.monday, 6))}</span>
                <span className="flex gap-3">
                  <span className="text-faint">потрачено <Money value={w.spent} /></span>
                  <Money value={w.transferred} sign className={w.transferred > 0 ? 'text-pos' : 'text-faint'} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {log.length > 0 && (
        <div>
          <div className="eyebrow mb-2 px-1 text-muted">История</div>
          <div className="card divide-hair overflow-hidden">
            {[...log].reverse().slice(0, 20).map(m => (
              <div key={m.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                <span className="min-w-0 truncate">{m.note} <span className="text-faint">· {ddmm(m.date)}</span></span>
                <Money value={m.amount} sign className={m.amount > 0 ? 'text-pos' : ''} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

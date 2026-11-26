import { accountMovement, cashAccount, LIFE_ACCOUNT } from '../domain/accounts';
// Зарплатная карта (точка отсчёта учёта карты) и копилка недельных остатков.
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AmountInput, Field, Money, PrimaryButton, SecondaryButton, Segmented, Sheet } from '../components/ui';
import { useCoverage } from '../components/Coverage';
import { NARROW } from '../domain/coverage';
import { addDays, dayMonth, ddmm, today } from '../domain/dates';
import { parseAmount } from '../domain/money';
import { useLedger } from './Checkup';
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
  const led = useLedger();
  const [excluded, setExcluded] = useState<string[]>([]);
  const [pointType, setPointType] = useState<'available' | 'posted'>('available');
  const [pointReason, setPointReason] = useState('');
  const book = useStore(s => s.accountBook);
  const [selected, select] = useState<string | null>(null);
  const [budgetScope, setBudgetScope] = useState<'weekly' | 'separate' | 'unknown'>('unknown');
  const expenses = useStore(s => s.expenses);
  const reviews = led.reconciliation.filter(issue => issue.accountId === LIFE_ACCOUNT);
  const candidates = [...expenses.filter(row => row.date === date && cashAccount(row) === LIFE_ACCOUNT),
    ...book.operations.filter(row => !row.legacyExpense && row.date === date && accountMovement(row, LIFE_ACCOUNT))];

  // прогноз — общий: резерв к вечеру, как в календаре, в «Хватит ли» и в status.coverage; от остатка карты он не зависит
  const { cov } = useCoverage();
  const s = cov.shortage, low = cov.min;

  return (
    <div className="space-y-4 pt-1">
      <div className="card space-y-2 p-4 text-[14px]">
        <div className="flex justify-between gap-2"><span>На карте по учёту</span>{led.card == null ? 'Уточнить' : <Money value={led.card} kopecks />}</div>
        {cardBalance && <div className="flex justify-between gap-2"><span>Сверено в банке {ddmm(cardBalance.date)}</span><Money value={cardBalance.amount} kopecks /></div>}
        {cardBalance && led.card != null && led.card !== cardBalance.amount && <div className="flex justify-between gap-2"><span>Изменение после снимка</span><Money value={led.card - cardBalance.amount} kopecks sign /></div>}
        {led.heldOnCard > 0 && <div className="flex justify-between gap-2"><span>Под платежи</span><Money value={led.heldOnCard} kopecks /></div>}
        {led.incomeOnCard > 0 && <div className="flex justify-between gap-2"><span>Ожидает перевода в резерв</span><Money value={led.incomeOnCard} kopecks /></div>}
        {led.unassignedOnCard > 0 && <div className="flex justify-between gap-2"><span>Требует сверки назначения</span><Money value={led.unassignedOnCard} kopecks /></div>}
      </div>
      {led.cardPosted != null && led.cardPosted !== led.card && <p className="text-[13px] text-muted">Проведённый остаток <Money value={led.cardPosted} kopecks /></p>}
      {reviews.length > 0 && <section aria-label="Требуется сверка" className="card space-y-2 p-3 text-[13px]">
        <div className="font-medium">Требуется сверка</div>
        {reviews.some(issue => issue.kind === 'snapshot_order') && <p className="text-muted">У части операций время списания в день банковского снимка неизвестно. При новой сверке проверьте, какие из них вошли в остаток.</p>}
        {reviews.filter(issue => issue.kind === 'possible_duplicate').map(issue => {
          const expense = expenses.find(row => row.id === issue.relatedId);
          const confirmed = selected === issue.operationId;
          return <div key={issue.operationId + issue.relatedId} className="space-y-2 border-t border-line pt-2">
            <p>{expense?.note ?? 'Платёж'} · {ddmm(issue.date)} · <Money value={issue.amount} kopecks /> · возможно, одна операция в истории и календаре.</p>
            {confirmed ? <>
              <label className="block">Источник оплаты по банку
                <select className="field mt-1" value={budgetScope} onChange={e => setBudgetScope(e.target.value as typeof budgetScope)}>
                  <option value="unknown">Уточню позже</option><option value="weekly">Из недельных денег</option><option value="separate">Оплачено отдельно</option>
                </select>
              </label>
              <SecondaryButton onClick={() => {
                if (issue.relatedId && useStore.getState().linkPaymentExpense(issue.operationId, issue.relatedId, budgetScope)) {
                  toast('Записи связаны'); select(null);
                }
              }}>Подтверждаю одно списание с карты</SecondaryButton>
            </> : <button className="text-sea" type="button" onClick={() => { setBudgetScope('unknown'); select(issue.operationId); }}>Сверить две записи</button>}
          </div>;
        })}
        {reviews.some(issue => issue.kind === 'unknown_funding') && <p className="text-muted">У части платежей источник денег ещё требует сверки.</p>}
      </section>}
      <Field label="Сколько сейчас на карте" hint="От этого остатка приложение ведёт учёт карты до следующей сверки. Выписка обновит остаток сама.">
        <AmountInput value={amount} onChange={setAmount} size="md" />
      </Field>
      <input type="date" value={date} onChange={e => { setDate(e.target.value || today()); setExcluded([]); }} className="field" aria-label="На какую дату" />
      <details className="card space-y-2 p-3 text-[13px]">
        <summary className="font-medium">Детали банковского остатка</summary>
        <label className="block">Вид остатка
          <select className="field mt-1" value={pointType} onChange={event => setPointType(event.target.value as typeof pointType)}>
            <option value="available">Доступный</option><option value="posted">Проведённый</option>
          </select>
        </label>
        <input className="field" placeholder="Причина сверки" value={pointReason} onChange={event => setPointReason(event.target.value)} />
        {candidates.length > 0 && <div className="space-y-2">
          <p className="text-muted">Отметьте операции этой даты, которые ещё не вошли в банковский остаток.</p>
          {candidates.map(row => <label key={row.id} className="flex min-h-8 items-center gap-2">
            <input type="checkbox" checked={excluded.includes(row.id)} onChange={event => setExcluded(ids => event.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id))} />
            <span>{row.note ?? 'Операция'} · <Money value={row.amount} kopecks /></span>
          </label>)}
        </div>}
      </details>
      <PrimaryButton onClick={() => { setCardBalance({ amount: value!, date, kind: pointType, reason: pointReason.trim() || undefined,
        excludedIds: excluded, source: 'manual' }); toast('Остаток обновлён'); onClose(); }} disabled={value == null}>Сохранить</PrimaryButton>

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

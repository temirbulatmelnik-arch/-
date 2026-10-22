// Пришла премия: сколько оставить в резерве и сколько сегодня же отправить досрочно в долг.
import { Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { PrimaryButton, Sheet } from '../components/ui';
import { monthName } from '../domain/dates';
import { parseAmount, rub } from '../domain/money';
import { RESERVE_BUFFER, shortfallFor, splitBonus } from '../domain/plan';
import { useStore } from '../store/store';
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
  const [debts, reserve, applyBonus] = useStore(useShallow(s => [s.debts, s.reserve, s.applyBonus]));
  const [amount, setAmount] = useState(ev ? String(ev.amount) : '');
  const [months, setMonths] = useState<number | null>(null);
  const value = parseAmount(amount) ?? 0;
  const split = useMemo(() => splitBonus({ amount: value, reserve, date: now, debts, monthsOverride: months ?? undefined }), [value, reserve, now, debts, months]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const alloc = split.allocations.map(a => ({ ...a, amount: edits[a.debt.id] != null ? Math.min(a.debt.balance, parseAmount(edits[a.debt.id]) ?? 0) : a.amount }));
  const sent = alloc.reduce((s, a) => s + a.amount, 0);
  const reserveAfter = reserve + value - sent;
  const n = months ?? split.months.length;

  const apply = () => {
    applyBonus({ amount: value, reserveAfter, allocations: alloc.filter(a => a.amount > 0).map(a => ({ debtId: a.debt.id, amount: a.amount })), title: ev?.title ?? 'Премия', eventKey: ev?.key });
    toast(sent ? `Готово: ${rub(sent)} в долг, резерв ${rub(reserveAfter)}` : `Готово: всё в резерв, ${rub(reserveAfter)}`);
    set({ bonus: null });
  };

  return (
    <div className="space-y-4 pt-1">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-muted">{ev?.title ?? 'Сумма премии'}</span>
        <div className="flex items-baseline gap-2 rounded-2xl bg-surface-2 px-4 py-3">
          <input value={amount} onChange={x => setAmount(x.target.value)} inputMode="decimal" placeholder="0" className="w-full bg-transparent text-[30px] font-extrabold outline-none" autoFocus={!ev} />
          <span className="text-[22px] font-bold text-muted">₽</span>
        </div>
      </label>

      {split.rule?.note && <p className="rounded-2xl bg-accent/10 p-4 text-[14px] leading-snug">{split.rule.note}</p>}

      <div className="card p-4">
        <div className="text-[13px] font-semibold text-muted">Оставить в резерве</div>
        <div className="mt-1 text-[26px] font-extrabold">{rub(split.keep)}</div>
        <div className="mt-2 text-[13px] leading-snug text-muted">
          {rub(RESERVE_BUFFER)} на непредвиденное
          {split.months.map(m => <span key={m}> + {rub(shortfallFor(m, debts))} нехватки за {monthName(m).split(' ')[0]}</span>)}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
          <span className="text-[13.5px] font-semibold">Месяцев до следующей премии</span>
          <span className="flex items-center gap-2">
            <button type="button" aria-label="Меньше" onClick={() => setMonths(Math.max(0, n - 1))} className="grid size-8 place-items-center rounded-full bg-surface"><Minus size={15} /></button>
            <span className="w-5 text-center text-[16px] font-extrabold">{n}</span>
            <button type="button" aria-label="Больше" onClick={() => setMonths(Math.min(6, n + 1))} className="grid size-8 place-items-center rounded-full bg-surface"><Plus size={15} /></button>
          </span>
        </div>
        <div className="mt-2 text-[12.5px] text-faint">Сейчас в резерве {rub(reserve)} — учитывается.</div>
      </div>

      <div className="card p-4">
        <div className="text-[13px] font-semibold text-muted">Сегодня же — досрочно в долг</div>
        {alloc.length === 0 && <p className="mt-2 text-[14px] text-muted">{split.rule?.targets?.length === 0 ? 'По плану эти деньги целиком идут в резерв.' : 'Премии не хватает сверх резерва — всё остаётся в резерве.'}</p>}
        <div className="mt-2 space-y-2">
          {alloc.map(a => (
            <div key={a.debt.id} className="rounded-xl bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold">{a.debt.short}{a.amount >= a.debt.balance - 0.5 ? ' — закрыть' : ''}</span>
                <input value={edits[a.debt.id] ?? String(Math.round(a.amount))} onChange={x => setEdits({ ...edits, [a.debt.id]: x.target.value })} inputMode="decimal"
                  className="w-32 rounded-lg bg-surface px-2 py-1 text-right text-[16px] font-extrabold outline-none" />
              </div>
              <div className="mt-1 text-[12.5px] leading-snug text-muted">
                остаток {rub(a.debt.balance)}
                {a.debt.kind === 'split' && ' · при досрочном погашении выбрать «уменьшить платёж»'}
                {a.debt.kind === 'loan' && ' · в банке выбрать «сократить срок»'}
                {a.debt.kind === 'card' && a.amount >= a.debt.balance - 0.5 && ' · после погашения закрыть карту вместе со счётом'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-accent/10 p-4 text-[14px] leading-relaxed">
        <b>Резерв после распределения: {rub(reserveAfter)}</b>
        {sent > 0 && <><br />В долг уходит {rub(sent)} — это примерно {rub(alloc.reduce((s, a) => s + (a.amount * a.debt.rate) / 12, 0))} процентов, которые не придётся платить в следующем месяце.</>}
      </div>

      <PrimaryButton onClick={apply} disabled={value <= 0}>Распределить и отметить</PrimaryButton>
      <p className="text-center text-[12px] text-faint">Сами переводы делаются в приложениях банков — «Курс» только запоминает и пересчитывает.</p>
    </div>
  );
}

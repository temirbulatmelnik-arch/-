// Итог недели: траты по категориям против лимита и воскресное пополнение карты жизни из резерва до лимита.
import { FileUp, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AmountInput, Bar, CatIcon, Money, PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { addDays, ddmm } from '../domain/dates';
import { parseAmount } from '../domain/money';
import { CATEGORY } from '../domain/plan';
import { weekReport } from '../domain/weekly';
import { useStore } from '../store/store';
import { toast, useUi } from '../store/ui';

export function WeekSheet() {
  const monday = useUi(s => s.week);
  const set = useUi(s => s.set);
  return (
    <Sheet open={!!monday} onClose={() => set({ week: null })} title="Итог недели" subtitle={monday ? `${ddmm(monday)}–${ddmm(addDays(monday, 6))}` : undefined}>
      {monday && <Body key={monday} monday={monday} />}
    </Sheet>
  );
}

function Body({ monday }: { monday: string }) {
  const [expenses, debts, overrides, closure, closeWeek, reopenWeek] = useStore(useShallow(s => [s.expenses, s.debts, s.weeklyOverrides, s.closures[monday], s.closeWeek, s.reopenWeek] as const));
  const set = useUi(s => s.set);
  const r = useMemo(() => weekReport(expenses, debts, overrides, monday), [expenses, debts, overrides, monday]);
  const [amount, setAmount] = useState(String(Math.round(r.topUp)));
  const value = parseAmount(amount) ?? 0;
  const max = Math.max(...r.byCategory.map(c => c.spent), 1);

  const close = (topUp: number) => {
    closeWeek({ monday, limit: r.limit, spent: r.spent, left: r.left, transferred: 0, topUp });
    toast(topUp > 0 ? 'Неделя закрыта, карта жизни долита' : 'Неделя закрыта');
    set({ week: null });
  };

  return (
    <div className="space-y-4 pt-1">
      <section className="deep-card px-6 py-5">
        <div className="text-[13px] text-card-muted">{r.left >= 0 ? 'Осталось на карте жизни' : 'Перерасход'}</div>
        <Money value={Math.abs(r.left)} className={`figure mt-1 block text-[48px] leading-none ${r.left < 0 ? 'text-[#f2a596]' : ''}`} />
        <Bar value={r.limit ? r.spent / r.limit : 0} tone={r.left < 0 ? 'neg' : 'card'} onCard className="mt-5" />
        <div className="mt-3 flex justify-between text-[12.5px] text-card-muted">
          <span>потрачено <Money value={r.spent} className="text-card" /></span>
          <span>лимит <Money value={r.limit} className="text-card" /></span>
        </div>
      </section>

      {r.count === 0 && (
        <button type="button" onClick={() => set({ week: null, scan: true })} className="card flex w-full items-center gap-3 p-4 text-left">
          <span className="grid size-10 place-items-center rounded-full bg-surface-2"><FileUp size={18} strokeWidth={1.5} /></span>
          <span className="flex-1"><span className="block text-[14.5px] font-medium">Трат за неделю нет</span><span className="block text-[12.5px] text-muted">Загрузите выписку — без неё остаток посчитается неверно.</span></span>
        </button>
      )}

      {r.byCategory.length > 0 && (
        <div className="card divide-hair overflow-hidden">
          {r.byCategory.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <CatIcon id={c.id} className="size-9" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{CATEGORY[c.id].short}</span><Money value={c.spent} className="text-[14px]" /></div>
                <Bar value={c.spent / max} className="mt-2" />
              </div>
            </div>
          ))}
        </div>
      )}
      {r.credit > 0 && <p className="rounded-2xl bg-neg/10 px-4 py-3 text-[13px] text-neg">С кредиток за неделю: <Money value={r.credit} />. Кредитки только гасим.</p>}

      {closure ? (
        <>
          <p className="rounded-2xl bg-pos/10 px-4 py-3 text-[14px] text-pos">
            Неделя закрыта{closure.topUp ? <>, из резерва долито <Money value={closure.topUp} /></> : closure.transferred > 0 ? <>, в копилку <Money value={closure.transferred} /></> : ''}.
          </p>
          <SecondaryButton onClick={() => reopenWeek(monday)} className="w-full"><Undo2 size={16} strokeWidth={1.5} /> Открыть заново</SecondaryButton>
        </>
      ) : (
        <div className="card space-y-3 p-4">
          <div className="text-[14px] leading-snug">
            В воскресенье вечером долейте карту жизни <b className="font-medium">из резерва</b> до лимита следующей недели — <Money value={r.nextLimit} />.{' '}
            {r.leftover > 0
              ? <>На карте осталось <Money value={r.leftover} />, они остаются там, поэтому долить нужно меньше.</>
              : r.left < 0 ? <>Остатка нет: перерасход <Money value={-r.left} /> не переносится, долить нужно весь лимит.</>
                : <>Остатка нет — долить весь лимит.</>}
          </div>
          <AmountInput value={amount} onChange={setAmount} size="md" />
          <p className="text-[12px] leading-snug text-muted">Перевели другую сумму — поправьте. Резерв уменьшится на неё, а в календаре пополнение отметится сделанным.</p>
          <PrimaryButton onClick={() => close(value)} disabled={value <= 0}>Долил из резерва</PrimaryButton>
          <button type="button" onClick={() => close(0)} className="w-full py-1 text-[13px] text-muted">Закрыть без пополнения</button>
        </div>
      )}
    </div>
  );
}

import { useLedger } from './Checkup';
// Итог недели: траты по категориям против лимита, воскресное пополнение карты жизни из резерва до лимита и все траты недели.
import { FileUp, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Bar, CatIcon, Money, PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { useCoverage } from '../components/Coverage';
import { DEFAULT_PREPARATION_TIME, weeklyTopUp } from '../domain/funds';
import { addDays, ddmm } from '../domain/dates';
import { CATEGORY } from '../domain/plan';
import { bridgeWeek } from '../domain/bridge';
import { weekReport } from '../domain/weekly';
import { useStore } from '../store/store';
import { toast, useBudgetExpenses, useMoscowClock, useUi } from '../store/ui';

export function WeekSheet() {
  const monday = useUi(s => s.week);
  const set = useUi(s => s.set);
  const now = useMoscowClock().date;
  const finished = !!monday && now > addDays(monday, 6);
  return (
    <Sheet open={!!monday} onClose={() => set({ week: null })} title={finished ? "Итог недели" : "Бюджет недели"} subtitle={monday ? `${ddmm(monday)}–${ddmm(addDays(monday, 6))}` : undefined}>
      {monday && <Body key={monday} monday={monday} />}
    </Sheet>
  );
}

function Body({ monday }: { monday: string }) {
  const expenses = useBudgetExpenses();
  const [debts, overrides, closure, closeWeek, reopenWeek, bridge] = useStore(useShallow(s => [s.debts, s.weeklyOverrides, s.closures[monday], s.closeWeek, s.reopenWeek, s.bridge] as const));
  const set = useUi(s => s.set);
  const r = useMemo(() => weekReport(expenses, debts, overrides, monday, bridge), [expenses, debts, overrides, monday, bridge]);
  const led = useLedger();
  const [inspect, setInspect] = useState(false);
  const clock = useMoscowClock();
  const { cov } = useCoverage('cautious');
  const canClose = clock.date > r.sunday || clock.date === r.sunday && clock.time >= DEFAULT_PREPARATION_TIME;
  const horizon = addDays(r.sunday, 7);
  const tight = !!(cov.shortage && cov.shortage.date <= horizon || cov.accountRisk && cov.accountRisk.date <= horizon);
  const available = led.card == null ? null : led.lifeAvailable;
  const topUp = available == null ? 0 : weeklyTopUp(r.nextLimit, available);
  const budget = Math.max(1, r.limit);
  const list = useMemo(() => expenses.filter(e => e.date >= monday && e.date <= r.sunday).sort((a, b) => b.date.localeCompare(a.date)), [expenses, monday, r.sunday]);

  const close = (topUp: number) => {
    if (!canClose) return;
    if (topUp > 0 && !useStore.getState().confirmWeeklyTransfer(`wk:${addDays(monday, 7)}`, topUp)) {
      toast('Пополнение уже отмечено или остатки требуют сверки');
      return;
    }
    closeWeek({ monday, limit: r.limit, spent: r.spent, left: r.left, transferred: 0 });
    toast(topUp > 0 ? 'Неделя закрыта, карта жизни долита' : 'Неделя закрыта');
    set({ week: null });
  };

  return (
    <div className="space-y-4 pt-1">
      <section className="deep-card px-6 py-5">
        <div className="text-[13px] text-card-muted">{r.left >= 0 ? 'Осталось в недельном бюджете' : 'Перерасход'}</div>
        <Money value={Math.abs(r.left)} className={`figure mt-1 block text-[48px] leading-none ${r.left < 0 ? 'text-[#f2a596]' : ''}`} />
        <Bar value={r.limit ? r.spent / r.limit : 0} tone={r.left < 0 ? 'neg' : 'card'} onCard className="mt-5" />
        <p className="mt-2 text-[12px] text-card-muted">{clock.date > r.sunday ? 'Неделя завершена' : 'До ' + ddmm(r.sunday) + ' включительно'}</p>
        <div className="mt-3 flex justify-between text-[12.5px] text-card-muted">
          <span>потрачено <Money value={r.spent} kopecks className="text-card" /></span>
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
                <Bar value={c.spent / budget} className="mt-2" />
              </div>
            </div>
          ))}
        </div>
      )}
      {r.credit > 0 && (bridgeWeek(bridge, monday)
        ? <p className="rounded-2xl bg-warn/12 px-4 py-3 text-[13px] text-warn">С кредитки по мосту за неделю: <Money value={r.credit} />. Только покупки, погасить до {bridge?.repayBy ? ddmm(bridge.repayBy) : 'срока моста'}.</p>
        : <p className="rounded-2xl bg-neg/10 px-4 py-3 text-[13px] text-neg">С кредиток за неделю: <Money value={r.credit} />. Кредитки только гасим.</p>)}

      {closure ? (
        <>
          <p className="rounded-2xl bg-pos/10 px-4 py-3 text-[14px] text-pos">
            Неделя закрыта{closure.topUp ? <>, из резерва долито <Money value={closure.topUp} /></> : closure.transferred > 0 ? <>, в копилку <Money value={closure.transferred} /></> : ''}.
          </p>
          <SecondaryButton onClick={() => reopenWeek(monday)} className="w-full"><Undo2 size={16} strokeWidth={1.5} /> Открыть заново</SecondaryButton>
        </>
      ) : (canClose || inspect) ? (
        <div className="card space-y-2 p-4">
          <h3 className="font-medium">{canClose ? 'Проверить и закрыть неделю' : 'План следующей недели'}</h3>
          <p className="text-sm">Лимит <Money value={r.nextLimit} kopecks />. {available == null ? 'Нужна сверка карты.' :
            <>Свободно на карте <Money value={available} kopecks /> · до лимита <Money value={topUp} kopecks />.</>}</p>
          {(tight || topUp > led.reserve || !led.reserveVerified) && <p className="text-[13px] text-warn">
            {!led.reserveVerified ? 'Сверьте резерв перед переводом.' : topUp > led.reserve ? <>В резерве не хватает <Money value={topUp - led.reserve} kopecks />.</>
              : 'Проверьте покрытие ближайших обязательств перед переводом.'}
          </p>}
          {canClose ? <>
            <PrimaryButton onClick={() => set({ week: null, checkup: monday })}>Сверить с банком</PrimaryButton>
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-[13px] text-sea">Закрыть без новой сверки</summary>
              <div className="space-y-1">
                {topUp > 0 && <SecondaryButton onClick={() => close(topUp)} disabled={topUp > led.reserve || available == null || !led.reserveVerified} className="w-full">Подтвердить сделанный перевод</SecondaryButton>}
                <button type="button" className="min-h-11 w-full text-[13px] text-muted" onClick={() => close(0)}>Закрыть неделю без перевода</button>
              </div>
            </details>
          </> : <p className="text-[13px] text-muted">Подготовка к закрытию откроется в воскресенье в 20:00 МСК.</p>}
        </div>
      ) : <SecondaryButton className="w-full" onClick={() => setInspect(true)}>Следующая неделя</SecondaryButton>}

      {list.length > 0 && (
        <SecondaryButton className="w-full" onClick={() => {
          set({ week: null, historyRange: { from: monday, to: r.sunday } }); useUi.getState().setTab('budget');
        }}>Траты этой недели · {list.length}</SecondaryButton>
      )}
    </div>
  );
}

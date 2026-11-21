import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, TrendingDown } from 'lucide-react';
import { Field, Money, PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { coverageInput, COVERAGE_SCENARIOS, type Scenario } from '../domain/coverage';
import { ddmmyyyy } from '../domain/dates';
import { parseAmount } from '../domain/money';
import { validDate, type PayoffTerms } from '../domain/accounts';
import type { RepaymentResult } from '../domain/prepayment';
import { bestPartial } from '../domain/prepayment';
import type { RepaymentRequest } from '../domain/prepayment.worker';
import { useCal, useMoscowClock, toast } from '../store/ui';
import { useStore } from '../store/store';
import { useLedger } from './Checkup';

const states = { baseline: 'По графику', available: 'Доступно сейчас', afterIncome: 'После получения денег', conditional: 'При выполнении условий', unsafe: 'Риск нехватки денег' };
const scenarios: Record<Scenario, string> = { base: 'Базовый', cautious: 'Осторожный', stress: 'Стрессовый' };

function useAnalysis(date: string, suggest: boolean, active: boolean, withoutVacation?: boolean) {
  const { date: today } = useMoscowClock();
  const cal = useCal();
  const expenses = useStore(s => s.expenses);
  const plan = useStore(s => s.plan);
  const ledger = useLedger();
  const [result, setResult] = useState<{ next?: { date: string; result: RepaymentResult } | null; rows?: RepaymentResult[]; failed?: boolean }>();
  const input = useMemo(() => {
    const quoted = cal.debts.map(d => ({ ...d, balance: ledger.debtBalances[d.id]?.estimated ?? d.balance }));
    return coverageInput({ ...cal, debts: quoted, marks: cal.marks ?? {}, expenses }, ledger);
  }, [cal, expenses, ledger]);
  useEffect(() => {
    if (!active || !validDate(date)) return;
    setResult(undefined);
    const worker = new Worker(new URL('../domain/prepayment.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = e => setResult(e.data);
    worker.onerror = () => setResult({ failed: true });
    worker.postMessage({ input, plan, today, date, suggest, withoutVacation } satisfies RepaymentRequest);
    return () => worker.terminate();
  }, [active, date, input, plan, suggest, today, withoutVacation]);
  return result;
}

export function PrepaymentCard() {
  const { date: today } = useMoscowClock();
  const [open, setOpen] = useState(false);
  const march = '2027-03-31';
  const defaultDate = today < march ? march : today;
  const preview = useAnalysis(defaultDate, true, true);
  const next = preview?.next;
  return <section className="mx-4 mt-3">
    <button type="button" className="card flex w-full items-start gap-3 p-4 text-left" onClick={() => setOpen(true)}>
      <TrendingDown size={21} className="mt-1 shrink-0 text-sea" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-medium">Выгодная досрочка</span>
        {next ? <>
          <span className="block text-[13px]">{ddmmyyyy(next.date)} · {states[next.result.status]} · {next.result.title}</span>
          <span className="block text-[13px] text-muted">Внести <Money value={next.result.amount} approx /> · в резерве {next.result.reserveAfter.cautious == null ? 'требует сверки' : <Money value={next.result.reserveAfter.cautious} approx />}</span>
          <span className="block text-[13px] text-muted">Экономия расходов <Savings row={next.result} /></span>
        </> : <span className="block text-[13px] text-muted">{!preview ? 'Считаю варианты…' :
          preview.failed ? 'Откройте сравнение, чтобы повторить расчёт.' : 'Безопасный вариант пока не найден. Откройте сравнение.'}</span>}
      </span>
      <ChevronRight size={18} className="mt-1 shrink-0 text-muted" />
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title="Выгодная досрочка">
      {open && <Analysis today={today} initial={next?.date ?? defaultDate} />}
    </Sheet>
  </section>;
}

function Savings({ row }: { row: RepaymentResult }) {
  if (!row.savings) return <>—</>;
  const [low, high] = row.savings;
  return Math.round(low) === Math.round(high) ? <Money value={high} approx /> :
    <><Money value={low} approx /> … <Money value={high} /></>;
}

function Analysis({ today, initial }: { today: string; initial: string }) {
  const [date, setDate] = useState(initial);
  const [selected, select] = useState('');
  const [edit, setEdit] = useState(false);
  const [withoutVacation, setWithoutVacation] = useState(false);
  const result = useAnalysis(date, false, validDate(date) && date >= today, withoutVacation);
  const rows = result?.rows ?? [];
  const baseline = rows[0];
  const row = rows.find(r => r.id === selected) ?? rows.find(r => r.status === 'available' || r.status === 'afterIncome') ?? rows[0];
  const shortRows = rows.filter(r => r.actions.length === 0 || r.actions.length === 1 && r.actions[0].mode === 'close' ||
    r.actions.length > 1 && r.actions.every(d => d.mode === 'close') && r.actions.some(d => d.debtId === 'alfa-card') && r.actions.some(d => d.debtId === 'yandex-split'));
  const partial = bestPartial(rows);
  if (partial) shortRows.push(partial);
  return <div className="space-y-4">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <Field label="Дата досрочки"><input className="field" type="date" min={today} max={`${Number(today.slice(0, 4)) + 1}-12-31`} value={date} onChange={e => { setDate(e.target.value); select(''); }} /></Field>
      <button type="button" className="min-h-11 px-2 text-sea" onClick={() => { setDate(today); select(''); }}>Сегодня</button>
    </div>
    {today <= '2027-03-31' && <button type="button" className="min-h-11 text-sea" onClick={() => { setDate('2027-03-31'); select(''); }}>Сравнить на 31 марта 2027</button>}
    <label className="flex min-h-11 items-center gap-2 text-[13px]"><input type="checkbox" checked={withoutVacation} onChange={e => {
      setWithoutVacation(e.target.checked); select('');
    }} /> Сравнить без отпускных поступлений</label>
    <SecondaryButton className="w-full" onClick={() => setEdit(!edit)}>Указать сумму полного закрытия из банка</SecondaryButton>
    {edit && <Terms date={date} onSaved={() => setEdit(false)} />}
    <p className="text-[13px] text-muted">Суммы и сроки рассчитаны по календарю и условиям, указанным в приложении. Для фактической досрочки сверяйте сумму в банке. Оплату вы выполняете в банке и подтверждаете в карточке долга.</p>
    {!rows.length && <p role="status" className="p-2 text-[13px] text-muted">{result?.failed ? 'Расчёт прервался. Выберите дату ещё раз.' :
      result?.rows ? 'Дата за пределами прогноза.' : date < today ? 'Выберите сегодняшнюю или будущую дату.' : 'Сравниваю календарь и остатки…'}</p>}
    {!!shortRows.length && <div className="card overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <thead className="text-muted"><tr><th className="p-2">Вариант</th><th className="p-2">Внести</th><th className="p-2">Резерв после</th><th className="p-2">Экономия</th></tr></thead>
        <tbody>{shortRows.map(r => <tr key={r.id} className="border-t border-line align-top">
          <td className="p-2"><button className="min-h-9 text-left font-medium text-sea" type="button" onClick={() => select(r.id)}>{r.title}</button><span className="block text-muted">{states[r.status]}</span></td>
          <td className="p-2"><Money value={r.amount} /></td>
          <td className="p-2">{r.reserveAfter.base == null ? '—' : <Money value={r.reserveAfter.base} />}</td>
          <td className="p-2"><Savings row={r} /></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {row && baseline && <>
      <Field label="Подробный вариант"><select className="field" value={row.id} onChange={e => select(e.target.value)}>
        {rows.map(r => <option key={r.id} value={r.id}>{r.title} · {r.amount.toLocaleString('ru-RU')} ₽</option>)}
      </select></Field>
      <div className="card space-y-2 p-4 text-[13px]">
        <p className="font-medium">{states[row.status]} · {row.title}</p>
        {row.reasons.map(reason => <p key={reason}>{reason}</p>)}
        {COVERAGE_SCENARIOS.map(s => <div key={s} className="border-t border-line pt-2">
          <strong>{scenarios[s]}</strong> · резерв {row.reserveAfter[s] == null ? 'требует сверки' : <Money value={row.reserveAfter[s]!} kopecks />}
          {row.scenarios[s].shortage && <p className="text-neg">Разрыв с {ddmmyyyy(row.scenarios[s].shortage!.date)} · <Money value={row.scenarios[s].shortage!.amount} kopecks /></p>}
          {row.scenarios[s].accountRisk && <p className="text-warn">Платёж требует проверки · {row.scenarios[s].accountRisk!.title}</p>}
        </div>)}
        <p className="text-muted">Стресс включает задержку регулярных выплат на неделю, задержку отпускных и внеплановый расход. Если сумма расхода не настроена, используется 10 000 ₽.</p>
        <details>
          <summary className="min-h-10 text-sea">Минимум резерва по горизонтам</summary>
          {row.horizons.map(h => <div className="py-1" key={h.date}>
            До {ddmmyyyy(h.date)} · {COVERAGE_SCENARIOS.map(s => <span key={s} className="mr-2 whitespace-nowrap">{scenarios[s]} {h.minimum[s] == null ? '—' : <Money value={h.minimum[s]!} />}</span>)}
          </div>)}
        </details>
        {!!row.removed.length && <details>
          <summary className="min-h-10 text-sea">Какие платежи исчезнут ({row.removed.length})</summary>
          {row.removed.map(payment => <div key={payment.key} className="py-1">{ddmmyyyy(payment.date)} · {payment.title} · <Money value={payment.amount} kopecks /></div>)}
        </details>}
        <p>Экономия процентов и комиссий рассчитана до {ddmmyyyy(row.savingsUntil)}.</p>
        <p>Все долги по модели {row.debtFree ? `до ${ddmmyyyy(row.debtFree)}` : 'не закрываются в расчётном периоде'}.</p>
        {row.debtDates.filter(r => r.date !== baseline.debtDates.find(b => b.id === r.id)?.date).map(r => <DebtDate key={r.id} value={r} />)}
      </div>
      <Chart title="Общий долг" values={row.charts.debt} comparison={baseline.charts.debt} />
      <Chart title="Накопленная переплата" values={row.charts.cost} comparison={baseline.charts.cost} />
      <Chart title="Прогноз резерва" values={row.charts.reserve} comparison={baseline.charts.reserve} />
    </>}
  </div>;
}

function DebtDate({ value }: { value: { id: string; date: string | null } }) {
  const title = useStore(s => s.debts.find(d => d.id === value.id)?.short);
  return <p>{title} · {value.date ? ddmmyyyy(value.date) : 'дата за горизонтом расчёта'}</p>;
}

function Chart({ title, values, comparison }: { title: string; values: number[]; comparison: number[] }) {
  if (!values.length) return null;
  const all = [...values, ...comparison];
  const low = Math.min(...all), high = Math.max(...all);
  const line = (arr: number[]) => arr.map((v, i) => `${8 + 324 * i / Math.max(1, arr.length - 1)},${78 - 67 * (v - low) / Math.max(1, high - low)}`).join(' ');
  return <div className="card space-y-1 p-3 text-[13px]">
    <h3 className="font-medium">{title}</h3>
    <svg className="block w-full" viewBox="0 0 340 85" role="img" aria-label={title}>
      <polyline points={line(comparison)} fill="none" stroke="var(--muted)" strokeDasharray="4 4" />
      <polyline points={line(values)} fill="none" stroke="var(--sea)" strokeWidth="2" />
    </svg>
    <p className="flex justify-between gap-2 text-muted"><Money value={values[0]} approx /><span>пунктир · по графику</span><Money value={values.at(-1)!} approx /></p>
  </div>;
}

function Terms({ date, onSaved }: { date: string; onSaved: () => void }) {
  const debts = useStore(s => s.debts).filter(d => !d.closed && !d.noPrepay);
  const [id, setId] = useState(debts[0]?.id ?? '');
  return <Field label="Обязательство"><select className="field" value={id} onChange={e => setId(e.target.value)}>
    {debts.map(d => <option key={d.id} value={d.id}>{d.short}</option>)}
  </select>{id && <TermsFields key={id} id={id} date={date} onSaved={onSaved} />}</Field>;
}

function TermsFields({ id, date, onSaved }: { id: string; date: string; onSaved: () => void }) {
  const terms = useStore(s => s.accountBook.payoffTerms?.[id]);
  const loan = useStore(s => s.debts.find(d => d.id === id)?.kind === 'loan');
  const [on, setOn] = useState(terms?.closeDate ?? date);
  const [amount, setAmount] = useState(String(terms?.closeAmount ?? ''));
  const [fee, setFee] = useState(String(terms?.partialFee ?? ''));
  const [rateLow, setLow] = useState(terms?.rateLow == null ? '' : String(terms.rateLow * 100));
  const [rateHigh, setHigh] = useState(terms?.rateHigh == null ? '' : String(terms.rateHigh * 100));
  const [confirmed, setConfirmed] = useState(!!terms?.partialConfirmed);
  const [modes, setModes] = useState(terms?.loanModes ?? []);
  const save = () => {
    const value = parseAmount(amount);
    const percent = (text: string) => text.trim() ? Number(text.replace(',', '.')) / 100 : undefined;
    const data: PayoffTerms = { ...(value == null ? {} : { closeDate: on, closeAmount: value }), partialConfirmed: confirmed,
      partialFee: parseAmount(fee) ?? undefined, rateLow: percent(rateLow), rateHigh: percent(rateHigh), ...(loan ? { loanModes: modes } : {}) };
    if ((amount.trim() && value == null) || !useStore.getState().savePayoffTerms(id, data)) { toast('Проверьте сумму, дату и ставки'); return; }
    toast('Условия сохранены для прогноза');
    onSaved();
  };
  return <div className="card space-y-3 p-3">
    <Field label="Сумма закрытия из банка"><input className="field" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
    <Field label="На какую дату действует сумма"><input className="field" type="date" value={on} onChange={e => setOn(e.target.value)} /></Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Нижняя ставка, %"><input className="field" inputMode="decimal" value={rateLow} onChange={e => setLow(e.target.value)} /></Field>
      <Field label="Верхняя ставка, %"><input className="field" inputMode="decimal" value={rateHigh} onChange={e => setHigh(e.target.value)} /></Field>
    </div>
    <Field label="Комиссия за частичную досрочку, ₽"><input className="field" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} /></Field>
    <label className="flex gap-2 text-[13px]"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Банк подтвердил условия частичной досрочки</label>
    {loan && (['term', 'payment'] as const).map(mode => <label key={mode} className="flex gap-2 text-[13px]">
      <input type="checkbox" checked={modes.includes(mode)} onChange={e => setModes(e.target.checked ? [...modes, mode] : modes.filter(m => m !== mode))} />
      Доступно {mode === 'term' ? 'сокращение срока' : 'уменьшение платежа'}
    </label>)}
    <PrimaryButton onClick={save}>Сохранить условия</PrimaryButton>
  </div>;
}

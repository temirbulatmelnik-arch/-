import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, ShieldAlert, TrendingDown } from 'lucide-react';
import { Field, Money, PrimaryButton, SecondaryButton, Segmented, Sheet } from '../components/ui';
import { coverageInput, type CoverageStep, type Scenario } from '../domain/coverage';
import { ddmm, ddmmyyyy } from '../domain/dates';
import { parseAmount } from '../domain/money';
import { accountOptions, validDate, type PayoffTerms } from '../domain/accounts';
import { RESERVE_BUFFER } from '../domain/plan';
import type { CashIssue, Mode, RepaymentCashflow, RepaymentChoice, RepaymentProduct, RepaymentResult } from '../domain/prepayment';
import type { RepaymentRequest } from '../domain/prepayment.worker';
import { useCal, useMoscowClock, toast } from '../store/ui';
import { useStore } from '../store/store';
import { useLedger } from './Checkup';

const march = '2027-03-31';
const statuses = { baseline: 'По графику', available: 'Безопасно', afterIncome: 'Зависит от поступления', conditional: 'Зависит от поступления', unsafe: 'Пока небезопасно' };
interface Offer { date: string; result: RepaymentResult }
interface Reply { next?: Offer | null; baselineIssue?: CashIssue | null; nextIncome?: CoverageStep; nextSalary?: CoverageStep;
  until?: string; products?: RepaymentProduct[]; baseline?: RepaymentResult; result?: RepaymentResult; alternative?: RepaymentResult; failed?: boolean }

function useAnalysis(mode: RepaymentRequest['mode'], date: string, active: boolean, choices?: RepaymentChoice[], withoutVacation?: boolean) {
  const { date: today } = useMoscowClock();
  const cal = useCal();
  const expenses = useStore(s => s.expenses);
  const plan = useStore(s => s.plan);
  const ledger = useLedger();
  const [result, setResult] = useState<Reply>();
  const input = useMemo(() => {
    // Keep the same calendar amounts as «Хватит ли». The current estimated debt
    // seeds only principal, so adding accrued interest cannot change past minima.
    const debts = cal.debts.map(d => ({ ...d, balance: ledger.debtBalances[d.id]?.estimated ?? d.balance }));
    return { ...coverageInput({ ...cal, marks: cal.marks ?? {}, expenses }, ledger), debts };
  }, [cal, expenses, ledger]);
  useEffect(() => {
    if (!active || !validDate(date)) return;
    setResult(undefined);
    const worker = new Worker(new URL('../domain/prepayment.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = e => setResult(e.data);
    worker.onerror = () => setResult({ failed: true });
    worker.postMessage({ input, plan, today, date, mode, choices, withoutVacation } satisfies RepaymentRequest);
    return () => worker.terminate();
  }, [active, date, input, plan, mode, today, choices, withoutVacation]);
  return result;
}

const scenarioOptions: { id: Scenario; label: string }[] = [
  { id: 'cautious', label: 'Осторожный' }, { id: 'base', label: 'Базовый' }, { id: 'stress', label: 'Стрессовый' },
];

const brands: Record<string, [string, string]> = {
  'alfa-card': ['А', '#fc746d'], 'yandex-split': ['Я', '#ba91fb'], 'tbank-card': ['Т', '#f0cd66'],
  'sber-card': ['С', '#76d9a7'], 'vtb-loan': ['В', '#77acee'], 'vtb-installment': ['В', '#77acee'],
};

function Bank({ id, name }: { id: string; name?: string }) {
  const [letter, color] = brands[id] ?? [name?.slice(0, 1) ?? '₽', 'var(--sea)'];
  return <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-2xl border border-current/20 bg-surface font-display text-lg"
    style={{ color }}>{letter}</span>;
}

export function PrepaymentCard() {
  const { date: today } = useMoscowClock();
  const [open, setOpen] = useState(false);
  const preview = useAnalysis('suggest', today < march ? march : today, true);
  return <section className="mx-4 mt-3">
    <button type="button" className="card flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(true)}>
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sea/12 text-sea"><TrendingDown size={22} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Выгодная досрочка</span>
        <span className="block text-[13px] text-muted">{preview?.next ? `${ddmm(preview.next.date)} · ${preview.next.result.title}` :
          preview && !preview.failed ? 'Проверить, когда выгодно погасить долг' : 'Расчёт экономии и проверка платежей'}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title="Выгодная досрочка">
      {open && <Planner today={today} preview={preview} />}
    </Sheet>
  </section>;
}

function Amount({ value, approximate, kopecks }: { value: number | null; approximate?: boolean; kopecks?: boolean }) {
  return value == null ? <span>Требует сверки</span> : <Money value={value} approx={approximate} kopecks={kopecks} />;
}

function Savings({ value }: { value: [number, number] | null }) {
  if (!value) return <>—</>;
  const [low, high] = value;
  return Math.round(low) === Math.round(high) ? <Money value={high} approx /> :
    <><Money value={low} /> … <Money value={high} /></>;
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 rounded-2xl bg-surface-2/70 p-3">
    <span className="block text-[12px] leading-snug text-muted">{label}</span>
    <span className="mt-1 block break-words text-[19px] font-semibold leading-tight [overflow-wrap:anywhere]">{children}</span>
  </div>;
}

type Page = 'offer' | 'date' | 'products' | 'result';
type Picked = Record<string, { mode: Mode; amount: string }>;

function Planner({ today, preview }: { today: string; preview?: Reply }) {
  const [page, show] = useState<Page>('offer');
  const top = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { top.current?.parentElement?.scrollTo(0, 0); }, [page]);
  const [date, setDate] = useState(today);
  const [picked, pick] = useState<Picked>({});
  const [choices, setChoices] = useState<RepaymentChoice[]>([]);
  const [withoutVacation, setWithoutVacation] = useState(false);
  const [error, setError] = useState('');
  const next = preview?.next;
  const inventory = useAnalysis('products', date, page === 'date' || page === 'products');
  const analysis = useAnalysis('calculate', date, page === 'result', choices, withoutVacation);
  const max = `${Number(today.slice(0, 4)) + 1}-12-31`;

  const chooseDate = (value: string) => {
    if (!validDate(value) || value < today || value > max) { setError('Выберите дату в пределах прогноза.'); return; }
    setError('');
    setDate(value);
    show('products');
  };
  const openOffer = (offer: Offer) => {
    setDate(offer.date);
    const chosen = offer.result.actions.map(a => ({ debtId: a.debtId, mode: a.mode, ...(a.mode !== 'close' ? { amount: a.principal } : {}) }));
    setChoices(chosen);
    pick(Object.fromEntries(chosen.map(a => [a.debtId, { mode: a.mode, amount: String(a.amount ?? '') }])));
    show('result');
  };
  const calculate = () => {
    const chosen = Object.entries(picked).filter(([id]) => inventory?.products?.some(product => product.id === id));
    const draft = chosen.map(([id, option]) => ({ debtId: id, mode: option.mode, amount: parseAmount(option.amount) ?? undefined }));
    const invalid = draft.some(a => a.mode !== 'close' && (!a.amount || a.amount >= (inventory?.products?.find(p => p.id === a.debtId)?.balance ?? 0)));
    if (!draft.length || invalid) { setError('Отметьте обязательство. Частичная сумма должна быть больше нуля и меньше прогнозного долга.'); return; }
    setError(''); setChoices(draft); show('result');
  };
  const back = (destination: Page, label: string) => <button type="button" className="flex min-h-11 items-center gap-2 text-[13px] text-sea"
    onClick={() => { setError(''); show(destination); }}><ArrowLeft size={16} />{label}</button>;

  if (page === 'offer') return <div ref={top} className="space-y-4">
    {next ? <section className="deep-card space-y-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{next.result.status === 'available' ? 'Рекомендуемое погашение' : 'Ближайшая возможность'}</h3>
        <span className="rounded-full bg-surface/20 px-3 py-1 text-xs">{statuses[next.result.status]}</span>
      </div>
      <div className="flex flex-wrap gap-2">{next.result.actions.map(a => <Bank key={a.debtId} id={a.debtId} />)}</div>
      <div><p className="text-sm text-card-muted">{ddmmyyyy(next.date)}</p><p className="text-xl font-semibold">{next.result.title}</p></div>
      <div className="grid grid-cols-1 gap-2 text-ink min-[385px]:grid-cols-3">
        <Metric label="Потребуется"><Money value={next.result.amount} approx={next.result.actions.some(a => !a.verified)} /></Metric>
        <Metric label="Экономия"><Savings value={next.result.savings} /></Metric>
        <Metric label="В резерве"><Amount value={next.result.reserveAfter.cautious} approximate /></Metric>
      </div>
      {next.result.status !== 'available' && <p className="text-sm text-card-muted">Повторите расчёт после фактического поступления и сверки суммы в банке.</p>}
    </section> : <section className="card space-y-3 p-5">
      <ShieldAlert size={23} className="text-warn" />
      <h3 className="text-xl font-semibold">{!preview ? 'Ищем выгодную дату' : preview.failed ? 'Расчёт прервался' : 'Пока небезопасно'}</h3>
      {preview?.baselineIssue && <p className="text-sm">{ddmm(preview.baselineIssue.date)} · {preview.baselineIssue.title}
        {preview.baselineIssue.deficit != null && <> · не хватает <Money value={preview.baselineIssue.deficit} kopecks /></>}</p>}
      <p className="text-sm text-muted">{!preview ? 'Сравниваем экономию и обязательные платежи в осторожном прогнозе.' :
        preview.nextIncome ? `Проверьте прогноз после поступления «${preview.nextIncome.title}» ${ddmm(preview.nextIncome.date)} и покрытия обязательных платежей.` :
          'Сначала обеспечьте обязательные платежи и запас 20 000 ₽. Самостоятельный анализ покажет, что меняется при досрочке.'}</p>
    </section>}
    {next && <PrimaryButton onClick={() => openOffer(next)}>Посмотреть план погашения <ArrowRight size={17} /></PrimaryButton>}
    <SecondaryButton className="w-full" onClick={() => show('date')}>Самостоятельный анализ</SecondaryButton>
  </div>;

  if (page === 'date') return <div ref={top} className="space-y-3">
    {back('offer', 'К рекомендации')}
    <div className="card space-y-3 p-4">
      <CalendarDays size={24} className="text-sea" />
      <h3 className="text-xl font-semibold">Когда планируете погашение?</h3>
      <Field label="Другая дата"><input className="field min-h-12" type="date" min={today} max={max} value={date}
        onChange={e => { setDate(e.target.value); setError(''); }} /></Field>
      <div className="grid gap-2">
        <SecondaryButton onClick={() => chooseDate(today)}>Сегодня</SecondaryButton>
        <SecondaryButton disabled={!inventory?.nextSalary} onClick={() => chooseDate(inventory!.nextSalary!.date)}>После ближайшей зарплаты{inventory?.nextSalary ? ` · ${ddmm(inventory.nextSalary.date)}` : ''}</SecondaryButton>
        {march >= today && march <= max && <SecondaryButton onClick={() => chooseDate(march)}>31 марта 2027 года</SecondaryButton>}
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-warn">{error}</p>}
    <PrimaryButton onClick={() => chooseDate(date)}>Выбрать дату</PrimaryButton>
  </div>;

  if (page === 'products') return <div ref={top} className="space-y-3">
    {back('date', 'Изменить дату')}
    <h3 className="text-xl font-semibold">Что планируем погасить?</h3>
    <p className="text-sm text-muted">{ddmmyyyy(date)} · можно выбрать несколько обязательств</p>
    {!inventory?.products && <p role="status" className="text-sm text-muted">{inventory?.failed ? 'Расчёт прервался. Выберите дату ещё раз.' : 'Считаю остатки на выбранную дату…'}</p>}
    {inventory?.products?.length === 0 && <p className="text-sm text-muted">На эту дату нет подходящих действующих обязательств.</p>}
    {inventory?.products?.map(product => <Product key={product.id} product={product} date={date} value={picked[product.id]} onChange={value => {
      pick(previous => {
        const next = { ...previous };
        if (value) next[product.id] = value; else delete next[product.id];
        return next;
      });
      setError('');
    }} />)}
    {error && <p role="alert" className="text-sm text-warn">{error}</p>}
    <PrimaryButton disabled={!inventory?.products?.some(product => !!picked[product.id])} onClick={calculate}>Рассчитать последствия</PrimaryButton>
  </div>;

  return <div ref={top} className="space-y-3">
    {back('products', 'Изменить обязательства')}
    {!analysis?.result?.cashflow && <p role="status" className="card p-4 text-sm">{analysis ? 'Вариант недоступен для расчёта. Проверьте сумму и условия договора.' : 'Считаю платежи и остатки…'}</p>}
    {analysis?.result?.cashflow && <Result today={today} date={date} row={analysis.result} alternative={analysis.alternative} nextIncome={analysis.nextIncome}
      onAlternative={alternative => openOffer({ date, result: alternative })} />}
    <details className="card p-3 text-sm">
      <summary className="min-h-9 text-sea">Подробности расчёта</summary>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={withoutVacation} onChange={e => setWithoutVacation(e.target.checked)} /> Сравнить без отпускных поступлений</label>
      <p className="text-muted">Базовый учитывает условные премии. Осторожный снижает оценку отпускных. Стрессовый добавляет задержки и внеплановый расход.</p>
      {!!analysis?.result?.removed.length && <p className="mt-2">Будущие платежи, которые исчезнут · {analysis.result.removed.length}</p>}
      {analysis?.result?.removed.slice(0, 5).map(p => <p className="mt-1 text-muted" key={p.key}>{ddmm(p.date)} · {p.title} · <Money value={p.amount} /></p>)}
    </details>
  </div>;
}

function Product({ product, date, value, onChange }: { product: RepaymentProduct; date: string; value?: Picked[string]; onChange: (v?: Picked[string]) => void }) {
  const [terms, edit] = useState(false);
  return <section className={`card space-y-3 p-3 ${value ? 'border border-sea/55' : ''}`}>
    <button type="button" aria-pressed={!!value} className="flex min-h-12 w-full items-center gap-3 text-left"
      onClick={() => onChange(value ? undefined : { mode: 'close', amount: '' })}>
      <Bank id={product.id} name={product.short} />
      <span className="min-w-0 flex-1"><span className="block font-medium">{product.name}</span>
        <span className="block text-[13px] text-muted">{product.quote == null ? 'Прогноз долга' : 'Закрытие по данным банка'} · <Money value={product.quote ?? product.balance} approx={product.quote == null} /></span></span>
      <span className={`grid size-6 shrink-0 place-items-center rounded-md border ${value ? 'border-sea bg-sea text-on-sea' : 'border-line'}`}>{value && <Check size={15} />}</span>
    </button>
    {value && <>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={value.mode === 'close'} className={`min-h-11 rounded-xl px-2 text-xs ${value.mode === 'close' ? 'bg-sea text-on-sea' : 'bg-surface-2 text-ink'}`}
          onClick={() => onChange({ ...value, mode: 'close' })}>Полностью закрыть</button>
        {product.modes.some(mode => mode !== 'close') && <button type="button" aria-pressed={value.mode !== 'close'} className={`min-h-11 rounded-xl px-2 text-xs ${value.mode !== 'close' ? 'bg-sea text-on-sea' : 'bg-surface-2 text-ink'}`}
          onClick={() => onChange({ ...value, mode: product.modes.find(mode => mode !== 'close')! })}>Погасить частично</button>}
      </div>
      {value.mode !== 'close' && <>
        <Field label="Сумма в счёт основного долга, ₽"><input className="field" inputMode="decimal" value={value.amount} onChange={e => onChange({ ...value, amount: e.target.value })} /></Field>
        {product.modes.includes('term') && product.modes.includes('payment') && <Segmented value={value.mode} onChange={mode => onChange({ ...value, mode })}
          options={[{ id: 'term', label: 'Сократить срок' }, { id: 'payment', label: 'Снизить платёж' }]} />}
      </>}
      <button type="button" className="min-h-10 text-left text-[13px] text-sea" onClick={() => edit(!terms)}>Условия и сумма закрытия из банка</button>
      {terms && <TermsFields id={product.id} date={date} onSaved={() => edit(false)} />}
    </>}
  </section>;
}

const effects = { none: 'Прогноз покрывает обязательные платежи.', same: 'Разрыв в этот период уже был в плане.',
  new: 'Нехватку создаёт выбранная досрочка.', worse: 'Выбранная досрочка ухудшает исходный прогноз.',
  better: 'Досрочка уменьшает или отодвигает нехватку.', resolved: 'Досрочка устраняет разрыв после выбранной даты.' };

function Result({ today, date, row, alternative, nextIncome, onAlternative }: { today: string; date: string; row: RepaymentResult;
  alternative?: RepaymentResult; nextIncome?: CoverageStep; onAlternative: (row: RepaymentResult) => void }) {
  const [scenario, choose] = useState<Scenario>('cautious');
  const cash = row.cashflow![scenario];
  const minimum = cash.events.find(e => e.kind === 'minimum');
  const approved = row.status === 'available';
  return <div className="space-y-3">
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">{row.actions.map(a => <Bank key={a.debtId} id={a.debtId} />)}
        <span className={`rounded-full px-3 py-1 text-xs ${approved ? 'bg-pos/12 text-pos' : 'bg-warn/12 text-warn'}`}>{statuses[row.status]}</span>
      </div>
      <h3 className="text-xl font-semibold">{row.title}</h3>
      <p className="text-sm text-muted">{ddmmyyyy(date)} · фактический резерв сейчас <Amount value={cash.actualReserve} kopecks /></p>
      <Segmented value={scenario} onChange={choose} options={scenarioOptions} />
      <div className="grid grid-cols-2 gap-2">
        <Metric label={date === today ? 'По прогнозу перед досрочкой' : 'Ожидается к выбранной дате'}><Amount value={cash.before} kopecks /></Metric>
        <Metric label="Сумма досрочки"><Money value={row.amount} approx={row.actions.some(a => !a.verified)} kopecks /></Metric>
        <Metric label="Резерв после"><Amount value={cash.after} kopecks /></Metric>
        <Metric label="Необходимый запас"><Money value={RESERVE_BUFFER} /></Metric>
      </div>
      <p className="text-sm text-muted">Будущие поступления учитываются по выбранному сценарию.</p>
    </section>
    {cash.earlier && <Gap issue={cash.earlier} heading="Нехватка ещё до досрочки" note="Этот платёж был под риском и в плане по графику." />}
    {cash.first && <p className="px-1 text-sm text-muted">Горизонт прогноза до {ddmmyyyy(cash.until)} с учётом будущих поступлений.</p>}
    {cash.first ? <Gap issue={cash.first} heading={cash.first.date === date && cash.first.title.includes('Модель') ? 'На досрочку не хватает денег' : 'Первый платёж под риском после выбранной даты'}
      note={effects[cash.change]} /> : <p className="card p-4 text-sm">{!cash.known ? 'Для проверки покрытия требуется сверка остатков.' :
      cash.earlier ? `С выбранной даты до ${ddmmyyyy(cash.until)} новых разрывов в этом сценарии нет.` :
        `По этому сценарию обязательные платежи обеспечены до ${ddmmyyyy(cash.until)}.`} {cash.change === 'resolved' && effects.resolved}</p>}
    {minimum?.amount != null && minimum.amount >= 0 && minimum.amount < RESERVE_BUFFER &&
      <p className="rounded-2xl border border-warn/25 bg-warn/8 p-3 text-sm text-warn">Резерв ниже запаса 20 000 ₽ · {ddmmyyyy(minimum.date)} останется <Money value={minimum.amount} kopecks />.</p>}
    {!approved && row.status === 'unsafe' && <section className="card space-y-2 p-4">
      <h3 className="font-semibold">Что можно сделать вместо этого</h3>
      {alternative ? <><p className="text-sm">{alternative.title} · внести <Money value={alternative.amount} approx /> · экономия <Savings value={alternative.savings} /></p>
        <p className="text-sm text-muted">{alternative.status === 'conditional' ? 'Вариант зависит от поступлений или условий банка.' : 'Вариант выдерживает осторожный прогноз.'}</p>
        <SecondaryButton onClick={() => onAlternative(alternative)}>Проверить этот вариант</SecondaryButton></> :
        <p className="text-sm text-muted">Пока сохраните платежи по графику. {nextIncome ? `Вернитесь к расчёту после «${nextIncome.title}» ${ddmm(nextIncome.date)} и покрытия платежей под риском.` : 'Повторите расчёт после сверки резерва и ближайших платежей.'}</p>}
    </section>}
    <Timeline cash={cash} />
    <section className="card space-y-1 p-4">
      <h3 className="font-semibold">Экономия на процентах и комиссиях</h3>
      <p className="text-xl font-semibold"><Savings value={cash.savings} /></p>
      <p className="text-[13px] text-muted">Оценка относительно выплат по графику до {ddmmyyyy(row.savingsUntil)}.</p>
      {row.actions.some(a => !a.verified) && <p className="text-[13px] text-muted">Для точного сравнения нужны сумма закрытия на выбранную дату и условия банка.</p>}
    </section>
  </div>;
}

function Gap({ issue, heading, note }: { issue: CashIssue; heading: string; note: string }) {
  const book = useStore(s => s.accountBook);
  const account = accountOptions(book).find(a => a.id === issue.accountId)?.name;
  return <section className="rounded-2xl border border-warn/25 bg-warn/8 p-4 text-sm">
    <h3 className="flex items-center gap-2 font-semibold text-warn"><ShieldAlert className="shrink-0" size={17} />{heading}</h3>
    <p className="mt-2 font-medium">{ddmmyyyy(issue.date)} · {issue.title.replace('Модель досрочного погашения', 'Досрочное погашение')}</p>
    <p className="text-muted">{account ?? 'Счёт требует сверки'}{issue.payment != null && <> · платёж <Money value={issue.payment} kopecks /></>}</p>
    {issue.deficit != null && issue.deficit > 0 && <p className="mt-2 text-lg font-semibold">Не хватает <Money value={issue.deficit} kopecks /></p>}
    <p className="mt-1 text-muted">{note}</p>
  </section>;
}

function Timeline({ cash }: { cash: RepaymentCashflow }) {
  if (!cash.points.length) return null;
  const start = Date.parse(cash.points[0].date), end = Date.parse(cash.points.at(-1)!.date);
  const samples = cash.points.flatMap(p => [p.reserve, p.schedule]).concat(0);
  const low = Math.min(...samples), high = Math.max(...samples);
  const X = (date: string) => 44 + 286 * (Date.parse(date) - start) / Math.max(1, end - start);
  const Y = (value: number) => 132 - 112 * (value - low) / Math.max(1, high - low);
  const line = (key: 'reserve' | 'schedule') => cash.points.map(p => `${X(p.date)},${Y(p[key])}`).join(' ');
  const compact = (n: number) => `${Math.round(n / 1000)} тыс.`;
  const keys = [0, Math.floor((cash.points.length - 1) / 2), cash.points.length - 1];
  return <section className="card p-4">
    <h3 className="font-semibold">Резерв по датам</h3>
    <svg className="mt-2 block w-full overflow-visible" viewBox="0 0 340 153" role="img" aria-label="График резерва по датам, ₽">
      {[high, 0, low].filter((v, i, a) => a.indexOf(v) === i).map(v => <g key={v}>
        <line x1="44" x2="330" y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
        <text x="0" y={Y(v) + 3} fontSize="8.5" fill="var(--muted)">{compact(v)}</text>
      </g>)}
      <polyline points={line('schedule')} fill="none" stroke="var(--muted)" strokeDasharray="4 4" />
      <polyline points={line('reserve')} fill="none" stroke="var(--sea)" strokeWidth="2.2" />
      {cash.events.map((event, index) => {
        const point = cash.points.find(p => p.date === event.date);
        return point ? <circle key={event.kind + event.date + index} cx={X(point.date)} cy={Y(point.reserve)} r="3.4"
          fill={event.kind === 'gap' ? 'var(--neg)' : event.kind === 'income' ? 'var(--pos)' : event.kind === 'payment' ? 'var(--warn)' : 'var(--sea)'}>
          <title>{ddmm(event.date)} · {event.title}</title>
        </circle> : null;
      })}
      {keys.filter((v, i, a) => a.indexOf(v) === i).map((i, index) => <text key={i} x={X(cash.points[i].date)} y="147"
        fontSize="9" fill="var(--muted)" textAnchor={index === 0 ? 'start' : i === cash.points.length - 1 ? 'end' : 'middle'}>{ddmm(cash.points[i].date)}</text>)}
    </svg>
    <p className="text-[12px] text-muted">₽ · сплошная линия с досрочкой · пунктир по графику</p>
    <ul className="mt-2 divide-y divide-line text-[13px]">
      {cash.events.map((e, i) => <li key={e.date + e.title + i} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-2 py-2">
        <span className="text-muted">{ddmm(e.date)}</span><span>{e.title}</span>{e.amount != null && <Money value={e.amount} />}
      </li>)}
    </ul>
  </section>;
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

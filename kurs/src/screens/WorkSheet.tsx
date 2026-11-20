import { useMemo, useState } from 'react';
import { Field, Money, PrimaryButton, SecondaryButton, Segmented, Sheet } from '../components/ui';
import { accountOptions, LIFE_ACCOUNT, validDate } from '../domain/accounts';
import { eventsBetween } from '../domain/calendar';
import { addDays, ddmmyyyy, monthKey } from '../domain/dates';
import { parseAmount } from '../domain/money';
import { accrual, payComponents, UNIT_REFERENCE, vacationDays, vacationGross, workPayments, type PayrollProfile, type PayRate, type Vacation } from '../domain/payroll';
import { uid, useStore } from '../store/store';
import { toast, useCal, useToday, useUi } from '../store/ui';

export function WorkSheet() {
  const open = useUi(s => s.workSheet);
  const set = useUi(s => s.set);
  return <Sheet open={open} title="Работа и доходы" onClose={() => set({ workSheet: false })}>{open && <Body />}</Sheet>;
}

function Body() {
  const cal = useCal();
  const now = useToday();
  const [tab, setTab] = useState<'income' | 'calendar' | 'vacations' | 'settings'>(cal.work ? 'income' : 'settings');
  return <div className="space-y-4">
    <Segmented value={tab} onChange={setTab} options={[{ id: 'income', label: 'Доходы' }, { id: 'calendar', label: 'Календарь' },
      { id: 'vacations', label: 'Отпуск' }, { id: 'settings', label: 'Параметры' }]} />
    {tab === 'settings' ? <WorkSettings /> : !cal.work ? <p className="px-2 text-[14px] text-muted">Укажите параметры начисления, чтобы включить модель.</p>
      : tab === 'vacations' ? <Vacations profile={cal.work} /> : <Income profile={cal.work} now={now} calendar={tab === 'calendar'} />}
  </div>;
}

function Income({ profile, now, calendar }: { profile: PayrollProfile; now: string; calendar: boolean }) {
  const set = useUi(s => s.set);
  const cal = useCal();
  const from = addDays(now, -45);
  const to = addDays(now, 120);
  const events = useMemo(() => eventsBetween(cal, from, to).filter(e => e.kind === 'income'), [cal, from, to]);
  const payments = useMemo(() => workPayments(profile, from, to, cal.marks), [profile, from, to, cal.marks]);
  const upcoming = events.find(e => !cal.marks?.[e.key]?.done && e.date >= now && e.accrualPeriod);
  const relevant = calendar ? events : [...events.filter(e => cal.marks?.[e.key]?.done && e.accrualPeriod).slice(-3), ...(upcoming ? [upcoming] : [])];
  const summary = accrual(profile, monthKey(now));
  return <>
    <p className="px-1 text-[13px] text-muted">{summary.days} рабочих дней в текущем месяце · {summary.firstDays} в первой половине.</p>
    {relevant.length === 0 && <p className="px-1 text-[14px] text-muted">В этом периоде выплат по модели нет.</p>}
    <div className="card divide-y divide-line">
      {relevant.map(e => {
        const pay = payments.find(p => p.key === e.key || (p.accrualPeriod === e.accrualPeriod && p.kind === e.incomeKind));
        const mark = cal.marks?.[e.key];
        const actual = mark?.done ? mark.amount : undefined;
        const expected = pay?.net ?? e.amount;
        return <button type="button" key={e.key} className="block w-full px-4 py-3 text-left" onClick={() => set({ workSheet: false, event: e })}>
          <div className="flex justify-between gap-2"><span className="font-medium">{e.title}</span><Money value={actual ?? e.amount} approx={actual == null} /></div>
          <div className="mt-1 text-[13px] text-muted">{ddmmyyyy(e.date)}
            {e.accrualPeriod && <> · период {e.accrualPeriod}</>}{e.nominalDate && e.nominalDate !== e.date && <> · по графику {ddmmyyyy(e.nominalDate)}</>}
            {' · '}{mark?.done ? 'поступление отмечено' : e.economicType === 'loan_disbursement' ? 'заём' : e.confidence === 'tentative' ? 'предварительно' : 'прогноз'}
          </div>
          {pay && <p className="mt-1 text-[12px] text-muted">Начислено <Money value={pay.gross} /> · НДФЛ <Money value={pay.tax} />
            {actual != null && <> · отклонение <Money value={actual - expected} sign /></>}
            {pay.netRange && <> · без сверки базы ориентир на руки <Money value={pay.netRange[0]} />–<Money value={pay.netRange[1]} /></>}
          </p>}
        </button>;
      })}
    </div>
    <p className="px-1 text-[13px] text-muted">Аванс 25-го, окончательный расчёт 10-го, ежемесячная премия 15-го. При выходном дата сдвигается на предыдущий рабочий день.</p>
  </>;
}

const fields = [
  ['unit', 'Расчётная единица, ₽'], ['positionUnits', 'Должностной оклад, единиц'], ['rankUnits', 'Классный чин, единиц'],
  ['seniority', 'Выслуга, %'], ['conditions', 'Особые условия, %'], ['monthlyBonus', 'Ежемесячная премия, % оклада'],
] as const;
type RateField = typeof fields[number][0];
const asTexts = (r?: PayRate): Record<RateField, string> => ({
  unit: r ? String(r.unit) : '', positionUnits: r ? String(r.positionUnits) : '', rankUnits: r ? String(r.rankUnits) : '',
  seniority: r ? String(r.seniority * 100) : '', conditions: r ? String(r.conditions * 100) : '', monthlyBonus: r ? String(r.monthlyBonus * 100) : '',
});

function WorkSettings() {
  const now = useToday();
  const { work, accountBook, saveWork } = useStore();
  const latest = work?.rates.reduce<PayRate | undefined>((last, r) => !last || r.from > last.from ? r : last, undefined);
  const [start, setStart] = useState(work?.from ?? now);
  const [from, setFrom] = useState(latest?.from ?? now);
  const [values, setValues] = useState(() => asTexts(latest));
  const [accountId, setAccount] = useState(work?.accountId ?? LIFE_ACCOUNT);
  const [confirmed, setConfirmed] = useState(latest?.confidence === 'confirmed');
  const [mode, setMode] = useState(work?.advancesBy ?? 'days');
  const [specialDate, setSpecialDate] = useState(now);
  const [shift, setShift] = useState('');
  const [absence, setAbsence] = useState('');
  const [taxDate, setTaxDate] = useState(now);
  const [taxBase, setTaxBase] = useState('');
  const [source, setSource] = useState(latest?.source ?? '');
  const [editRateDate, setEditRateDate] = useState(latest?.from);
  const compareRate = work?.rates.find(r => r.from.startsWith('2027-'));
  const save = () => {
    const unit = parseAmount(values.unit), positionUnits = parseAmount(values.positionUnits), rankUnits = parseAmount(values.rankUnits);
    const seniority = parseAmount(values.seniority), conditions = parseAmount(values.conditions), monthlyBonus = parseAmount(values.monthlyBonus);
    if (!unit || !positionUnits || rankUnits == null || seniority == null || conditions == null || monthlyBonus == null) {
      toast('Заполните коэффициенты. Если надбавки нет, введите 0.'); return;
    }
    const rate: PayRate = { from, unit, positionUnits, rankUnits, seniority: seniority / 100, conditions: conditions / 100,
      monthlyBonus: monthlyBonus / 100, confidence: confirmed ? 'confirmed' : 'estimate', source: source.trim() || undefined };
    const rates = [...(work?.rates ?? []).filter(r => r.from !== from), rate];
    const workingHours = { ...work?.workingHours };
    const absenceHours = { ...work?.absenceHours };
    const tax = { ...work?.taxBase };
    const h = parseAmount(shift), absent = parseAmount(absence), base = parseAmount(taxBase);
    if (h != null) workingHours[specialDate] = h;
    if (absent != null) absenceHours[specialDate] = absent;
    if (base != null) tax[taxDate.slice(0, 4)] = { base, asOf: taxDate };
    const next = { ...work, from: start, rates, accountId, advancesBy: mode, workingHours, absenceHours, taxBase: tax };
    if (!saveWork(next)) { toast('Проверьте даты действия и значения'); return; }
    setEditRateDate(from); toast('Параметры сохранены');
  };

  return <>
    <div className="card space-y-3 p-4">
      {work && <div className="space-y-2">
        <h3 className="font-medium">История ставок</h3>
        {[...work.rates].sort((a, b) => b.from.localeCompare(a.from)).map(r => <button type="button" key={r.from}
          className="block text-left text-[14px] text-sea" onClick={() => {
            setEditRateDate(r.from); setFrom(r.from); setValues(asTexts(r)); setSource(r.source ?? ''); setConfirmed(r.confidence === 'confirmed');
          }}>{ddmmyyyy(r.from)} · <Money value={r.unit} /> за единицу · <Money value={payComponents(r).total} /> до НДФЛ</button>)}
        <SecondaryButton className="w-full" onClick={() => { setEditRateDate(undefined); setFrom(now); setConfirmed(false); }}>Добавить ставку с новой даты</SecondaryButton>
      </div>}
      {compareRate && <div className="rounded-xl bg-surface-2 p-3 text-[13px]">
        <p className="font-medium">Сценарии 2027 · полный месяц до НДФЛ</p>
        <p>Закон № 659-124 · <Money value={payComponents({ ...compareRate, unit: 2157 }).total} /></p>
        <p>Проект бюджета · <Money value={payComponents({ ...compareRate, unit: 2167 }).total} /></p>
      </div>}
      <Field label="Включить модель с даты"><input className="field" type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
      <Field label={editRateDate ? 'Дата действия ставки' : 'Новая ставка с даты'}><input className="field" type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
      {fields.map(([key, label]) => <Field key={key} label={label}><input className="field" inputMode="decimal" value={values[key]}
        onChange={e => setValues({ ...values, [key]: e.target.value })} /></Field>)}
      {UNIT_REFERENCE[Number(from.slice(0, 4))] && <button type="button" className="text-[13px] text-sea" onClick={() => setValues({ ...values, unit: String(UNIT_REFERENCE[Number(from.slice(0, 4))]) })}>Подставить единицу из закона № 659-124</button>}
      <Field label="Счёт зачисления"><select className="field" value={accountId} onChange={e => setAccount(e.target.value)}>
        {accountOptions(accountBook).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select></Field>
      <Field label="Основание"><input className="field" value={source} onChange={e => setSource(e.target.value)} placeholder="Расчётный листок или нормативный акт" /></Field>
      <label className="flex gap-2 text-[14px]"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Коэффициенты сверены</label>
    </div>
    <div className="card space-y-3 p-4">
      <h3 className="font-medium">График и налоговая база</h3>
      <Field label="Делить начисление пропорционально"><select className="field" value={mode} onChange={e => setMode(e.target.value as 'days' | 'hours')}>
        <option value="days">Рабочим дням</option><option value="hours">Рабочим часам</option>
      </select></Field>
      <Field label="Дата исключения"><input className="field" type="date" value={specialDate} onChange={e => {
        setSpecialDate(e.target.value); setShift(work?.workingHours?.[e.target.value]?.toString() ?? ''); setAbsence(work?.absenceHours?.[e.target.value]?.toString() ?? '');
      }} /></Field>
      <Field label="Норма часов на эту дату"><input className="field" inputMode="decimal" value={shift} onChange={e => setShift(e.target.value)} /></Field>
      <Field label="Часов неоплачиваемого отсутствия"><input className="field" inputMode="decimal" value={absence} onChange={e => setAbsence(e.target.value)} /></Field>
      <Field label="Накопленная налоговая база на дату"><input className="field" type="date" value={taxDate} onChange={e => {
        setTaxDate(e.target.value); setTaxBase(work?.taxBase?.[e.target.value.slice(0, 4)]?.base?.toString() ?? '');
      }} /></Field>
      <Field label="Облагаемый доход по справке"><input className="field" inputMode="decimal" value={taxBase} onChange={e => setTaxBase(e.target.value)} /></Field>
    </div>
    <PrimaryButton onClick={save}>Сохранить параметры</PrimaryButton>
  </>;
}

function Vacations({ profile }: { profile: PayrollProfile }) {
  const now = useToday();
  const saveWork = useStore(s => s.saveWork);
  const [v, setV] = useState<Vacation | null>(null);
  const [remaining, setRemaining] = useState(profile.vacationDaysRemaining?.toString() ?? '');
  const update = (patch: Partial<Vacation>) => setV(old => old ? { ...old, ...patch } : old);
  const vacations = profile.vacations ?? [];
  const formulaGross = v && validDate(v.from) && validDate(v.to) && v.to >= v.from ? vacationGross(v, profile) : null;
  const total = vacations.reduce((sum, row) => sum + vacationDays(row, profile.workingHours).calendar, 0);
  const save = () => {
    const list = v ? [...vacations.filter(r => r.id !== v.id), v] : vacations;
    if (!saveWork({ ...profile, vacations: list, vacationDaysRemaining: parseAmount(remaining) ?? undefined })) { toast('Проверьте даты и пересечения'); return; }
    setV(null); toast('Отпуск сохранён');
  };
  return <>
    <div className="card space-y-3 p-4">
      <p>В плане <b>{total} дн.</b>{profile.vacationDaysRemaining != null && <> · остаток по кадровым данным {profile.vacationDaysRemaining} дн.</>}</p>
      {vacations.map(row => {
        const days = vacationDays(row, profile.workingHours);
        return <button key={row.id} type="button" className="block text-left text-[14px] text-sea" onClick={() => setV(row)}>
          {ddmmyyyy(row.from)} — {ddmmyyyy(row.to)} · дней {days.calendar} · {row.status === 'approved' ? 'утверждён' : row.status === 'taken' ? 'отгулян' : 'запланирован'}
          {row.allowance && ' · три оклада'}
        </button>;
      })}
      <SecondaryButton className="w-full" onClick={() => setV({ id: uid(), from: now, to: now, status: 'planned' })}>Добавить период</SecondaryButton>
    </div>
    <div className="card space-y-3 p-4">
      <Field label="Остаток дней по кадровым данным"><input className="field" inputMode="numeric" value={remaining} onChange={e => setRemaining(e.target.value)} /></Field>
      {v && <>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Начало"><input className="field" type="date" value={v.from} onChange={e => update({ from: e.target.value })} /></Field>
          <Field label="Конец"><input className="field" type="date" value={v.to} onChange={e => update({ to: e.target.value })} /></Field>
        </div>
        <Field label="Статус"><select className="field" value={v.status} onChange={e => update({ status: e.target.value as Vacation['status'] })}>
          <option value="planned">Запланирован</option><option value="approved">Утверждён</option><option value="taken">Отгулян</option>
        </select></Field>
        <label className="flex gap-2 text-[14px]"><input type="checkbox" checked={!!v.allowance} onChange={e => update({ allowance: e.target.checked })} /> Единовременная выплата трёх окладов</label>
        <Field label="Дата выплаты по документу"><input className="field" type="date" value={v.payDate ?? ''} onChange={e => update({ payDate: e.target.value || undefined })} /></Field>
        <Field label="Дневное содержание до налога" hint="Возьмите из расчёта работодателя. Без основания сумма считается предварительной.">
          <input className="field" inputMode="decimal" value={v.dailyGross ?? ''} onChange={e => update({ dailyGross: parseAmount(e.target.value) ?? undefined })} />
        </Field>
        <Field label="Основание дневного расчёта"><input className="field" value={v.basis ?? ''} onChange={e => update({ basis: e.target.value || undefined })} /></Field>
        <details className="text-[13px]">
          <summary className="text-sea">Расчёт по основанию работодателя</summary>
          <div className="mt-2 space-y-2">
            <Field label="Делитель по применимому акту"><input className="field" inputMode="decimal" value={v.formula?.divisor ?? ''} onChange={e =>
              update({ formula: e.target.value ? { divisor: parseAmount(e.target.value) ?? 0, additions: v.formula?.additions ?? [] } : undefined })} /></Field>
            {v.formula && <Field label="Доплаты за расчётные 12 месяцев" hint="Укажите общую сумму включаемых начислений после индексации.">
              <input className="field" inputMode="decimal" value={v.formula.additions[0]?.amount ?? ''} onChange={e =>
                update({ formula: { ...v.formula!, additions: [{ amount: parseAmount(e.target.value) ?? 0 }] } })} />
            </Field>}
          </div>
        </details>
        {formulaGross != null && Number.isFinite(formulaGross) &&
          <p className="text-[13px] text-muted">Отпускное содержание до налога · <Money value={formulaGross} />.</p>}
      </>}
      <PrimaryButton onClick={save}>Сохранить</PrimaryButton>
    </div>
  </>;
}

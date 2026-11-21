import { useCoverage } from '../components/Coverage';
import { annualIncome, INCOME_GROUPS } from '../domain/annualIncome';
import { payrollRegister } from '../domain/payrollRegister';
import { compare2027Coverage } from '../domain/coverage';
import { useMemo, useState } from 'react';
import { Field, Money, PrimaryButton, SecondaryButton, Segmented, Sheet } from '../components/ui';
import { accountOptions, LIFE_ACCOUNT, validDate } from '../domain/accounts';
import { cashIncomeEvent, eventsBetween, incomeStatus, INCOME_STATUS_LABEL } from '../domain/calendar';
import { addDays, ddmm, ddmmyyyy } from '../domain/dates';
import { parseAmount } from '../domain/money';
import { isRegularWork, payComponents, payRateOn, progressiveTax, UNIT_2027, UNIT_REFERENCE, vacationDays, vacationGross, with2027Unit, type PayrollProfile, type PayRate, type Vacation } from '../domain/payroll';
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

function UnitCoverage() {
  const { input, now } = useCoverage('cautious');
  const choices = useMemo(() => compare2027Coverage(input, now), [input, now]);
  return choices.length > 0 && <div className="card space-y-3 p-4 text-[13px]">
    <h3 className="font-medium">Осторожный прогноз по расчётным единицам</h3>
    {choices.map(c => <div key={c.id}>
      <p>{c.label} · <Money value={c.unit} /></p>
      <p className="text-muted">Минимум до {ddmmyyyy(c.to)} · <Money value={Math.min(c.start, c.min?.balance ?? c.start)} /></p>
      {c.accountRisk && <p className="text-warn">{ddmmyyyy(c.accountRisk.date)} · {c.accountRisk.title} · {c.accountRisk.amount == null ? 'проверьте счёт' : <Money value={c.accountRisk.amount} />}</p>}
    </div>)}
  </div>;
}

function Income({ profile, now, calendar }: { profile: PayrollProfile; now: string; calendar: boolean }) {
  const set = useUi(s => s.set);
  const cal = useCal();
  const [year, setYear] = useState<'2026' | '2027'>(now.startsWith('2026') ? '2026' : '2027');
  const [unit, setUnit] = useState<'proposal' | 'law'>('proposal');
  const law = useMemo(() => ({ ...cal, work: with2027Unit(profile, UNIT_2027[0].unit) }), [cal, profile]);
  const historical = useMemo(() => annualIncome(cal, 2026, now, 'base'), [cal, now]);
  const main = useMemo(() => annualIncome(cal, 2027, now, 'base'), [cal, now]);
  const cautious = useMemo(() => annualIncome(law, 2027, now, 'cautious'), [law, now]);
  const events = useMemo(() => eventsBetween(year === '2027' && unit === 'law' ? law : cal, year + '-01-01', year + '-12-31')
    .filter(cashIncomeEvent), [cal, law, year, unit]);
  const nearby = useMemo(() => eventsBetween(cal, now, addDays(now, 70)).filter(e => cashIncomeEvent(e) &&
    isRegularWork(e.incomeKind) && !cal.marks?.[e.key]?.done && !e.payroll?.documented && !e.payroll?.bankConfirmed).slice(0, 3), [cal, now]);
  const relevant = calendar ? events : [];
  const missing = useMemo(() => calendar ? payrollRegister(year === '2027' && unit === 'law' ? law : cal, Number(year), Number(year))
    .regular.filter(r => r.status === 'missing') : [], [calendar, year, unit, law, cal]);
  const firstRate = payRateOn(profile, '2026-12-31');
  const nextRate = payRateOn(profile, '2027-01-01');
  const result = year === '2026' ? historical : main;
  const fmtMonth = (key: string) => new Intl.DateTimeFormat('ru', { month: 'long', timeZone: 'UTC' }).format(new Date(key + '-01'));
  const amount = (value: number | null) => value == null ? '—' : <Money value={value} />;

  return <>
    {!calendar && nearby.length > 0 && <section className="card divide-y divide-line px-4">
      <h3 className="pt-3 text-[15px] font-medium">Ближайшие выплаты от работодателя</h3>
      {nearby.map(e => <button className="flex min-h-11 w-full items-center justify-between gap-2 py-3 text-left" key={e.key} type="button"
        onClick={() => set({ workSheet: false, event: e })}>
        <span className="min-w-0"><span className="font-medium">{ddmm(e.date)} · {e.title}</span>
          <span className="block text-[12px] text-muted">{e.accrualPeriod} · расчёт</span></span>
        <Money value={e.amount} approx kopecks className="shrink-0" />
      </button>)}
    </section>}
    <Segmented value={year} onChange={setYear} options={[{ id: '2026', label: '2026' }, { id: '2027', label: '2027' }]} />
    {calendar && year === '2027' && <Segmented value={unit} onChange={setUnit} options={[
      { id: 'proposal', label: 'Основной' }, { id: 'law', label: 'По закону' },
    ]} />}
    {!calendar && <>
      <div className="card space-y-3 p-4">
        <h3 className="font-medium">Доходы в {year}</h3>
        <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
          <span>Фактически зачислено</span><b className="text-right">{amount(result.actual)}</b>
          {result.documentary > 0 && <><span>По документам, без отметки банка</span><b className="text-right">{amount(result.documentary)}</b></>}
          <span>Ожидается до конца года</span><b className="text-right">{amount(result.expected || null)}</b>
          {result.conditional > 0 && <><span>Из прогноза на условиях</span><b className="text-right">{amount(result.conditional)}</b></>}
          <span>{year === '2026' ? 'Известные суммы и остаток года' : 'Основной прогноз за год'}</span><b className="text-right">{amount(result.total)}</b>
          {year === '2027' && <><span>Осторожный прогноз за год</span><b className="text-right">{amount(cautious.total)}</b></>}
        </div>
        <p className="text-[12.5px] text-muted">{year === '2026' ? 'Частичные подтверждённые данные. Пропущенные листки и банковские зачисления не реконструированы как факт.'
          : 'Цифры по году получения денег. Основной сценарий включает условные премии. Осторожный использует расчётную единицу по закону и 80% оценки запланированных отпускных, без неподтверждённых дополнительных премий.'}</p>
        {year === '2026' && result.missingEstimate > 0 && <p className="text-[12.5px] text-muted">
          Оценка регулярных выплат за прошедшие месяцы без факта · <Money value={result.missingEstimate} approx />. В итог не включена.
        </p>}
        <details className="text-[13px]">
          <summary className="text-sea">Из чего складываются доходы</summary>
          <div className="mt-2 divide-y divide-line">
            {result.breakdown.filter(row => row.total != null).map(row => <div className="py-2" key={row.group}>
              <p>{INCOME_GROUPS[row.group]}</p>
              <p className="text-muted">Поступило {amount(row.actual)}{row.documentary > 0 && <> · по листкам {amount(row.documentary)}</>} · ожидается {amount(row.expected || null)}
                {row.conditional > 0 && <> · условно {amount(row.conditional)}</>}</p>
            </div>)}
          </div>
        </details>
      </div>
      {year === '2026' && firstRate && <RateCard rate={firstRate} label="Полный отработанный месяц" />}
      {year === '2027' && nextRate && <>
        <RateCard rate={nextRate} label="Основной сценарий 2027" />
        {nextRate.unit !== UNIT_2027[0].unit && <RateCard rate={{ ...nextRate, unit: UNIT_2027[0].unit }} label="Действующая единица по закону" />}
      </>}
      <div className="card overflow-hidden p-3">
        <table className="w-full text-[12px] tabular-nums">
          <caption className="pb-2 text-left text-[14px] font-medium">Зачисления по месяцам</caption>
          <thead><tr className="text-muted"><th className="text-left font-medium">Месяц</th>
            <th className="text-right font-medium">{year === '2026' ? 'Факт' : 'Основной'}</th>
            <th className="text-right font-medium">{year === '2026' ? 'Ожидается' : 'Осторожный'}</th></tr></thead>
          <tbody>{result.months.map((row, index) => <tr className="border-t border-line" key={row.month}>
            <th className="py-1.5 text-left font-normal">{fmtMonth(row.month)}</th>
            <td className="pl-2 text-right">{amount(year === '2026' ? row.actual : row.total)}</td>
            <td className="pl-2 text-right">{amount(year === '2026' ? row.expected || null : cautious.months[index].total)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
    {missing.length > 0 && <details className="card p-3 text-[13px]">
      <summary>Периоды без ставки или документа · {missing.length}</summary>
      {missing.map(row => <p className="pt-2 text-muted" key={row.key}>{ddmm(row.nominalDate)} · {
        row.kind === 'advance' ? 'Аванс' : row.kind === 'salary' ? 'Зарплата' : 'Ежемесячное поощрение'}</p>)}
    </details>}
    {calendar && relevant.length === 0 && <p className="px-1 text-[14px] text-muted">В этом периоде выплат нет.</p>}
    {relevant.length > 0 && <div className="card divide-y divide-line">
      {relevant.map(e => {
        const pay = e.payroll;
        const mark = cal.marks?.[e.key];
        const actual = mark?.done ? mark.amount ?? e.amount : pay?.actualNet;
        const status = incomeStatus(e, mark);
        return <button type="button" key={e.key} className="block w-full px-4 py-3 text-left" onClick={() => set({ workSheet: false, event: e })}>
          <div className="flex justify-between gap-2"><span className="min-w-0 font-medium">{e.title}</span><Money value={actual ?? e.amount} approx={actual == null} kopecks className="shrink-0" /></div>
          <div className="mt-1 text-[13px] text-muted">
            {e.dateMode === 'month' ? fmtMonth(e.date.slice(0, 7)) : ddmmyyyy(e.date)}
            {e.accrualPeriod && <> · расчётный период {e.accrualPeriod}</>}
            {status && <> · {INCOME_STATUS_LABEL[status]}</>}
          </div>
          {pay && <p className="mt-1 text-[12px] text-muted">
            {(!pay.documented || pay.actualGrossKnown) && <>Начислено <Money value={pay.gross} /> · </>}
            {(!pay.documented || pay.actualTaxKnown) && <>НДФЛ <Money value={pay.tax} /> · </>}
            {pay.workDays != null && <>Отработано {pay.paidDays} из {pay.workDays} дней · </>}
            {pay.documentarySource ?? pay.source}
          </p>}
        </button>;
      })}
    </div>}
  </>;
}

function RateCard({ rate, label }: { rate: PayRate; label: string }) {
  const components = payComponents(rate);
  return <div className="card space-y-1 p-4 text-[13px]">
    <h3 className="font-medium">{label}</h3>
    <p>Единица <Money value={rate.unit} /> · должностной оклад <Money value={components.position} /> · чин <Money value={components.rank} /></p>
    <p>Выслуга <Money value={components.seniority} /> · особые условия <Money value={components.conditions} /> · премия <Money value={components.bonus} /></p>
    <p><b><Money value={components.total} /> начислено</b> · <Money value={components.total - progressiveTax(components.total)} approx /> при 13%</p>
    <p className="text-[12.5px] text-muted">Аванс 25-го · остаток оклада 10-го · премия 15-го. НДФЛ в прогнозе считается по накопленной базе года выплаты.</p>
  </div>;
}

const fields = [
  ['unit', 'Расчётная единица, ₽'], ['positionUnits', 'Должностной оклад, единиц'], ['rankUnits', 'Классный чин, единиц'],
  ['seniority', 'Выслуга, %'], ['conditions', 'Особые условия, %'], ['monthlyBonus', 'Ежемесячное поощрение, % оклада'],
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
    {work && <UnitCoverage />}
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
  const daysByYear = new Map<string, number>();
  for (const row of vacations) {
    const year = row.from.slice(0, 4);
    daysByYear.set(year, (daysByYear.get(year) ?? 0) + vacationDays(row, profile.workingHours).calendar);
  }
  const save = () => {
    const list = v ? [...vacations.filter(r => r.id !== v.id), v] : vacations;
    if (!saveWork({ ...profile, vacations: list, vacationDaysRemaining: parseAmount(remaining) ?? undefined })) { toast('Проверьте даты и пересечения'); return; }
    setV(null); toast('Отпуск сохранён');
  };
  return <>
    <div className="card space-y-3 p-4">
      <p>{[...daysByYear].map(([year, days]) => <span className="mr-3" key={year}>{year} · <b>{days} дн.</b></span>)}
        {profile.vacationDaysRemaining != null && <>Остаток по кадровым данным {profile.vacationDaysRemaining} дн.</>}</p>
      {vacations.map(row => {
        const days = vacationDays(row, profile.workingHours);
        return <button key={row.id} type="button" className="block text-left text-[14px] text-sea" onClick={() => setV(row)}>
          {ddmmyyyy(row.from)} — {ddmmyyyy(row.to)} · дней {days.calendar} · {row.status === 'approved' ? 'утверждён' : row.status === 'taken' ? 'отгулян' : 'запланирован'}
          {row.allowance && ' · три оклада'}
          <span className="block text-[12.5px] text-muted">
            {row.payDate && <>Дата выплаты {ddmmyyyy(row.payDate)} · </>}
            {vacationGross(row, profile) != null && <><Money value={vacationGross(row, profile)!} approx={row.status === 'planned'} /> до НДФЛ</>}
          </span>
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
          <input className="field" inputMode="decimal" value={v.dailyGross ?? ''} onChange={e => update({ dailyGross: parseAmount(e.target.value) ?? undefined, gross: undefined, estimateUnit: undefined })} />
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

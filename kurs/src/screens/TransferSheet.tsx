import { useState } from 'react';
import { Field, Money, PrimaryButton, Sheet } from '../components/ui';
import { accountOptions, LIFE_ACCOUNT, RESERVE_ACCOUNT } from '../domain/accounts';
import { eventsBetween } from '../domain/calendar';
import { ddmm } from '../domain/dates';
import { moscowClock, paymentPreparations, type FundingMode } from '../domain/funds';
import { parseAmount } from '../domain/money';
import { uid, useStore } from '../store/store';
import { toast, useCal, useUi } from '../store/ui';
import { useLedger } from './Checkup';

type Action = NonNullable<ReturnType<typeof useUi.getState>['transfer']>;

export function TransferSheet() {
  const action = useUi(s => s.transfer);
  const close = () => useUi.getState().set({ transfer: null });
  const title = action?.kind === 'sweep' ? 'Перевести доход в резерв' : action?.kind === 'return' ? 'Вернуть остаток в резерв' : 'Подготовить платежи';
  return <Sheet open={!!action} onClose={close} title={title}>{action && <Body action={action} close={close} />}</Sheet>;
}

function Body({ action, close }: { action: Action; close: () => void }) {
  const cal = useCal();
  const led = useLedger();
  const book = useStore(s => s.accountBook);
  const marks = useStore(s => s.marks);
  const dateNow = moscowClock().date;
  const [date, setDate] = useState(dateNow);
  const [id] = useState(uid);
  const name = (id: string | undefined) => accountOptions(book).find(a => a.id === id)?.name ?? 'Счёт не назначен';
  const plan = action.kind === 'payment' ? paymentPreparations(eventsBetween(cal, action.plan.date, action.plan.date), marks,
    led.heldForPayments, led.reserve).find(group => group.id === action.plan.id) : undefined;
  const physical = plan?.accountId === LIFE_ACCOUNT ? led.card : led.cashAccounts.find(a => a.id === plan?.accountId)?.expected;
  const heldForAccount = led.heldForPayments.filter(row => row.accountId === plan?.accountId).reduce((sum, row) => sum + row.amount, 0);
  const pendingOnAccount = plan?.accountId ? led.pendingSweepToReserve[plan.accountId] ?? 0 : 0;
  const freeOnTarget = physical == null ? null : Math.max(0, physical - heldForAccount - pendingOnAccount);
  const [mode, setMode] = useState<FundingMode>(() => plan?.inTransit && !plan.toFund ? 'forward' : 'reserve');
  const maxFor = (mode: FundingMode) => {
    if (!plan?.accountId || plan.accountId === RESERVE_ACCOUNT) return 0;
    if (mode === 'forward') return plan.inTransit;
    if (mode === 'existing') return Math.min(plan.toFund ?? 0, freeOnTarget ?? 0);
    if (mode === 'allocate') return Math.min(plan.toFund ?? 0, led.pendingSweepToReserve[plan.accountId] ?? 0);
    return plan.toFund ?? 0;
  };
  const limit = action.kind === 'return' ? action.held.amount : action.kind === 'sweep' ? action.amount : maxFor(mode);
  const existingAssignment = action.kind === 'payment' && (mode === 'allocate' || mode === 'existing');
  const maxActual = action.kind === 'payment' && (mode === 'reserve' || mode === 'via') ? led.reserve : limit;
  const [amount, setAmount] = useState(String(limit).replace('.', ','));
  const value = parseAmount(amount);
  const source = action.kind === 'sweep' ? action.accountId : action.kind === 'return' ? action.held.accountId :
    mode === 'forward' ? LIFE_ACCOUNT : existingAssignment ? plan?.accountId : RESERVE_ACCOUNT;
  const target = action.kind !== 'payment' ? RESERVE_ACCOUNT : mode === 'via' ? LIFE_ACCOUNT : plan?.accountId;
  const choices: { mode: FundingMode; title: string }[] = [
    { mode: 'reserve', title: 'Прямо из резерва' },
    ...(plan?.accountId && ![LIFE_ACCOUNT, RESERVE_ACCOUNT].includes(plan.accountId) ?
      [{ mode: 'via' as const, title: 'Через основную карту' }, { mode: 'existing' as const, title: 'Выделить из остатка счёта списания' }, { mode: 'forward' as const, title: 'С основной карты дальше' }] : []),
    { mode: 'allocate', title: 'Выделить из зачисленного дохода' },
  ];
  const submit = () => {
    if (!value) return;
    const s = useStore.getState();
    const ok = action.kind === 'sweep' ? s.sweepIncome(id, action.accountId, value, date)
      : action.kind === 'return' ? s.returnEarmark(id, action.held.accountId, action.held.key, value, date)
        : plan?.accountId && s.fundPayment(id, mode, plan.events.map(e => e.key), plan.date, plan.accountId, value, date);
    if (!ok) { toast('Сумма или маршрут изменились. Сверьте остатки и выберите актуальный платёж.'); return; }
    toast(existingAssignment ? 'Деньги выделены под платёж' : 'Перевод записан');
    close();
  };
  const eventLink = (key: string) => {
    const e = plan?.events.find(row => row.key === key);
    if (e) useUi.getState().set({ transfer: null, event: e });
  };
  return <div className="space-y-4 pt-1">
    {plan && <section className="card space-y-2 p-4 text-[14px]">
      <div className="font-medium">{ddmm(plan.date)} · {name(plan.accountId)}</div>
      {plan.events.map(e => <button key={e.key} type="button" className="flex w-full justify-between gap-3 text-left text-sea"
        onClick={() => eventLink(e.key)}><span>{e.title}</span><Money value={e.amount} approx={e.approx} kopecks className="shrink-0" /></button>)}
      {plan.accountId ? <>
        <div>Уже выделено на счёте списания <Money value={plan.prepared} kopecks /></div>
        {physical != null && plan.accountId !== RESERVE_ACCOUNT && <div>Физический остаток на счёте <Money value={physical} kopecks /></div>}
        {freeOnTarget != null && plan.accountId !== LIFE_ACCOUNT && plan.accountId !== RESERVE_ACCOUNT &&
          <div>Остаток без назначения <Money value={freeOnTarget} kopecks /></div>}
        {plan.inTransit > 0 && <div>На промежуточной карте <Money value={plan.inTransit} kopecks /></div>}
        {plan.accountId === RESERVE_ACCOUNT ? <div>Платёж идёт напрямую из резерва.</div>
          : <div>Довнести из резерва <Money value={plan.toFund ?? 0} kopecks /></div>}
        {plan.reserveShortfall > 0 && <div className="text-warn">Не хватает <Money value={plan.reserveShortfall} kopecks /> в резерве</div>}
      </> : <p className="text-warn">Уточните счёт списания в банке. Нажмите на платёж, чтобы назначить его.</p>}
    </section>}
    {action.kind === 'payment' && !plan && <p>Группа изменилась. Откройте актуальный платёж в календаре.</p>}
    {action.kind === 'payment' && plan?.accountId && plan.accountId !== RESERVE_ACCOUNT && (plan.toFund || plan.inTransit) ? <Field label="Фактический маршрут">
      <select className="field" value={mode} onChange={e => { const next = e.target.value as FundingMode; setMode(next); setAmount(String(maxFor(next))); }}>
        {choices.map(item => <option key={item.mode} value={item.mode}>{item.title}</option>)}
      </select>
    </Field> : null}
    {limit > 0 && <section className="card space-y-3 p-4">
      <p className="text-[14px] font-medium">{existingAssignment ? `${name(target)} · выделение без перевода` : `${name(source)} → ${name(target)}`}</p>
      {mode === 'via' && <p className="text-[13px] text-muted">После зачисления подтвердите отдельно перевод с основной карты на счёт списания.</p>}
      {!existingAssignment && <p className="text-[13px] text-muted">Сначала выполните операцию в банке, затем запишите фактический перевод.</p>}
      <Field label={existingAssignment ? 'Сумма назначения' : 'Фактическая сумма'}>
        <input className="field" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
      </Field>
      <Field label={existingAssignment ? 'Дата назначения' : 'Фактическая дата перевода'}>
        <input className="field" type="date" value={date} max={dateNow} onChange={e => setDate(e.target.value)} />
      </Field>
      {value != null && value > limit && maxActual > limit && <p className="text-[13px] text-warn">Излишек останется под платежом до подтверждённого возврата в резерв.</p>}
      <PrimaryButton onClick={submit} disabled={!value || value <= 0 || value > maxActual || !date || date > dateNow}>
        {existingAssignment ? 'Выделить под платёж' : 'Я перевёл'}
      </PrimaryButton>
    </section>}
  </div>;
}

import { useState } from 'react';
import { AccountablePayments, paymentRouteKey, possibleSubscriptionDuplicate } from '../domain/paymentRoutes';
import { accountOptions, RESERVE_ACCOUNT } from '../domain/accounts';
import { eventsBetween } from '../domain/calendar';
import { addDays, ddmm, dayIn, monthKey } from '../domain/dates';
import { fundingBalanceKnown } from '../domain/ledger';
import { paymentPreparations } from '../domain/funds';
import { Field, Money, PrimaryButton, SecondaryButton, Segmented, Sheet } from '../components/ui';
import { uid, useStore } from '../store/store';
import { toast, useCal, useMoscowClock, useUi } from '../store/ui';
import { useLedger } from './Checkup';

export function PaymentQueueSheet() {
  const open = useUi(s => s.paymentQueue);
  const set = useUi(s => s.set);
  return <Sheet open={open} title="Все платежи" onClose={() => set({ paymentQueue: false })}>
    {open && <Queue />}
  </Sheet>;
}

function Queue() {
  const { date: now } = useMoscowClock();
  const [range, setRange] = useState<'today' | 'week' | 'month'>('week');
  const cal = useCal();
  const led = useLedger();
  const expenses = useStore(s => s.expenses);
  const book = useStore(s => s.accountBook);
  const set = useUi(s => s.set);
  const end = range === 'today' ? now : range === 'week' ? addDays(now, 6) : dayIn(monthKey(now), 'last');
  const events = eventsBetween(cal, now, end).filter(e => e.kind === 'payment' && !e.projection);
  const marks = cal.marks ?? {};
  const open = paymentPreparations(events, marks, led.heldForPayments, led.reserve);
  const close = events.filter(e => marks[e.key]?.done);
  const names = accountOptions(book);
  const available = (id: string) => fundingBalanceKnown(led, id) && led.reserveVerified;
  return <div className="space-y-3">
    <Segmented value={range} onChange={setRange} options={[{ id: 'today', label: 'Сегодня' }, { id: 'week', label: '7 дней' }, { id: 'month', label: 'Месяц' }]} />
    <SecondaryButton className="w-full" onClick={() => set({ paymentQueue: false, paymentRoutes: true })}>Счета списания</SecondaryButton>
    {open.map(plan => <section key={plan.id} className="card space-y-2 p-3">
      <p className="font-medium">{ddmm(plan.date)} · {names.find(a => a.id === plan.accountId)?.name ?? 'Уточните счёт списания'}</p>
      {plan.events.map(e => {
        const duplicate = possibleSubscriptionDuplicate(e, expenses);
        return <div key={e.key}>
          <button className="flex min-h-11 w-full items-center justify-between gap-2 text-left" type="button" onClick={() => set({ paymentQueue: false, event: e })}>
            <span className="min-w-0">{e.title}</span><Money value={e.amount} approx={e.approx} kopecks className="shrink-0" />
          </button>
          {!!e.possibleExtra && <p className="text-[13px] text-muted">До сверки графика до <Money value={e.amount + e.possibleExtra} kopecks /></p>}
          {duplicate && <p className="text-[13px] text-warn">Похожий расход {ddmm(duplicate.date)} на <Money value={duplicate.amount} kopecks />. Сверьте подписку.</p>}
        </div>;
      })}
      <p className="text-[13px] text-muted">Подготовить {ddmm(plan.remindDate)} · списание {ddmm(plan.date)}</p>
      {plan.accountId && available(plan.accountId) ? <p className="text-[13px]">
        Выделено <Money value={plan.prepared} kopecks />
        {plan.accountId !== RESERVE_ACCOUNT && <> · из резерва <Money value={plan.toFund ?? 0} kopecks /></>}
        {!!plan.inTransit && <> · в пути <Money value={plan.inTransit} kopecks /></>}
      </p> : <p className="text-[13px] text-muted">{plan.accountId ? 'Сначала сверьте остаток счёта' : 'Назначьте счёт для расчёта перевода'}</p>}
      {plan.reserveShortfall > 0 && <p className="text-[13px] text-warn">Не хватает <Money value={plan.reserveShortfall} kopecks /> в резерве</p>}
      <SecondaryButton className="w-full" onClick={() => !plan.accountId
        ? set({ paymentQueue: false, paymentRoutes: true })
        : set({ paymentQueue: false, transfer: { kind: 'payment', plan } })}>
        {plan.accountId ? 'Открыть подготовку' : 'Назначить счёт'}
      </SecondaryButton>
    </section>)}
    {close.map(e => <button className="card flex min-h-11 w-full items-center justify-between gap-2 p-3 text-left" key={e.key} type="button"
      onClick={() => set({ paymentQueue: false, event: e })}>
      <span>{ddmm(e.date)} · {e.title}<span className="block text-[12px] text-pos">Списано</span></span>
      <Money value={marks[e.key].amount ?? e.amount} kopecks />
    </button>)}
    {!events.length && <p className="px-2 text-muted">На этот период обязательств нет.</p>}
  </div>;
}

export function PaymentRoutesSheet() {
  const open = useUi(s => s.paymentRoutes);
  const set = useUi(s => s.set);
  return <Sheet open={open} title="Счета списания" onClose={() => set({ paymentRoutes: false })}>
    {open && <Routes />}
  </Sheet>;
}

function Routes() {
  const { date: now } = useMoscowClock();
  const cal = useCal();
  const book = useStore(s => s.accountBook);
  const routes = AccountablePayments(cal, now);
  const names = accountOptions(book);
  const [newAccount, setNewAccount] = useState('');
  const select = (key: string, accountId: string) => {
    useStore.getState().setPaymentAccount(key, accountId);
    toast(accountId ? 'Счёт списания сохранён' : 'Назначение удалено');
  };
  return <div className="space-y-3">
    <p className="text-[13px] text-muted">Укажите счёт, который использует банк. Назначение действует на следующие платежи по этому обязательству.</p>
    <div className="card divide-y divide-line px-3">
      {routes.map(event => {
        const key = paymentRouteKey(event);
        const chosen = book.paymentAccounts[key] ?? event.accountId ?? '';
        return <label key={key} className="block space-y-1 py-3">
          <span className="block font-medium">{cal.debts.find(debt => debt.id === key)?.short ?? event.title}</span>
          <span className="block text-[12px] text-muted">{ddmm(event.date)} · <Money value={event.amount} approx={event.approx} kopecks /></span>
          <select aria-label={`Счёт списания · ${event.title}`} className="field min-h-11" value={chosen} onChange={e => select(key, e.target.value)}>
            <option value="">Уточнить в банке</option>
            {names.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>;
      })}
    </div>
    <div className="card space-y-2 p-3">
      <Field label="Другой банковский счёт">
        <input value={newAccount} onChange={e => setNewAccount(e.target.value)} className="field" placeholder="Название счёта" />
      </Field>
      <PrimaryButton disabled={!newAccount.trim()} onClick={() => {
        useStore.getState().saveCashAccount(uid(), newAccount);
        setNewAccount(''); toast('Счёт добавлен. Сверьте остаток в разделе счетов.');
      }}>Добавить счёт</PrimaryButton>
    </div>
  </div>;
}

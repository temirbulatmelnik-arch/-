import { useState } from 'react';
import { possibleSubscriptionDuplicate } from '../domain/paymentRoutes';
import { accountOptions, RESERVE_ACCOUNT, reversibleOperation } from '../domain/accounts';
import { eventsBetween } from '../domain/calendar';
import { addDays, ddmm, dayIn, monthKey } from '../domain/dates';
import { fundingBalanceKnown } from '../domain/ledger';
import { paymentPreparations } from '../domain/funds';
import { Money, SecondaryButton, Segmented, Sheet } from '../components/ui';
import { useStore } from '../store/store';
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
  const journal = book.operations.filter(op => reversibleOperation(op) && op.status !== 'planned' && op.origin !== 'bank').slice().reverse();
  const available = (id: string) => fundingBalanceKnown(led, id) && led.reserveVerified;
  return <div className="space-y-3">
    <Segmented value={range} onChange={setRange} options={[{ id: 'today', label: 'Сегодня' }, { id: 'week', label: '7 дней' }, { id: 'month', label: 'Месяц' }]} />
    <p className="px-2 text-[13px] text-muted">Все обязательные платежи списываются с карты жизни.</p>
    {open.map(plan => <section key={plan.id} className="card space-y-2 p-3">
      <p className="font-medium">{ddmm(plan.date)} · {names.find(a => a.id === plan.accountId)?.name ?? 'Карта жизни'}</p>
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
      </p> : <p className="text-[13px] text-muted">Сначала сверьте остатки карты и резерва.</p>}
      {plan.reserveShortfall > 0 && <p className="text-[13px] text-warn">Не хватает <Money value={plan.reserveShortfall} kopecks /> в резерве</p>}
      {plan.toFund ? <SecondaryButton className="w-full" onClick={() =>
        set({ paymentQueue: false, transfer: { kind: 'payment', plan } })}>Открыть подготовку</SecondaryButton> : null}
    </section>)}
    {close.map(e => <button className="card flex min-h-11 w-full items-center justify-between gap-2 p-3 text-left" key={e.key} type="button"
      onClick={() => set({ paymentQueue: false, event: e })}>
      <span>{ddmm(e.date)} · {e.title}<span className="block text-[12px] text-pos">Списано</span></span>
      <Money value={marks[e.key].amount ?? e.amount} kopecks />
    </button>)}
    {journal.length > 0 && <details className="card p-3">
      <summary className="min-h-9 cursor-pointer font-medium">Журнал переводов и списаний</summary>
      <div className="divide-y divide-line">
        {journal.map(op => {
          const label = op.type === 'allocation' ? (op.toWeekly ? 'Оставлено на неделю' : 'Выделено под платёж')
            : op.type === 'transfer' && op.purpose === 'sweep' ? 'Перевод в резерв'
              : op.type === 'transfer' && op.purpose === 'return' ? 'Возврат в резерв'
                : op.type === 'transfer' && op.purpose === 'weekly' ? 'Пополнение недели'
                  : op.type === 'transfer' ? 'Перевод под платёж' : 'Списание платежа';
          return <div key={op.id} className="py-2 text-[13px]">
            <div className="flex justify-between gap-2"><span>{ddmm(op.date)} · {label}</span><Money value={op.amount} kopecks /></div>
            {op.status === 'voided' ? <span className="text-muted">Подтверждение отменено</span> :
              <button type="button" className="min-h-11 text-sea" onClick={() => {
                if (!window.confirm('Отменить ошибочное подтверждение в «Курсе»? Банковское движение при этом не изменится.')) return;
                const ok = useStore.getState().voidOperation(op.id);
                toast(ok ? 'Подтверждение отменено' : 'Операция уже вошла в банковскую сверку или связана с последующим движением.');
              }}>Исправить подтверждение</button>}
          </div>;
        })}
      </div>
    </details>}
    {!events.length && <p className="px-2 text-muted">На этот период обязательств нет.</p>}
  </div>;
}

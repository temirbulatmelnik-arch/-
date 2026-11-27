import { useState } from 'react';
import { bankProvenEvents, needsPaymentReview } from '../domain/financialView';
import { possibleSubscriptionDuplicate } from '../domain/paymentRoutes';
import { accountOptions, RESERVE_ACCOUNT, reversibleOperation } from '../domain/accounts';
import { eventsBetween } from '../domain/calendar';
import { addDays, ddmm, dayIn } from '../domain/dates';
import { fundingBalanceKnown } from '../domain/ledger';
import { paymentPreparations } from '../domain/funds';
import { Money, SecondaryButton, Sheet } from '../components/ui';
import { useStore } from '../store/store';
import { toast, useCal, useMoscowClock, useUi } from '../store/ui';
import { useLedger } from './Checkup';

export function PaymentQueueSheet() {
  const open = useUi(s => s.paymentQueue);
  const set = useUi(s => s.set);
  const reviewDate = useUi(s => s.paymentReviewDate);
  return <Sheet open={open} title="Все платежи" onClose={() => set({ paymentQueue: false, paymentReviewDate: undefined })}>
    {open && <Queue reviewDate={reviewDate} />}
  </Sheet>;
}

function Queue({ reviewDate }: { reviewDate?: string }) {
  const { date: now } = useMoscowClock();
  const [showHistory, setShowHistory] = useState(!!reviewDate);
  const cal = useCal();
  const led = useLedger();
  const expenses = useStore(s => s.expenses);
  const book = useStore(s => s.accountBook);
  const set = useUi(s => s.set);
  const end = addDays(now, 45);
  const events = eventsBetween(cal, addDays(now, -60), end);
  const marks = cal.marks ?? {};
  const plans = paymentPreparations(events.filter(e => e.date >= now), marks, led.heldForPayments, led.reserve);
  const review = (reviewDate ? eventsBetween(cal, reviewDate + '-01', dayIn(reviewDate, 'last')) : events)
    .filter(e => needsPaymentReview(e, marks[e.key], now));
  const paid = events.filter(e => e.kind === 'payment' && marks[e.key]?.done).reverse();
  const proven = bankProvenEvents(book.operations);
  const names = accountOptions(book);
  const journal = book.operations.filter(op => reversibleOperation(op) && !op.legacy && op.status !== 'planned' && op.origin !== 'bank').slice().reverse();
  const available = (id?: string) => !!id && fundingBalanceKnown(led, id) && led.reserveVerified;
  const detail = (event: typeof events[number]) => set({ paymentQueue: false, paymentReviewDate: undefined, event });
  const nextWeek = addDays(now, 6);
  const sections = [
    { title: 'Сегодня', plans: plans.filter(plan => plan.date === now) },
    { title: 'Ближайшие 7 дней', plans: plans.filter(plan => plan.date > now && plan.date <= nextWeek) },
    { title: 'Позднее', plans: plans.filter(plan => plan.date > nextWeek) },
  ];
  return <div className="space-y-3">
    {plans.some(plan => !available(plan.accountId)) && <p className="rounded-xl bg-warn/12 p-3 text-[13px] text-warn">Для части платежей нужна сверка остатков или счёта списания.</p>}
    {review.length > 0 && <details className="card px-3" open={showHistory} onToggle={e => setShowHistory(e.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer py-2 font-medium text-warn">Требуется сверка · {review.length}</summary>
      <p className="pb-2 text-xs text-muted">Сверьте со списаниями в банке. Здесь видны прошедшие сроки и спорные платежи.</p>
      {review.map(e => <button type="button" key={e.key} className="flex min-h-11 w-full justify-between gap-2 border-t border-line py-2 text-left text-sm" onClick={() => detail(e)}>
        <span>{ddmm(e.date)} · {e.title}</span><Money value={e.amount} kopecks />
      </button>)}
    </details>}
    {sections.filter(section => section.plans.length).map(section => <section key={section.title}>
      <h3 className="mb-1 px-1 text-sm font-semibold">{section.title}</h3>
      <div className="card divide-y divide-line px-3">
        {section.plans.map(plan => <details key={plan.id} className="py-1">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 break-words">{ddmm(plan.date)} · {plan.events.length === 1 ? plan.events[0].title : 'Платежи (' + plan.events.length + ')'}
              <small className="block text-muted">{plan.prepared >= plan.total ? 'Подготовлено' : plan.toFund ? 'Нужно подготовить' : 'Проверьте счёт'}</small>
            </span><Money value={plan.total} approx={plan.events.some(event => event.approx)} kopecks />
          </summary>
          <p className="pb-1 text-xs text-muted">{names.find(a => a.id === plan.accountId)?.name ?? 'Счёт уточняется'} · подготовить {ddmm(plan.remindDate)} · списание {ddmm(plan.date)}</p>
          {plan.events.map(e => {
            const duplicate = possibleSubscriptionDuplicate(e, expenses);
            return <div key={e.key} className="border-t border-line">
              <button className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm" type="button" onClick={() => detail(e)}>
                <span>{plan.events.length === 1 ? 'Детали и списание' : e.title}</span><Money value={e.amount} approx={e.approx} kopecks />
              </button>
              {!!e.possibleExtra && <p className="pb-2 text-xs text-muted">Возможна доплата до общей суммы <Money value={e.amount + e.possibleExtra} kopecks /></p>}
              {duplicate && <p className="pb-2 text-xs text-warn">Похожая трата {ddmm(duplicate.date)}. Проверьте подписку.</p>}
            </div>;
          })}
          {available(plan.accountId) && <p className="pb-2 text-xs text-muted">Выделено <Money value={plan.prepared} kopecks />
            {plan.accountId !== RESERVE_ACCOUNT && <> · из резерва <Money value={plan.toFund ?? 0} kopecks /></>}
            {!!plan.inTransit && <> · в пути <Money value={plan.inTransit} kopecks /></>}</p>}
          {plan.reserveShortfall > 0 && <p className="pb-2 text-xs text-warn">В резерве не хватает <Money value={plan.reserveShortfall} kopecks /></p>}
          {!!plan.toFund && <SecondaryButton className="mb-1 w-full" onClick={() => set({
            paymentQueue: false, paymentReviewDate: undefined, transfer: { kind: 'payment', plan },
          })}>Открыть подготовку</SecondaryButton>}
        </details>)}
      </div>
    </section>)}
    {!!paid.length && <details className="card px-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm text-muted">Записанные списания · {paid.length}</summary>
      {paid.map(e => <button className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-line py-2 text-left text-sm" key={e.key} type="button" onClick={() => detail(e)}>
        <span>{ddmm(marks[e.key].paidDate ?? e.date)} · {e.title}
          <small className="block text-muted">{proven.has(e.key) ? 'Сверено по банку' : 'Записано вручную'}</small>
        </span><Money value={marks[e.key].amount ?? e.amount} kopecks />
      </button>)}
    </details>}
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
    {!plans.length && !review.length && !paid.length && <p className="px-2 text-muted">На этот период обязательств нет.</p>}
  </div>;
}

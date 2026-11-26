import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, CircleCheck, CircleHelp, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import { cents, rubles } from '../domain/accounts';
import type { positionBeforeIncome } from '../domain/coverage';
import { dayMonth } from '../domain/dates';
import type { PaymentPreparation } from '../domain/funds';
import type { Ledger } from '../domain/ledger';
import { Money } from './ui';
import './TodayOverview.css';

type Horizon = ReturnType<typeof positionBeforeIncome>;
type Cash = Pick<Ledger, 'card' | 'reserve' | 'reserveVerified' | 'cashAccounts' | 'totalCash'>;

const shortMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' });

function DateTile({ date, tone }: { date?: string; tone: 'bill' | 'income' }) {
  if (!date) return <span className="today-date" data-tone={tone} aria-hidden="true"><ArrowUpRight size={20} /></span>;
  return <time className="today-date" data-tone={tone} dateTime={date} aria-label={dayMonth(date)}>
    <span className="today-date-day" aria-hidden="true">{Number(date.slice(8))}</span>
    <span className="today-date-month" aria-hidden="true">{shortMonth.format(new Date(date + 'T12:00:00Z')).replace('.', '')}</span>
  </time>;
}

function Funds({ cash, onAccounts, onCard, onReserve }: { cash: Cash; onAccounts: () => void; onCard: () => void; onReserve: () => void }) {
  const extras = cash.cashAccounts;
  const other = extras.some(item => item.expected == null) ? null : rubles(extras.reduce((sum, item) => sum + cents(item.expected!), 0));
  const parts = [
    { key: 'card', label: 'На карте жизни', value: cash.card, approx: false, action: onCard },
    { key: 'reserve', label: 'В резерве', value: cash.reserve, approx: !cash.reserveVerified, action: onReserve },
    ...(extras.length ? [{ key: 'other', label: 'На других счетах', value: other, approx: false, action: onAccounts }] : []),
  ];
  const total = cash.totalCash == null ? null : cents(cash.totalCash);
  const showBreakdown = total != null && total > 0 && parts.every(part => part.value != null && part.value >= 0);

  return <section className="today-cash" aria-label="Свои деньги">
    <div className="today-cash-main">
      <div className="min-w-0">
        <h2 className="today-cash-label"><WalletCards size={17} strokeWidth={1.8} aria-hidden="true" /> Свои деньги</h2>
        {cash.totalCash == null ? <p className="today-cash-unknown">Уточните остатки</p> :
          <p className="today-cash-total figure"><Money value={cash.totalCash} approx={!cash.reserveVerified} kopecks /></p>}
      </div>
      <button type="button" className="today-action today-cash-link" onClick={onAccounts}>
        Счета <ArrowUpRight size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
    {showBreakdown && <div className="today-cash-breakdown" aria-hidden="true">
      {parts.filter(part => part.value! > 0).map(part => <span key={part.key} data-part={part.key}
        style={{ flexGrow: cents(part.value!) }} />)}
    </div>}
    <div className="today-cash-parts">
      {parts.map(part => <button type="button" key={part.key} className="today-action today-cash-part" onClick={part.action}>
        <span className="today-cash-part-label"><i data-part={part.key} aria-hidden="true" />{part.label}</span>
        {part.value == null ? <span className="today-cash-part-value">Сверить</span> :
          <Money className="today-cash-part-value" value={part.value} approx={part.approx} kopecks />}
      </button>)}
    </div>
  </section>;
}

function forecastStatus(horizon: Horizon): { kind: 'warn' | 'ok'; label: ReactNode; detail?: string } {
  if (horizon.shortage) return { kind: 'warn', label: <>Не хватает <Money value={horizon.shortage.amount} kopecks /></>,
    detail: dayMonth(horizon.shortage.date) + ' · ' + horizon.shortage.title };
  if (horizon.accountRisk?.reason === 'insufficient') return { kind: 'warn',
    label: horizon.accountRisk.amount == null ? 'Проверьте деньги на счёте' : <>На счёте не хватает <Money value={horizon.accountRisk.amount} kopecks /></>,
    detail: horizon.accountRisk.title };
  if (horizon.accountRisk?.reason === 'unassigned') return { kind: 'warn', label: 'Уточните счёт оплаты', detail: horizon.accountRisk.title };
  if (horizon.accountRisk?.reason === 'unverified') return { kind: 'warn', label: 'Сверьте остаток на счёте', detail: horizon.accountRisk.title };
  if (horizon.available == null) return { kind: 'warn', label: 'Сверьте карту и резерв' };
  return { kind: 'ok', label: 'По плану хватит' };
}

export function TodayOverview({ cash, payment, horizon, onAccounts, onCard, onReserve, onPayment, onForecast }: {
  cash: Cash;
  payment?: PaymentPreparation;
  horizon: Horizon;
  onAccounts: () => void;
  onCard: () => void;
  onReserve: () => void;
  onPayment: () => void;
  onForecast: () => void;
}) {
  const status = forecastStatus(horizon);
  const StatusIcon = status.kind === 'ok' ? CircleCheck : CircleHelp;
  return <div className="today-overview">
    <Funds cash={cash} onAccounts={onAccounts} onCard={onCard} onReserve={onReserve} />
    <section className="today-flow" aria-label="Ближайшие платежи и поступления">
      <button type="button" className="today-action today-flow-item" onClick={onPayment}>
        <DateTile date={payment?.date} tone="bill" />
        <span className="today-flow-copy">
          <span className="today-flow-label">Ближайший платёж</span>
          {payment ? <>
            <span className="today-flow-title">{payment.events.length === 1 ? payment.events[0].title : `Платежи за день · ${payment.events.length}`}</span>
            <span className="today-flow-payment">
              <Money value={payment.total} approx={payment.events.some(event => event.approx)} kopecks />
              {payment.prepared >= payment.total && <span className="today-flow-ready"><CircleCheck size={13} aria-hidden="true" />Подготовлено</span>}
            </span>
          </> : <span className="today-flow-title">В ближайшие 45 дней платежей нет</span>}
        </span>
        <ChevronRight className="today-flow-arrow" size={17} strokeWidth={1.8} aria-hidden="true" />
      </button>

      <button type="button" className="today-action today-flow-item" onClick={onForecast}>
        <DateTile date={horizon.until} tone="income" />
        <span className="today-flow-copy">
          <span className="today-flow-label">{horizon.income ? 'До следующего поступления' : 'Прогноз на 45 дней'}</span>
          {horizon.income && <span className="today-flow-income">
            <ArrowDownRight size={14} strokeWidth={2} aria-hidden="true" />
            <span className="min-w-0">{horizon.income.title}</span>
            <Money value={horizon.income.amount} approx={horizon.income.approx} kopecks />
          </span>}
          <span className="today-flow-status" data-status={status.kind}>
            <StatusIcon size={15} strokeWidth={1.8} aria-hidden="true" /><span>{status.label}</span>
          </span>
          {status.detail && <span className="today-flow-detail">{status.detail}</span>}
        </span>
        <ArrowRight className="today-flow-arrow" size={17} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </section>
  </div>;
}

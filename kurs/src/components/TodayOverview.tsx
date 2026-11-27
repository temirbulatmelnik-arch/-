import { ArrowDownLeft, CalendarClock, CircleCheck, ShieldCheck, TriangleAlert, WalletCards, Waves } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { cents, rubles } from '../domain/accounts';
import { dayMonth } from '../domain/dates';
import type { Coverage, Scenario, positionBeforeIncome } from '../domain/coverage';
import { SCENARIO_LABEL } from '../domain/financialView';
import type { PaymentPreparation } from '../domain/funds';
import type { Ledger } from '../domain/ledger';
import { useUi } from '../store/ui';
import { ActionArrow, Glyph, IconLabel, Jump } from '../preview/Visuals';
import { Money } from './ui';
import '../preview/neva-flow.css';

type Horizon = ReturnType<typeof positionBeforeIncome>;
type Cash = Pick<Ledger, 'cardFrom' | 'lifeAvailable' | 'heldOnCard' | 'reserve' | 'reserveVerified' | 'cashAccounts' | 'totalCash'>;

export function TodayOverview({ cash, reserveDate, payment, horizon, cov, scenario, provisional, children, onAccounts, onCard, onReserve, onPayment, onForecast }: {
  cash: Cash; reserveDate?: string; payment?: PaymentPreparation; horizon: Horizon; cov: Coverage; scenario: Scenario; provisional: boolean;
  children?: ReactNode; onAccounts: () => void; onCard: () => void; onReserve: () => void; onPayment: () => void; onForecast: () => void;
}) {
  const set = useUi(s => s.set);
  const funded = payment ? payment.prepared >= payment.total : false;
  const shortage = horizon.shortage ?? cov.shortage;
  const accountRisk = horizon.accountRisk ?? cov.accountRisk;
  const flagged = provisional || shortage || accountRisk || cov.bufferRisk;
  const others = cash.cashAccounts.reduce<number | null>((sum, account) =>
    sum == null || account.expected == null ? null : sum + cents(account.expected), 0);
  const parts = [
    { label: 'Свободно на карте', short: 'Свободно', value: cash.lifeAvailable, icon: WalletCards, open: onCard },
    { label: 'Под платежи', short: 'Под платежи', value: cash.heldOnCard, icon: CalendarClock, open: onAccounts },
    { label: 'Резерв', short: 'Резерв', value: cash.reserve, icon: ShieldCheck, open: onReserve },
  ];
  const amounts = [...parts.map(({ value }) => value == null ? null : cents(value)), others];
  const total = cash.totalCash == null ? null : cents(cash.totalCash);
  const showBar = !!cash.cardFrom && cash.reserveVerified && total != null && total > 0
    && amounts.every(value => value != null && value >= 0) && amounts.reduce<number>((sum, value) => sum + (value ?? 0), 0) === total;
  return <div className="nv-stack nf-flow nf-home">
    <section className="nf-panel nf-balances" aria-label="Свои деньги">
      <header className="nf-head">
        <h2><IconLabel icon={Waves}>Свои деньги</IconLabel></h2>
        <span className="nf-tag">По учёту</span>
      </header>
      <div className="nf-total">{cash.totalCash == null ? 'Нужна сверка' : <Money value={cash.totalCash} approx={!cash.reserveVerified} kopecks />}</div>
      {showBar && <div className="nf-money-bar" aria-hidden="true">
        {amounts.map((value, index) => value ? <span key={index} data-part={index} style={{ width: `${value / total * 100}%` }} /> : null)}
      </div>}
      <div className="nf-money-parts">
        {parts.map(({ label, short, value, icon, open }, index) => <button className="nf-vessel nf-press" type="button" key={label} data-part={index}
          onClick={open} aria-label={`${label}, ${value == null ? 'нужна сверка' : value.toLocaleString('ru-RU') + ' ₽'}`}>
          <Glyph icon={icon} size={18} />
          <span>{short}</span>
          <strong>{value == null ? 'Сверить' : <Money value={value} approx={index === 2 && !cash.reserveVerified} kopecks />}</strong>
        </button>)}
      </div>
      {cash.cashAccounts.length > 0 && <Jump icon={WalletCards} label="На других счетах" onClick={onAccounts}>
        {others == null ? 'Уточнить остатки' : <Money value={rubles(others)} kopecks />}
      </Jump>}
      {(!cash.reserveVerified || !cash.cardFrom) && <p className="nv-meta mt-2">
        {cash.cardFrom ? 'Карта сверена ' + dayMonth(cash.cardFrom.date) : 'Карта ждёт сверки'}
        {' · '}{cash.reserveVerified && reserveDate ? 'резерв сверён ' + dayMonth(reserveDate) : 'резерв по учёту'}
      </p>}
    </section>
    <div className="nv-flow-grid">
      <button type="button" className="nv-flow nf-panel nf-press" data-tone="amber" onClick={onPayment}>
        <Glyph icon={CalendarClock} tone="amber" />
        <span className="nv-meta">{payment ? dayMonth(payment.date) : 'Нет ближайших'}</span>
        <strong>{payment ? <Money value={payment.total} approx={payment.events.some(form => form.approx)} kopecks /> : 'Платежи'}</strong>
        <span className="nv-flow-title">{payment?.events.length === 1 ? payment.events[0].title : 'Обязательные платежи'}</span>
        {payment && payment.total > 0 && <div className="nv-funding" role="meter" aria-label="Подготовлено к платежу" aria-valuemin={0} aria-valuemax={payment.total} aria-valuenow={payment.prepared}>
          <span style={{ '--fill': `${Math.min(100, 100 * payment.prepared / payment.total)}%` } as CSSProperties} />
        </div>}
        {payment && <small>{funded ? 'Подготовлено' : payment.toFund == null ? 'Проверить счёт' : <>Подготовить <Money value={payment.toFund} kopecks /></>}</small>}
      </button>
      <button type="button" className="nv-flow nf-panel nf-press" data-tone="aqua" onClick={() => set({ workSheet: true })}>
        <Glyph icon={ArrowDownLeft} />
        <span className="nv-meta">{horizon.income ? dayMonth(horizon.income.date) : 'Нет ближайших'}</span>
        <strong>{horizon.income ? <Money value={horizon.income.amount} approx={horizon.income.approx} kopecks /> : 'Доходы'}</strong>
        <span className="nv-flow-title">{horizon.income?.title ?? 'Нет поступлений в ближайшие 45 дней'}</span>
        <span className="nv-flow-go">К выплатам <ActionArrow /></span>
      </button>
    </div>
    <button className="nf-panel nf-risk-link nf-press" data-risk={flagged ? 'true' : undefined} type="button" onClick={onForecast}>
      <Glyph icon={flagged ? TriangleAlert : CircleCheck} size={21} />
      <span>
        <strong>{provisional ? 'Сверить доступные деньги' : shortage ? 'Первый кассовый разрыв' : accountRisk ? 'Проверить счёт списания' :
          cov.bufferRisk ? 'Резерв ниже запаса' : horizon.until ? `Денег хватает до ${dayMonth(horizon.until)}` : 'Проверить прогноз резерва'}</strong>
        <small>{shortage && !provisional
          ? <>{dayMonth(shortage.date)} · {shortage.title} · <Money value={-shortage.amount} kopecks /></>
          : accountRisk && !provisional ? `${dayMonth(accountRisk.date)} · ${accountRisk.title}`
          : `Прогноз резерва · ${SCENARIO_LABEL[scenario].toLocaleLowerCase('ru')}`}</small>
      </span>
      <ActionArrow />
    </button>
    {children}
  </div>;
}

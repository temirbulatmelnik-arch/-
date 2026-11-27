import { ArrowDownLeft, CalendarClock, CircleCheck, Radar, TriangleAlert, WalletCards } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { cents, rubles } from '../domain/accounts';
import { dayMonth } from '../domain/dates';
import type { Coverage, Scenario, positionBeforeIncome } from '../domain/coverage';
import { SCENARIO_LABEL } from '../domain/financialView';
import type { PaymentPreparation } from '../domain/funds';
import type { Ledger } from '../domain/ledger';
import { useUi } from '../store/ui';
import { ActionArrow, Glyph, IconLabel, Jump, Vessels } from '../preview/Visuals';
import { Money } from './ui';

type Horizon = ReturnType<typeof positionBeforeIncome>;
type Cash = Pick<Ledger, 'cardFrom' | 'lifeAvailable' | 'heldOnCard' | 'reserve' | 'reserveVerified' | 'cashAccounts' | 'totalCash'>;

export function TodayOverview({ cash, reserveDate, payment, horizon, cov, scenario, provisional, children, onAccounts, onCard, onReserve, onPayment, onForecast }: {
  cash: Cash; reserveDate?: string; payment?: PaymentPreparation; horizon: Horizon; cov: Coverage; scenario: Scenario; provisional: boolean;
  children?: ReactNode; onAccounts: () => void; onCard: () => void; onReserve: () => void; onPayment: () => void; onForecast: () => void;
}) {
  const set = useUi(s => s.set);
  const funded = payment ? payment.prepared >= payment.total : false;
  const shortage = horizon.shortage ?? cov.shortage;
  const flagged = provisional || shortage || horizon.accountRisk;
  const others = cash.cashAccounts.reduce<number | null>((sum, account) =>
    sum == null || account.expected == null ? null : sum + cents(account.expected), 0);
  return <div className="nv-stack">
    <Vessels total={cash.totalCash} parts={[cash.lifeAvailable, cash.heldOnCard, cash.reserve]}
      reserveVerified={cash.reserveVerified} open={[onCard, onAccounts, onReserve]}>
      {cash.cashAccounts.length > 0 && <Jump icon={WalletCards} label="На других счетах" onClick={onAccounts}>
        {others == null ? 'Уточнить остатки' : <Money value={rubles(others)} kopecks />}
      </Jump>}
      {(!cash.reserveVerified || !cash.cardFrom) && <p className="nv-meta mt-2">
        {cash.cardFrom ? 'Карта сверена ' + dayMonth(cash.cardFrom.date) : 'Карта ждёт сверки'}
        {' · '}{cash.reserveVerified && reserveDate ? 'резерв сверён ' + dayMonth(reserveDate) : 'резерв по учёту'}
      </p>}
    </Vessels>
    <div className="nv-flow-grid">
      <button type="button" className="nv-flow nv-glass nv-press" data-tone="amber" onClick={onPayment}>
        <Glyph icon={CalendarClock} tone="amber" />
        <span className="nv-meta">{payment ? dayMonth(payment.date) : 'Нет ближайших'}</span>
        <strong>{payment ? <Money value={payment.total} approx={payment.events.some(form => form.approx)} kopecks /> : 'Платежи'}</strong>
        <span className="nv-flow-title">{payment?.events.length === 1 ? payment.events[0].title : 'Обязательные платежи'}</span>
        {payment && <div className="nv-funding" role="meter" aria-label="Подготовлено к платежу" aria-valuemin={0} aria-valuemax={payment.total} aria-valuenow={payment.prepared}>
          <span style={{ '--fill': `${Math.min(100, 100 * payment.prepared / payment.total)}%` } as CSSProperties} />
        </div>}
        {payment && <small>{funded ? 'Подготовлено' : payment.toFund == null ? 'Проверить счёт' : <>Подготовить <Money value={payment.toFund} kopecks /></>}</small>}
      </button>
      <button type="button" className="nv-flow nv-glass nv-press" data-tone="aqua" onClick={() => set({ workSheet: true })}>
        <Glyph icon={ArrowDownLeft} />
        <span className="nv-meta">{horizon.until ? dayMonth(horizon.until) : 'Ожидается'}</span>
        <strong>{horizon.income ? <Money value={horizon.income.amount} approx={horizon.income.approx} kopecks /> : 'Доходы'}</strong>
        <span className="nv-flow-title">{horizon.income?.title ?? 'Календарь выплат'}</span>
        <span className="nv-flow-go">К выплатам <ActionArrow /></span>
      </button>
    </div>
    <div className="nv-glass nv-glance">
      <Jump icon={flagged ? TriangleAlert : CircleCheck} label={provisional ? 'Сверить доступные деньги' : horizon.shortage ? 'Разрыв до ближайшей выплаты' : horizon.accountRisk ? 'Уточнить счёт списания' : cov.shortage ? 'В прогнозе есть кассовый разрыв' : `По прогнозу хватает до ${dayMonth(horizon.until)}`}
        tone={flagged ? 'amber' : 'aqua'} onClick={onForecast}>
        <IconLabel icon={Radar}>{shortage && !provisional
          ? <>{SCENARIO_LABEL[horizon.shortage ? 'cautious' : scenario]} · {dayMonth(shortage.date)} · <Money value={shortage.amount} kopecks /></>
          : 'Прогноз резерва'}</IconLabel>
      </Jump>
    </div>
    {children}
  </div>;
}

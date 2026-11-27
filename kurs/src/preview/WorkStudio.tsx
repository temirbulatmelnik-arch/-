import { ArrowDownLeft, Banknote, CalendarDays, CalendarHeart, FileText, Gift, ReceiptText, Settings2, Wallet, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { eventsBetween, cashIncomeEvent, incomeStatus, INCOME_STATUS_LABEL } from '../domain/calendar';
import { workPayments } from '../domain/payroll';
import type { CalEvent } from '../domain/types';
import { addDays, dayMonth, daysBetween } from '../domain/dates';
import { useCal, useToday, useUi } from '../store/ui';
import { Money, Sheet } from '../components/ui';
import { WorkSheet } from '../screens/WorkSheet';
import { Glyph, IconLabel, Jump } from './Visuals';

const payIcon = (ev: CalEvent): LucideIcon => ev.incomeKind === 'vacation' ? CalendarHeart : ev.incomeKind?.startsWith('bonus') ? Gift : ev.incomeKind === 'advance' ? Wallet : Banknote;

export function WorkStudio() {
  const [original, setOriginal] = useState(false);
  if (original) return <WorkSheet />;
  return <Studio onParameters={() => setOriginal(true)} />;
}

function Studio({ onParameters }: { onParameters: () => void }) {
  const today = useToday();
  const cal = useCal();
  const set = useUi(s => s.set);
  const [tab, setTab] = useState<'payments' | 'leave'>('payments');
  const [picked, pick] = useState<string | null>(null);
  const [tryDate, setTryDate] = useState<string | null>(null);
  const events = useMemo(() => eventsBetween(cal, today, addDays(today,70)).filter(cashIncomeEvent).slice(0, 8), [cal, today]);
  const active = events.find(e => e.key === picked) ?? events[0];
  const status = active && incomeStatus(active, cal.marks?.[active.key]);
  const vacation = cal.work?.vacations?.find(v => v.to >= today);
  const from = tryDate ?? vacation?.from ?? '';
  const duration = vacation ? daysBetween(vacation.from, vacation.to) + 1 : 0;
  const end = from && duration > 0 ? addDays(from,duration-1) : '';
  const leave = useMemo(() => {
    if (!cal.work || !vacation || !from || !end) return [];
    const copy = { ...cal.work, vacations: cal.work.vacations?.map(item => item.id === vacation.id ? { ...item, from, to: end, payDate: from === vacation.from ? item.payDate : undefined } : item) };
    return workPayments(copy, addDays(from,-30), end, cal.marks).filter(p => p.vacationId === vacation.id);
  }, [cal.work, cal.marks, vacation, from, end]);
  return <Sheet open title="Доходы и отпуск" onClose={() => set({ workSheet: false })}>
    <div className="nv-stack nv-studio" data-noswipe>
      <div className="nv-switch nv-work-switch" aria-label="Вид доходов">
        <button type="button" aria-pressed={tab==='payments'} onClick={() => setTab('payments')}><Banknote size={17} aria-hidden="true" /> Выплаты</button>
        <button type="button" aria-pressed={tab==='leave'} onClick={() => setTab('leave')}><CalendarHeart size={17} aria-hidden="true" /> Отпуск</button>
      </div>
      {tab==='payments' && (active ? <>
        <section className="nv-pay-hero nv-glass" aria-live="polite">
          <div className="nv-widget-head"><IconLabel icon={CalendarDays}>{dayMonth(active.date)}</IconLabel><Glyph icon={payIcon(active)} tone="iris" size={24} /></div>
          <div className="nv-amount"><Money value={active.amount} approx={active.approx} kopecks /></div>
          <div className="nv-pay-title">{active.title}</div>
          {status && <div className="nv-status"><FileText size={13} aria-hidden="true" /> {INCOME_STATUS_LABEL[status]}</div>}
          {active.payroll && <div className="nv-pay-breakdown">
            {(status==='forecast'||status==='conditional'||active.payroll.actualGrossKnown) && <span><ReceiptText size={17} aria-hidden="true" /> Начислено <strong><Money value={active.payroll.gross} kopecks /></strong></span>}
            {(status==='forecast'||status==='conditional'||active.payroll.actualTaxKnown) && <span><FileText size={17} aria-hidden="true" /> НДФЛ <strong><Money value={active.payroll.tax} kopecks /></strong></span>}
          </div>}
        </section>
        <div className="nv-widget-head"><IconLabel icon={ArrowDownLeft}>Ближайшие выплаты</IconLabel></div>
        <div className="nv-rail">
          {events.map(ev => <button type="button" key={ev.key} aria-pressed={active.key===ev.key}
            className="nv-receipt nv-glass nv-press" onClick={() => pick(ev.key)}>
            <Glyph icon={payIcon(ev)} tone={ev.incomeKind?.startsWith('bonus') ? 'amber' : 'aqua'} size={18} />
            <small>{dayMonth(ev.date)}</small><strong><Money value={ev.amount} approx={ev.approx} /></strong><span>{ev.title}</span>
          </button>)}
        </div>
      </> : <p className="nv-meta">Выплат в календаре нет</p>)}
      {tab==='leave' && (vacation ? <>
        <section className="nv-pay-hero nv-glass">
          <div className="nv-widget-head"><IconLabel icon={CalendarHeart}>{tryDate ? 'Примерка дат' : 'Ближайший отпуск'}</IconLabel><Glyph icon={CalendarHeart} tone="amber" size={24} /></div>
          <div className="nv-leave-dates"><span>{dayMonth(from)}</span><span aria-hidden="true">→</span><span>{dayMonth(end)}</span></div>
          <div className="nv-status"><CalendarDays size={14} aria-hidden="true" /> {duration} календ. дн.</div>
          <div className="nv-pay-breakdown" aria-live="polite">
            {leave.map(p => <span key={p.key}><Banknote size={16} aria-hidden="true" />{p.title}<strong><Money value={p.actualNet ?? p.net} approx={!p.bankConfirmed} kopecks /></strong></span>)}
            {!leave.length && <span><FileText size={16} aria-hidden="true" />Нет суммы для выбранных дат</span>}
          </div>
        </section>
        <label className="nv-date-input nv-glass"><Glyph icon={CalendarDays} /><span>Примерить начало<input type="date" min={today}
          aria-label="Примерить начало отпуска" value={from} onChange={e=>setTryDate(e.target.value || null)} /></span></label>
      </> : <p className="nv-meta">Отпуск пока не запланирован</p>)}
      <Jump icon={Settings2} tone="iris" label="Параметры расчёта и календарь" onClick={onParameters} />
    </div>
  </Sheet>;
}

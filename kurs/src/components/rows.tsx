// Общие строки списков: трата, событие календаря, предупреждение.
import { AlertTriangle, ArrowDownLeft, Check, ChevronRight, CreditCard, Info, PiggyBank, Receipt, Repeat, Sparkles, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { eventGroup, urgency, type EventGroup } from '../domain/calendar';
import { ddmm, relDays, weekday } from '../domain/dates';
import { CATEGORY } from '../domain/plan';
import type { Alert } from '../domain/summary';
import type { CalEvent, EventMark, Expense } from '../domain/types';
import { CatIcon, Money } from './ui';

export function ExpenseRow({ e, onClick }: { e: Expense; onClick?: () => void }) {
  const c = CATEGORY[e.category];
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <CatIcon id={e.category} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium">{e.note || c.short}</span>
        <span className="block truncate text-[12px] text-muted">
          {weekday(e.date)}, {ddmm(e.date)}, {c.short.toLowerCase()}
        </span>
      </span>
      {/* откуда деньги: свои — без метки, в долг — сирень, из резерва — сумерки (как на полосе недели) */}
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <Money value={e.amount} className="text-[15px]" />
        {e.source === 'credit' && <span className="src-loan inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-medium"><CreditCard size={10} strokeWidth={2} />в долг</span>}
        {e.source === 'reserve' && <span className="src-rsv inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-medium"><PiggyBank size={10} strokeWidth={2} />резерв</span>}
      </span>
    </button>
  );
}

export const GROUP_ICON: Record<EventGroup, typeof Wallet> = { debt: CreditCard, fixed: Repeat, income: ArrowDownLeft, weekly: Wallet, other: Receipt };
/** цвет события по смыслу: кредит — закат, обязательный — сумерки, поступление — отмель, пополнение — Нева */
export const GROUP_COLOR: Record<EventGroup, string> = { debt: 'var(--mark-out)', fixed: 'var(--rsv)', income: 'var(--mark-in)', weekly: 'var(--own)', other: '#d99a1c' };
export const GROUP_LABEL: Record<EventGroup, string> = { debt: 'кредит', fixed: 'обязательный', income: 'поступление', weekly: 'пополнение карты', other: 'разовый' };

export function whenText(e: CalEvent) {
  return e.dateMode === 'until' ? `до ${ddmm(e.date)}` : e.dateMode === 'approx' ? `~${ddmm(e.date)}` : e.dateMode === 'month' ? 'в течение месяца' : ddmm(e.date);
}

/** Строка платежа или поступления. Кружок слева — отметить, остальное — открыть. */
export function EventRow({ e, mark, now, onClick, onToggle, showDate = true }: { e: CalEvent; mark?: EventMark; now: string; onClick: () => void; onToggle?: () => void; showDate?: boolean }) {
  const u = urgency(e, mark, now);
  const g = eventGroup(e);
  const Icon = GROUP_ICON[g];
  const hot = u === 'overdue' || u === 'soon';
  // дата прошла, а отметки нет: в прогнозе оно стоит сегодняшним днём — пометка, чтобы отметить или перенести
  const missed = u !== 'done' && e.date < now;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${u === 'done' ? 'opacity-55' : ''}`}>
      <button type="button" onClick={onToggle ?? onClick} aria-label={mark?.done ? 'Снять отметку' : g === 'income' ? 'Отметить: пришло' : g === 'weekly' ? 'Отметить: долито' : 'Отметить: оплачено'}
        className={`dot-tile size-10 transition ${mark?.done ? '!bg-pos !text-white' : hot ? 'ring-[1.5px] ring-neg/60' : ''}`}
        style={{ '--c': hot && !mark?.done ? 'var(--neg)' : GROUP_COLOR[g] } as CSSProperties}>
        {mark?.done
          ? <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4, duration: 0.35 }}><Check size={18} strokeWidth={2.4} /></motion.span>
          : <Icon size={18} strokeWidth={1.7} />}
      </button>
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14.5px] font-medium ${u === 'done' ? 'line-through decoration-1' : ''}`}>{e.title}</span>
          <span className={`block text-[12px] ${hot ? 'text-neg' : missed ? 'text-warn' : 'text-muted'}`}>
            {showDate ? `${whenText(e)}, ` : e.dateMode === 'until' ? 'внести до этой даты, ' : ''}
            {u === 'done' ? (g === 'income' ? 'пришло' : g === 'weekly' ? 'долито' : 'оплачено') : e.dateMode === 'month' ? 'дата не известна' : relDays(now, e.date)}
            {missed ? ', не отмечено' : ''}
            {e.moved && u !== 'done' ? ', дата изменена' : ''}
            {e.planned && u !== 'done' ? `, по графику ${ddmm(e.planned)} — выходной` : ''}
          </span>
        </span>
        <Money value={mark?.done && mark.amount != null ? mark.amount : e.amount} approx={e.approx && !mark?.done} sign={g === 'income'}
          className={`shrink-0 text-[15px] ${g === 'income' ? 'text-pos' : ''}`} />
      </button>
    </div>
  );
}

const ALERT_ICON: Record<Alert['tone'], ReactNode> = {
  danger: <AlertTriangle size={17} strokeWidth={1.6} />,
  warn: <CreditCard size={17} strokeWidth={1.6} />,
  good: <Sparkles size={17} strokeWidth={1.6} />,
  info: <Info size={17} strokeWidth={1.6} />,
};
const ALERT_TONE: Record<Alert['tone'], string> = {
  danger: 'text-neg bg-neg/10',
  warn: 'text-warn bg-warn/12',
  good: 'text-pos bg-pos/12',
  info: 'text-muted bg-surface-2',
};

export function AlertRow({ a, onClick, now }: { a: Alert; onClick?: () => void; now: string }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${ALERT_TONE[a.tone]}`}>{ALERT_ICON[a.tone]}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] leading-snug font-medium">{a.title}</span>
        {a.event && a.action === 'pay' && (
          <span className={`mt-0.5 block text-[12.5px] ${a.tone === 'danger' ? 'text-neg' : 'text-warn'}`}>
            <Money value={a.event.amount} approx={a.event.approx} />, {whenText(a.event)}, {relDays(now, a.event.date)}
          </span>
        )}
        {a.text && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{a.text}</span>}
      </span>
      <ChevronRight size={16} className="mt-2.5 shrink-0 text-faint" />
    </button>
  );
}

// Общие строки списков: трата, событие календаря, предупреждение.
import { AlertTriangle, ArrowDownLeft, CalendarCheck, Check, CreditCard, Info, PiggyBank, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { urgency } from '../domain/calendar';
import { ddmm, relDays, weekday } from '../domain/dates';
import { rub } from '../domain/money';
import { CATEGORY } from '../domain/plan';
import type { Alert } from '../domain/summary';
import type { CalEvent, EventMark, Expense } from '../domain/types';

export function ExpenseRow({ e, onClick }: { e: Expense; onClick?: () => void }) {
  const c = CATEGORY[e.category];
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[19px]">{c.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{e.note || c.short}</span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
          {weekday(e.date)}, {ddmm(e.date)} · {c.short}
          {e.source === 'credit' && <span className="inline-flex items-center gap-0.5 font-bold text-danger"><CreditCard size={12} /> кредитка</span>}
          {e.source === 'reserve' && <span className="inline-flex items-center gap-0.5 font-semibold text-info"><PiggyBank size={12} /> резерв</span>}
        </span>
      </span>
      <span className={`shrink-0 text-[15px] font-bold ${e.source === 'credit' ? 'text-danger' : ''}`}>{rub(e.amount)}</span>
    </button>
  );
}

export function EventRow({ e, mark, now, onClick, onToggle }: { e: CalEvent; mark?: EventMark; now: string; onClick: () => void; onToggle?: () => void }) {
  const u = urgency(e, mark, now);
  const income = e.kind === 'income';
  const tone = u === 'overdue' || u === 'soon' ? 'text-danger' : u === 'done' ? 'text-faint' : 'text-muted';
  const when = e.dateMode === 'until' ? `до ${ddmm(e.date)}` : e.dateMode === 'approx' ? `~${ddmm(e.date)}` : e.dateMode === 'month' ? 'в этом месяце' : ddmm(e.date);
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${u === 'done' ? 'opacity-60' : ''}`}>
      <button type="button" onClick={onToggle ?? onClick} aria-label={mark?.done ? 'Снять отметку' : income ? 'Отметить: пришло' : 'Отметить: оплачено'}
        className={`grid size-9 shrink-0 place-items-center rounded-full border-2 transition ${mark?.done ? 'border-accent bg-accent text-on-accent' : u === 'overdue' || u === 'soon' ? 'border-danger text-danger' : 'border-line text-transparent'}`}>
        <Check size={17} strokeWidth={3} />
      </button>
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[15px] font-semibold ${u === 'done' ? 'line-through decoration-1' : ''}`}>{e.title}</span>
          <span className={`block text-[12.5px] font-medium ${tone}`}>
            {when}{e.dateMode !== 'month' && u !== 'done' ? ` · ${relDays(now, e.date)}` : ''}{e.kind === 'weekly' ? '' : ''}
          </span>
        </span>
        <span className={`shrink-0 text-right text-[15px] font-bold ${income ? 'text-accent' : ''}`}>
          {rub(mark?.amount ?? e.amount, { approx: e.approx && !mark?.done, sign: income })}
        </span>
      </button>
    </div>
  );
}

const ALERT_ICON: Record<Alert['tone'], ReactNode> = {
  danger: <AlertTriangle size={18} />,
  warn: <CalendarCheck size={18} />,
  good: <Sparkles size={18} />,
  info: <Info size={18} />,
};
const ALERT_TONE: Record<Alert['tone'], string> = {
  danger: 'bg-danger/10 text-danger',
  warn: 'bg-warn/12 text-warn',
  good: 'bg-accent/12 text-accent',
  info: 'bg-info/10 text-info',
};

export function AlertCard({ a, onClick, now }: { a: Alert; onClick?: () => void; now: string }) {
  return (
    <button type="button" onClick={onClick} className="card flex w-full items-start gap-3 p-4 text-left">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${ALERT_TONE[a.tone]}`}>{ALERT_ICON[a.tone]}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-bold">{a.title}</span>
        {a.event && a.action === 'pay' && (
          <span className={`mt-0.5 block text-[13px] font-semibold ${a.tone === 'danger' ? 'text-danger' : 'text-warn'}`}>
            {rub(a.event.amount, { approx: a.event.approx })} · {a.event.dateMode === 'until' ? 'до ' : ''}{ddmm(a.event.date)}, {relDays(now, a.event.date)}
          </span>
        )}
        {a.text && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{a.text}</span>}
      </span>
      {a.action === 'income' && <ArrowDownLeft size={18} className="mt-2 shrink-0 text-accent" />}
    </button>
  );
}

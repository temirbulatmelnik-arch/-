import { ChevronLeft, ChevronRight, CreditCard, PiggyBank } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ExpenseRow } from '../components/rows';
import { Bar, Empty, IconButton, ScreenHeader, SectionTitle } from '../components/ui';
import { addMonths, monthKey, monthName } from '../domain/dates';
import { rub } from '../domain/money';
import { CATEGORY, currentPhase } from '../domain/plan';
import { monthByCategory } from '../domain/summary';
import { useStore } from '../store/store';
import { useToday, useUi } from '../store/ui';

export function Budget() {
  const now = useToday();
  const [expenses, debts, reserve, wishes] = useStore(useShallow(s => [s.expenses, s.debts, s.reserve, s.wishes]));
  const set = useUi(s => s.set);
  const [month, setMonth] = useState(monthKey(now));
  const rows = useMemo(() => monthByCategory(expenses, debts, month), [expenses, debts, month]);
  const list = useMemo(() => expenses.filter(e => monthKey(e.date) === month).reverse(), [expenses, month]);
  const phase = currentPhase(debts, `${month}-15`);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const limit = rows.reduce((s, r) => s + r.limit, 0);
  const baseline = rows.reduce((s, r) => s + r.baseline, 0);
  const credit = list.filter(e => e.source === 'credit');
  const fromReserve = list.filter(e => e.source === 'reserve').reduce((s, e) => s + e.amount, 0);
  const saved = wishes.filter(w => w.resolved === 'skipped').reduce((s, w) => s + w.amount, 0);

  return (
    <div>
      <ScreenHeader title="Бюджет" overline={`Этап ${phase.id}: ${rub(phase.monthly || limit)} в месяц`} />

      <div className="mx-4 flex items-center justify-between rounded-2xl bg-surface p-1.5 ring-1 ring-line">
        <IconButton onClick={() => setMonth(addMonths(month, -1))} label="Предыдущий месяц"><ChevronLeft size={20} /></IconButton>
        <span className="text-[16px] font-extrabold capitalize">{monthName(month)}</span>
        <IconButton onClick={() => setMonth(addMonths(month, 1))} label="Следующий месяц"><ChevronRight size={20} /></IconButton>
      </div>

      <div className="card mx-4 mt-3 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-semibold text-muted">Потрачено</span>
          <span className="text-[13px] font-semibold text-muted">лимит {rub(limit)}</span>
        </div>
        <div className={`mt-1 text-[32px] font-extrabold tracking-tight ${spent > limit ? 'text-danger' : ''}`}>{rub(spent)}</div>
        <Bar value={limit ? spent / limit : 0} tone={spent > limit ? 'danger' : 'accent'} className="mt-3" />
        <p className="mt-2 text-[12.5px] text-muted">В среднем в 2026 уходило {rub(baseline)} в месяц.{fromReserve > 0 ? ` Из резерва — ${rub(fromReserve)} (в лимит не входит).` : ''}</p>
      </div>

      {credit.length > 0 && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-danger/10 p-4 text-danger">
          <CreditCard size={20} className="mt-0.5 shrink-0" />
          <div className="text-[14px] leading-snug"><b>Траты с кредиток: {credit.length} на {rub(credit.reduce((s, e) => s + e.amount, 0))}.</b> Это нарушение плана №1 — кредитки только гасим.</div>
        </div>
      )}

      <SectionTitle>По категориям</SectionTitle>
      <div className="card mx-4 divide-y divide-line overflow-hidden">
        {rows.map(r => {
          const c = CATEGORY[r.id];
          const over = r.spent > r.limit;
          return (
            <div key={r.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-[20px]">{c.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{c.name}</span>
                <span className={`shrink-0 text-[14px] font-bold ${over ? 'text-danger' : ''}`}>{rub(r.spent)}</span>
              </div>
              <div className="mt-2 flex items-center gap-3 pl-8">
                <Bar value={r.limit ? r.spent / r.limit : 0} tone={over ? 'danger' : r.spent > r.limit * 0.8 ? 'warn' : 'accent'} className="flex-1" />
                <span className="w-[118px] shrink-0 text-right text-[11.5px] text-muted">из {rub(r.limit)} · было {rub(r.baseline)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" onClick={() => set({ reserve: true })} className="card mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 p-4 text-left">
        <span className="grid size-10 place-items-center rounded-2xl bg-info/12 text-info"><PiggyBank size={20} /></span>
        <span className="flex-1">
          <span className="block text-[13px] font-semibold text-muted">Резерв (накопительный счёт)</span>
          <span className="block text-[20px] font-extrabold">{rub(reserve)}</span>
        </span>
        <ChevronRight size={18} className="text-faint" />
      </button>
      {saved > 0 && <p className="mx-6 mt-2 text-[13px] font-semibold text-accent">Пауза 48 часов уже сберегла {rub(saved)}.</p>}

      <SectionTitle>Все траты месяца</SectionTitle>
      {list.length ? (
        <div className="card mx-4 divide-y divide-line overflow-hidden">
          {list.map(e => <ExpenseRow key={e.id} e={e} onClick={() => set({ add: { edit: e } })} />)}
        </div>
      ) : <div className="px-4"><Empty>В этом месяце трат нет.</Empty></div>}
    </div>
  );
}

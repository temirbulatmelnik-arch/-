import { ChevronLeft, ChevronRight, CreditCard, Vault } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ExpenseRow } from '../components/rows';
import { SkyButton, SkyHeader } from '../components/Petersburg';
import { Bar, CatIcon, Empty, Money, SectionTitle } from '../components/ui';
import { addMonths, monthKey, monthName } from '../domain/dates';
import { CATEGORY, currentPhase } from '../domain/plan';
import { monthByCategory } from '../domain/summary';
import { useStore } from '../store/store';
import { useToday, useUi } from '../store/ui';

export function Budget() {
  const now = useToday();
  const [expenses, debts, reserve, wishes] = useStore(useShallow(s => [s.expenses, s.debts, s.reserve, s.wishes] as const));
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
      <SkyHeader
        title="Бюджет"
        subtitle={<button type="button" onClick={() => setMonth(monthKey(now))} className="text-left first-letter:uppercase">{monthName(month)}</button>}
        action={
          <div className="flex gap-2">
            <SkyButton onClick={() => setMonth(addMonths(month, -1))} label="Предыдущий месяц"><ChevronLeft size={18} strokeWidth={1.7} /></SkyButton>
            <SkyButton onClick={() => setMonth(addMonths(month, 1))} label="Следующий месяц"><ChevronRight size={18} strokeWidth={1.7} /></SkyButton>
          </div>
        } />

      <section className="deep-card mx-4 mt-3 px-6 py-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-card-muted">Потрачено за месяц</span>
          <span className="text-[12.5px] text-card-muted">лимит этапа {phase.id}: <Money value={limit} className="text-card" /></span>
        </div>
        <Money value={spent} className={`figure mt-1 block text-[44px] leading-none ${spent > limit ? 'text-[#f2a596]' : ''}`} />
        <Bar value={limit ? spent / limit : 0} tone={spent > limit ? 'neg' : 'card'} onCard className="mt-5" />
        <p className="mt-3 text-[12.5px] leading-snug text-card-muted">
          {baseline > 0 && <>До плана уходило <Money value={baseline} className="text-card" /> в месяц. </>}
          {fromReserve > 0 && <>Из резерва — <Money value={fromReserve} className="text-card" />, в лимит не входит.</>}
        </p>
      </section>

      {credit.length > 0 && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-[22px] bg-neg/10 px-4 py-3.5 text-neg">
          <CreditCard size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          <div className="text-[13.5px] leading-snug">Траты с кредиток: {credit.length} на <Money value={credit.reduce((s, e) => s + e.amount, 0)} />. Нарушение плана №1 — кредитки только гасим.</div>
        </div>
      )}

      <SectionTitle>По категориям</SectionTitle>
      <div className="card divide-hair mx-4 overflow-hidden">
        {rows.map(r => {
          const over = r.spent > r.limit;
          return (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <CatIcon id={r.id} className="size-9" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px]">{CATEGORY[r.id].short}</span>
                  <span className="shrink-0 text-[13.5px]"><Money value={r.spent} className={over ? 'text-neg' : ''} /><span className="text-faint"> / <Money value={r.limit} /></span></span>
                </div>
                <Bar value={r.limit ? r.spent / r.limit : 0} tone={over ? 'neg' : r.spent > r.limit * 0.8 ? 'warn' : 'sea'} className="mt-2" />
                {r.baseline > 0 && <div className="mt-1.5 text-[11px] text-faint">было <Money value={r.baseline} /></div>}
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" onClick={() => set({ reserve: true })} className="card mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 p-4 text-left">
        <span className="grid size-10 place-items-center rounded-full bg-surface-2"><Vault size={18} strokeWidth={1.5} /></span>
        <span className="flex-1">
          <span className="block text-[12.5px] text-muted">Резерв</span>
          <Money value={reserve} className="block text-[18px] font-medium" />
        </span>
        <ChevronRight size={16} className="text-faint" />
      </button>
      {saved > 0 && <p className="mx-6 mt-2 text-[12.5px] text-pos">Пауза 48 часов уже сберегла <Money value={saved} />.</p>}

      <SectionTitle>Траты месяца</SectionTitle>
      {list.length ? (
        <div className="card divide-hair mx-4 overflow-hidden">
          {list.map(e => <ExpenseRow key={e.id} e={e} onClick={() => set({ add: { edit: e } })} />)}
        </div>
      ) : <div className="px-4"><Empty>В этом месяце трат нет.</Empty></div>}
    </div>
  );
}

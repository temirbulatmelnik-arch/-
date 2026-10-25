// План: долги и прогноз, чек-лист и стратегия из аудита, этапы и правила.
import { Check, Gift, Lock, MessagesSquare, Plus, Target } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DebtChart } from '../components/DebtChart';
import { SkyButton, SkyHeader } from '../components/Petersburg';
import { Bar, Chip, Empty, LinkButton, Money, SectionTitle, Segmented } from '../components/ui';
import { eventsBetween } from '../domain/calendar';
import { addDays, addMonths, ddmm, monthIn, monthKey, monthName } from '../domain/dates';
import { forecast } from '../domain/forecast';
import { pct } from '../domain/money';
import { currentPhase, monthlyInterest, planConfig, targetDebt, totalDebt } from '../domain/plan';
import { checklistDue } from '../domain/planUpdate';
import type { ChecklistItem, Debt } from '../domain/types';
import { useStore } from '../store/store';
import { useCal, useToday, useUi, type PlanView } from '../store/ui';
import { NewDebtSheet } from './DebtSheet';

export const DEFAULT_RULES = [
  'Кредитки только гасим, с них не тратим: ни покупок, ни переводов на свой номер.',
  'Премия — не зарплата: в день прихода — резерв до следующей премии, остальное в текущий долг.',
  'Никаких новых кредитов, микрозаймов, Сплитов, «Долями» и рассрочек.',
  'На повышение лимита — всегда отказ. Закрытую карту закрываем вместе со счётом.',
  'На жизнь — фиксированная сумма в неделю по понедельникам. Кончилась — ждём понедельника.',
  'Разовая трата больше 5 000 — только из недельного бюджета и после паузы 48 часов.',
  'Резерв — только на нехватку по плану, здоровье и срочное. Просрочки недопустимы ни на день.',
];

export function Plan() {
  const [checklist, checks] = useStore(useShallow(s => [s.checklist, s.checks] as const));
  const set = useUi(s => s.set);
  const view = useUi(s => s.planView);
  const open = checklist.filter(c => !(checks[c.id]?.done ?? c.done)).length;

  return (
    <div>
      <SkyHeader title="План" subtitle="Выход из долгов" action={
        <div className="flex gap-2">
          <SkyButton onClick={() => set({ sync: true })} label="Связь с чатом «Финансы»"><MessagesSquare size={17} strokeWidth={1.5} /></SkyButton>
          <button type="button" onClick={() => set({ bonus: {} })} className="flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[13.5px] font-medium text-bg"><Gift size={15} strokeWidth={1.8} /> Премия</button>
        </div>
      } />
      <div className="mt-3 px-4">
        <Segmented<PlanView> value={view} onChange={v => set({ planView: v })} options={[
          { id: 'debts', label: 'Долги' },
          { id: 'checklist', label: <>Чек-лист{open ? <span className="ml-1 text-sea">{open}</span> : null}</> },
          { id: 'strategy', label: 'Стратегия' },
        ]} />
      </div>
      {view === 'debts' && <DebtsView />}
      {view === 'checklist' && <ChecklistView />}
      {view === 'strategy' && <StrategyView />}
    </div>
  );
}

function DebtsView() {
  const now = useToday();
  const cal = useCal();
  const [debts, incomes, reserve, plan, baseline, snapshots, oneOff, templateFrom] = useStore(useShallow(s => [s.debts, s.incomes, s.reserve, s.planTrajectory, s.baselineTrajectory, s.snapshots, s.oneOff, s.templateFrom] as const));
  const set = useUi(s => s.set);
  const [adding, setAdding] = useState(false);
  const total = totalDebt(debts);
  const start = plan[0]?.[1] ?? debts.reduce((s, d) => s + d.startBalance, 0);
  const target = targetDebt(debts);
  // текущий месяц уже идёт по календарю — модель считает со следующего
  const fc = useMemo(() => forecast({ debts, incomes, reserve, from: `${addMonths(monthKey(now), 1)}-01`, oneOff, templateFrom }), [debts, incomes, reserve, now, oneOff, templateFrom]);
  const next = useMemo(() => {
    const ev = eventsBetween(cal, now, addDays(now, 45)).filter(e => e.kind === 'payment' && e.debtId);
    return Object.fromEntries(debts.map(d => [d.id, ev.find(e => e.debtId === d.id)]));
  }, [cal, debts, now]);
  const fact: [string, number][] = useMemo(() => {
    const cur = monthKey(now);
    return [...snapshots.map(s => [s.month, s.total] as [string, number]).filter(p => p[0] !== cur), [cur, Math.round(total)] as [string, number]].sort((a, b) => a[0].localeCompare(b[0]));
  }, [snapshots, total, now]);
  const forecastLine: [string, number][] = [fact[fact.length - 1], ...fc.trajectory.filter(p => p[0] > monthKey(now))];
  const planEnd = plan.at(-1)?.[0];
  const openDebts = debts.filter(d => !d.closed).sort((a, b) => a.order - b.order);
  const closed = debts.filter(d => d.closed);

  return (
    <>
      <section className="deep-card mx-4 mt-4 px-6 pt-6 pb-5">
        <div className="text-[13px] text-card-muted">Общий долг</div>
        <Money value={total} className="figure mt-1 block text-[46px] leading-none" />
        {start > 0 && <Bar value={1 - total / start} tone="card" className="mt-5" />}
        <div className="mt-4 grid grid-cols-2 gap-3 text-[12px] text-card-muted">
          <div>Погашено с начала<Money value={Math.max(0, start - total)} className="mt-0.5 block text-[15px] text-card" /></div>
          <div>Проценты в месяц<Money value={monthlyInterest(debts)} approx className="mt-0.5 block text-[15px] text-card" /></div>
        </div>
        <div className="mt-4 border-t border-card-line pt-3 text-[12.5px] leading-snug text-card-muted">
          {fc.freeMonth
            ? <>Свобода по текущему темпу — <span className="text-card">{monthName(fc.freeMonth)}</span>{planEnd ? <>, по плану — {monthName(planEnd)}</> : null}.</>
            : 'При текущих суммах долг не закрывается за 6 лет.'}
        </div>
      </section>

      {target && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-[22px] border border-sea/30 bg-sea/8 px-4 py-3.5">
          <Target size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-sea" />
          <div className="text-[13.5px] leading-snug">
            <span className="font-medium">Цель: {target.short}</span> <span className="text-muted">под {pct(target.rate)}</span><br />
            <span className="text-muted">
              {target.targetClose && target.targetClose > monthKey(now)
                ? <>Закрываем {monthIn(target.targetClose)} премией, до этого — только обязательные платежи.</>
                : <>Все премии сверх резерва — сюда, пока не закроется.</>}
            </span>
          </div>
        </div>
      )}

      {(plan.length > 0 || fact.length > 1) && (
        <>
          <SectionTitle>План и факт</SectionTitle>
          <div className="card mx-4 p-4"><DebtChart plan={plan} fact={fact} forecast={forecastLine} baseline={baseline} /></div>
        </>
      )}

      <SectionTitle>По порядку закрытия</SectionTitle>
      <div className="space-y-2.5 px-4">
        {openDebts.length === 0 && <Empty>{debts.length ? 'Все долги закрыты. Свобода.' : 'Долгов пока нет.'}</Empty>}
        {openDebts.map(d => <DebtCard key={d.id} d={d} next={next[d.id]} closeMonth={fc.closeMonth[d.id]} target={target?.id === d.id} onClick={() => set({ debt: d.id })} />)}
        <button type="button" onClick={() => setAdding(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-[13.5px] text-muted"><Plus size={16} /> Добавить долг</button>
      </div>

      {closed.length > 0 && (
        <>
          <SectionTitle>Закрыты</SectionTitle>
          <div className="card divide-hair mx-4 overflow-hidden">
            {closed.map(d => (
              <button key={d.id} type="button" onClick={() => set({ debt: d.id })} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-[14.5px]"><Check size={15} className="text-pos" /> {d.short}</span>
                <span className="text-[12.5px] text-muted">{d.closedOn ? `закрыт ${ddmm(d.closedOn)}, ` : ''}было <Money value={d.startBalance} /></span>
              </button>
            ))}
          </div>
        </>
      )}
      <NewDebtSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function DebtCard({ d, next, closeMonth, target, onClick }: { d: Debt; next?: { date: string; amount: number; approx?: boolean; dateMode: string }; closeMonth: string | null; target: boolean; onClick: () => void }) {
  const progress = d.startBalance ? 1 - d.balance / d.startBalance : 0;
  const late = closeMonth && d.targetClose && closeMonth > d.targetClose;
  return (
    <button type="button" onClick={onClick} className={`card block w-full p-4 text-left ${target ? 'border-sea/50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[15.5px] font-medium">{d.short}</span>
            <Chip>{pct(d.rate)}</Chip>
            {d.frozen && <Chip tone="neg"><Lock size={10} /> не тратить</Chip>}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted">{d.name}</div>
        </div>
        <Money value={d.balance} className="figure shrink-0 text-[22px] leading-none" />
      </div>
      <Bar value={progress} tone={target ? 'sea' : 'pos'} className="mt-4" />
      <div className="mt-2.5 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[12px] text-muted">
        <span>{next ? <>платёж {next.dateMode === 'until' ? 'до ' : ''}{ddmm(next.date)}: <Money value={next.amount} approx={next.approx} className="text-ink" /></> : 'платежей в 45 дней нет'}</span>
        <span className={late ? 'text-warn' : ''}>{closeMonth ? `закроется ~${monthName(closeMonth)}` : 'срок не виден'}{late ? ` (план — ${monthName(d.targetClose!)})` : ''}</span>
      </div>
    </button>
  );
}

function ChecklistView() {
  const now = useToday();
  const [checklist, checks, toggleCheck] = useStore(useShallow(s => [s.checklist, s.checks, s.toggleCheck] as const));
  const set = useUi(s => s.set);
  const isDone = (c: ChecklistItem) => checks[c.id]?.done ?? !!c.done;
  const sorted = [...checklist].sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  // пришли из «Внимания» — прокрутить к пункту и подсветить его
  const focus = useUi(s => s.focus);
  const focused = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focus) return;
    focused.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => set({ focus: null }), 2600);
    return () => clearTimeout(t);
  }, [focus, set]);
  return (
    <>
      <SectionTitle action={<LinkButton onClick={() => set({ sync: true })}>Обновить из чата</LinkButton>}>Из аудита</SectionTitle>
      {sorted.length === 0 ? <div className="px-4"><Empty>Чек-листа пока нет. Его можно получить из чата «Финансы»: «Связь с чатом» → вставить обновление.</Empty></div> : (
        <div className="card divide-hair mx-4 overflow-hidden">
          {sorted.map(c => {
            const done = isDone(c);
            const due = done ? null : checklistDue(c, now);
            return (
              <button key={c.id} ref={c.id === focus ? focused : undefined} type="button" onClick={() => toggleCheck(c.id)} aria-pressed={done}
                className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-700 ${done ? 'opacity-50' : ''} ${c.id === focus ? 'bg-sea/12' : ''}`}>
                <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border ${done ? 'border-transparent bg-pos text-white' : due === 'overdue' ? 'border-warn' : 'border-line'}`}>{done && <Check size={13} strokeWidth={2.5} />}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14.5px] leading-snug ${done ? 'line-through decoration-1' : ''}`}>{c.title}</span>
                  {c.note && !done && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{c.note}</span>}
                </span>
                {c.due && !done && <Chip tone={due === 'overdue' ? 'warn' : due === 'soon' ? 'sea' : 'neutral'} className="mt-0.5">{c.due.length === 7 ? monthName(c.due).split(' ')[0] : ddmm(c.due)}</Chip>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function StrategyView() {
  const now = useToday();
  const [debts, strategy, rules] = useStore(useShallow(s => [s.debts, s.strategy, s.rules] as const));
  const phases = planConfig().phases;
  const cur = currentPhase(debts, now);
  const closedNames = (p: number) => debts.filter(d => d.phase === p).every(d => d.closed);
  return (
    <>
      <SectionTitle>Этапы</SectionTitle>
      <div className="card mx-4 px-4 py-2">
        {phases.map((p, i) => {
          const done = debts.some(d => d.phase === p.id) && closedNames(p.id);
          const active = p.id === cur.id;
          return (
            <div key={p.id} className="relative flex gap-4 py-3">
              {i < phases.length - 1 && <span className="absolute top-9 bottom-[-12px] left-[11px] w-px bg-line" />}
              <span className={`relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[11px] ${done ? 'border-transparent bg-pos text-white' : active ? 'border-sea bg-sea text-on-sea' : 'border-line bg-surface text-muted'}`}>{done ? <Check size={12} strokeWidth={2.5} /> : p.id}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[14.5px] font-medium ${active ? 'text-sea' : ''}`}>{p.title}</span>
                  <span className="text-[12px] text-muted">{monthName(p.from).split(' ')[0].slice(0, 3)} {p.from.slice(2, 4)} – {monthName(p.to).split(' ')[0].slice(0, 3)} {p.to.slice(2, 4)}</span>
                </div>
                {p.weekly > 0 && <div className="mt-0.5 text-[12.5px] text-muted"><Money value={p.weekly} /> в неделю, <Money value={p.monthly} /> в месяц</div>}
                {p.closes.length > 0 && <div className="mt-0.5 text-[12.5px] text-muted">Закрываем: {p.closes.join(', ')}</div>}
                {active && p.premiums && <div className="mt-1.5 text-[12.5px] leading-snug">{p.premiums}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {strategy.map(s => (
        <div key={s.title}>
          <SectionTitle>{s.title}</SectionTitle>
          <div className="card mx-4 space-y-2.5 px-5 py-4 text-[14px] leading-relaxed">
            {s.text.split(/\n\n+/).map((block, k) => block.trim().startsWith('- ') ? (
              <ul key={k} className="space-y-1.5">{block.split('\n').map(l => l.replace(/^-\s*/, '')).filter(Boolean).map(l => <li key={l} className="flex gap-2.5"><span className="mt-[9px] size-1 shrink-0 rounded-full bg-sea" />{l}</li>)}</ul>
            ) : <p key={k}>{block}</p>)}
          </div>
        </div>
      ))}

      <SectionTitle>Правила</SectionTitle>
      <ol className="card mx-4 space-y-3 px-5 py-4">
        {(rules.length ? rules : DEFAULT_RULES).map((r, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-snug"><span className="w-4 shrink-0 text-right text-[13px] text-sea">{i + 1}</span>{r}</li>
        ))}
      </ol>
    </>
  );
}

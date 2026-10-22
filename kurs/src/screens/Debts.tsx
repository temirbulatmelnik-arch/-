import { Gift, Lock, Plus, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DebtChart } from '../components/DebtChart';
import { Bar, Chip, Empty, ScreenHeader, SectionTitle } from '../components/ui';
import { eventsBetween } from '../domain/calendar';
import { addDays, addMonths, ddmm, monthKey, monthName } from '../domain/dates';
import { forecast } from '../domain/forecast';
import { pct, rub } from '../domain/money';
import { monthlyInterest, targetDebt, totalDebt } from '../domain/plan';
import type { Debt } from '../domain/types';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';
import { NewDebtSheet } from './DebtSheet';

export const RULES = [
  'Кредитки только гасим, с них не тратим: ни покупок, ни переводов на свой номер, ни «вернуть минималку обратно».',
  'Премия — не зарплата: в день прихода — резерв до следующей премии, остальное в текущий долг.',
  'Никаких новых кредитов, микрозаймов, Сплитов, «Долями» и рассрочек — в том числе «рассрочки по дебетовой карте».',
  'На повышение лимита — всегда отказ. Закрытую карту закрываем вместе со счётом.',
  'На жизнь — фиксированная сумма в неделю по понедельникам. Кончилась — ждём понедельника, а не берём из резерва.',
  'Разовая трата больше 5 000 — только из недельного бюджета и после паузы 48 часов.',
  'Резерв — только на нехватку по плану, здоровье и срочное. Просрочки недопустимы ни на день.',
];

export function Debts() {
  const now = useToday();
  const cal = useCal();
  const [debts, incomes, reserve, plan, baseline, snapshots] = useStore(useShallow(s => [s.debts, s.incomes, s.reserve, s.planTrajectory, s.baselineTrajectory, s.snapshots]));
  const set = useUi(s => s.set);
  const [adding, setAdding] = useState(false);
  const total = totalDebt(debts);
  const start = plan[0]?.[1] ?? debts.reduce((s, d) => s + d.startBalance, 0);
  const target = targetDebt(debts);
  // текущий месяц уже идёт по календарю — модель считает со следующего
  const fc = useMemo(() => forecast({ debts, incomes, reserve, from: `${addMonths(monthKey(now), 1)}-01` }), [debts, incomes, reserve, now]);
  const next = useMemo(() => {
    const ev = eventsBetween(cal, now, addDays(now, 45)).filter(e => e.kind === 'payment' && e.debtId);
    return Object.fromEntries(debts.map(d => [d.id, ev.find(e => e.debtId === d.id)]));
  }, [cal, debts, now]);
  const fact: [string, number][] = useMemo(() => {
    const list = snapshots.map(s => [s.month, s.total] as [string, number]);
    const cur = monthKey(now);
    return [...list.filter(p => p[0] !== cur), [cur, Math.round(total)] as [string, number]].sort((a, b) => a[0].localeCompare(b[0]));
  }, [snapshots, total, now]);
  const forecastLine: [string, number][] = [fact[fact.length - 1], ...fc.trajectory.filter(p => p[0] > monthKey(now))];
  const planEnd = plan.at(-1)?.[0];
  const open = debts.filter(d => !d.closed).sort((a, b) => a.order - b.order);
  const closed = debts.filter(d => d.closed);

  return (
    <div>
      <ScreenHeader title="Долги" overline="План выхода" action={
        <button type="button" onClick={() => set({ bonus: {} })} className="flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-bold text-on-accent"><Gift size={17} /> Премия</button>
      } />

      <section className="hero mx-4 p-5">
        <div className="text-[13px] font-semibold text-hero-muted">Общий долг</div>
        <div className="mt-1 text-[40px] leading-none font-extrabold tracking-tight">{rub(total)}</div>
        {start > 0 && <Bar value={1 - total / start} tone="hero" className="mt-4" />}
        <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <div className="text-hero-muted">Погашено с начала</div>
            <div className="text-[17px] font-extrabold">{rub(Math.max(0, start - total))}</div>
          </div>
          <div>
            <div className="text-hero-muted">Проценты в месяц</div>
            <div className="text-[17px] font-extrabold">≈ {rub(monthlyInterest(debts))}</div>
          </div>
        </div>
        <div className="mt-3 rounded-2xl bg-white/8 p-3 text-[13.5px] leading-snug">
          {fc.freeMonth
            ? <>При текущих суммах свобода — <b>{monthName(fc.freeMonth)}</b>{planEnd ? <>, по плану — {monthName(planEnd)}</> : null}. Проценты до конца ≈ {rub(fc.interest)}.</>
            : <>При текущих суммах долг не закрывается за 6 лет. Нужны премии в долг и лимиты этапа.</>}
        </div>
      </section>

      {target && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-accent/10 p-4">
          <Target size={20} className="mt-0.5 shrink-0 text-accent" />
          <div className="text-[14px] leading-snug"><b>Цель сейчас: {target.short}</b> ({pct(target.rate)}). Все премии сверх резерва — сюда, пока не закроется.</div>
        </div>
      )}

      {(plan.length > 0 || fact.length > 1) && (
        <>
          <SectionTitle>План против факта</SectionTitle>
          <div className="card mx-4 p-4">
            <DebtChart plan={plan} fact={fact} forecast={forecastLine} baseline={baseline} />
          </div>
        </>
      )}

      <SectionTitle>По порядку закрытия</SectionTitle>
      <div className="space-y-2.5 px-4">
        {open.length === 0 && <Empty>{debts.length ? 'Все долги закрыты. Свобода!' : 'Долгов пока нет. Добавьте их ниже.'}</Empty>}
        {open.map(d => <DebtCard key={d.id} d={d} next={next[d.id]} closeMonth={fc.closeMonth[d.id]} target={target?.id === d.id} onClick={() => set({ debt: d.id })} />)}
        <button type="button" onClick={() => setAdding(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-[14px] font-semibold text-muted"><Plus size={17} /> Добавить долг</button>
      </div>

      {closed.length > 0 && (
        <>
          <SectionTitle>Закрыты</SectionTitle>
          <div className="card mx-4 divide-y divide-line overflow-hidden">
            {closed.map(d => (
              <button key={d.id} type="button" onClick={() => set({ debt: d.id })} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="text-[15px] font-semibold">✓ {d.short}</span>
                <span className="text-[13px] text-muted">{d.closedOn ? `закрыт ${ddmm(d.closedOn)}` : 'закрыт'} · был {rub(d.startBalance)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Правила</SectionTitle>
      <ol className="card mx-4 space-y-3 p-4">
        {RULES.map((r, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-snug">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-bold">{i + 1}</span>{r}
          </li>
        ))}
      </ol>
      <NewDebtSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function DebtCard({ d, next, closeMonth, target, onClick }: { d: Debt; next?: { date: string; amount: number; approx?: boolean; dateMode: string }; closeMonth: string | null; target: boolean; onClick: () => void }) {
  const progress = d.startBalance ? 1 - d.balance / d.startBalance : 0;
  const late = closeMonth && d.targetClose && closeMonth > d.targetClose;
  return (
    <button type="button" onClick={onClick} className={`card block w-full p-4 text-left ${target ? 'ring-2 ring-accent' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[16px] font-extrabold">{d.short}</span>
            <Chip>{pct(d.rate)}</Chip>
            {d.frozen && <Chip tone="danger"><Lock size={11} /> не тратить</Chip>}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-muted">{d.name}</div>
        </div>
        <div className="shrink-0 text-right text-[18px] font-extrabold">{rub(d.balance)}</div>
      </div>
      <Bar value={progress} className="mt-3" />
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
        <span>{next ? <>платёж {next.dateMode === 'until' ? 'до ' : ''}{ddmm(next.date)}: <b className="text-ink">{rub(next.amount, { approx: next.approx })}</b></> : 'платежей в ближайшие 45 дней нет'}</span>
        <span className={late ? 'font-semibold text-warn' : ''}>
          {closeMonth ? `закроется ~${monthName(closeMonth)}` : 'срок закрытия не виден'}
          {d.targetClose && late ? ` (план — ${monthName(d.targetClose)})` : ''}
        </span>
      </div>
    </button>
  );
}

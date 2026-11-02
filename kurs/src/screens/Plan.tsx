// «Долги» — тает ли долг. Общий долг досчитывает вниз от начального, фарватер: долги буями по порядку закрытия,
// судно — у текущей цели, впереди гавань «Свобода». Ниже — «Долги / План / Чек-лист», листаются пальцем.
import { Anchor, Check, Gift, Lock, Plus, Ship, Target } from 'lucide-react';
import { motion } from 'motion/react';
import { item, list as listAnim, Pager, spring, useTween } from '../components/motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DebtChart } from '../components/DebtChart';
import { SkyHeader } from '../components/Petersburg';
import { Bar, Chip, Empty, LinkButton, Money, SectionTitle } from '../components/ui';
import { bridgeState } from '../domain/bridge';
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
  'На жизнь — фиксированная сумма в неделю: в воскресенье вечером доливаем карту из резерва до лимита. Кончилась раньше — ждём воскресенья.',
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
      <SkyHeader title="Долги" subtitle="Курс к свободе" action={
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => set({ bonus: {} })} className="flex h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-[13.5px] font-medium text-bg"><Gift size={15} strokeWidth={1.8} /> Пришла премия</motion.button>
      } />
      <DebtHero />
      <Pager<PlanView> className="mt-5" value={view} onChange={v => set({ planView: v })} pages={[
        { id: 'debts', label: 'Долги', render: () => <DebtsView /> },
        { id: 'strategy', label: 'План', render: () => <StrategyView /> },
        { id: 'checklist', label: <>Чек-лист{open ? <span className="ml-1 text-sea">{open}</span> : null}</>, render: () => <ChecklistView /> },
      ]} />
    </div>
  );
}

/** Общий долг досчитывает вниз от начального и фарватер: долги буями по порядку закрытия, судно у текущей цели */
function DebtHero() {
  const now = useToday();
  const [debts, incomes, reserve, plan, oneOff, templateFrom] = useStore(useShallow(s => [s.debts, s.incomes, s.reserve, s.planTrajectory, s.oneOff, s.templateFrom] as const));
  const set = useUi(s => s.set);
  const total = totalDebt(debts);
  const start = plan[0]?.[1] ?? debts.reduce((s, d) => s + d.startBalance, 0);
  const shown = useTween(total, start > total ? start : total, 1800);
  const fc = useMemo(() => forecast({ debts, incomes, reserve, from: `${addMonths(monthKey(now), 1)}-01`, oneOff, templateFrom }), [debts, incomes, reserve, now, oneOff, templateFrom]);
  const planEnd = plan.at(-1)?.[0];
  const target = targetDebt(debts);
  const route = [...debts].sort((a, b) => Number(b.closed) - Number(a.closed) || a.order - b.order);
  const step = 96, W = 56 + route.length * step + 96, H = 150;
  const pos = (i: number) => ({ x: 56 + i * step, y: 70 + Math.sin(i * 1.25 + 0.4) * 16 });
  const ti = Math.max(0, route.findIndex(d => d.id === target?.id || (!target && !d.closed)));
  const pts = route.map((_, i) => pos(i));
  const path = pts.reduce((d, p, i) => (i ? `${d} S${p.x - step / 2} ${p.y + (i % 2 ? 22 : -22)} ${p.x} ${p.y}` : `M8 ${p.y + 6} Q${p.x / 2} ${p.y + 14} ${p.x} ${p.y}`), '') + ` S${W - 70} 48 ${W - 40} 62`;
  return (
    <section className="deep-card mx-4 mt-3 pt-5 pb-3">
      <div className="px-5">
        <div className="text-[13px] text-card-muted">Общий долг</div>
        <Money value={shown} className="figure mt-1 block text-[42px] leading-none" />
        {start > 0 && (
          <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-card/12">
            <motion.div className="h-full rounded-full bg-card-sea" initial={{ width: 0 }} animate={{ width: `${Math.max(0, (1 - total / start) * 100)}%` }} transition={{ ...spring, delay: 0.4 }} />
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] text-card-muted">
          <div>Погашено с начала<Money value={Math.max(0, start - total)} className="mt-0.5 block text-[15px] text-card" /></div>
          <div>Проценты в месяц<Money value={monthlyInterest(debts)} approx className="mt-0.5 block text-[15px] text-card" /></div>
        </div>
      </div>
      {/* фарватер: листается вбок; буй — открыть долг, судно — у текущей цели, в конце — гавань «Свобода» */}
      <div className="no-scrollbar mt-2 overflow-x-auto" data-noswipe>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Фарватер: долги по порядку закрытия">
          <defs>
            <linearGradient id="fw-done" x1="0" x2="1"><stop offset="0" stopColor="#4fd1ac" stopOpacity=".9" /><stop offset="1" stopColor="#4fd1ac" stopOpacity=".2" /></linearGradient>
          </defs>
          {/* лёгкая рябь фарватера */}
          {[24, 112, 132].map((y, k) => <path key={y} d={`M0 ${y} q 24 -5 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0`} fill="none" stroke="var(--card-muted)" strokeOpacity={0.12 - k * 0.02} strokeWidth="1" />)}
          <motion.path d={path} fill="none" stroke="var(--card-muted)" strokeOpacity=".5" strokeWidth="1.6" strokeDasharray="5 7"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }} />
          {route.map((d, i) => {
            const p = pts[i];
            const cur = i === ti && !d.closed;
            return (
              <motion.g key={d.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.25 + i * 0.07 }}
                onClick={() => set({ debt: d.id })} style={{ cursor: 'pointer' }} role="button" aria-label={`${d.short}: ${d.closed ? 'закрыт' : `${Math.round(d.balance)} ₽`}`}>
                <circle cx={p.x} cy={p.y} r="22" fill="transparent" />
                {cur && <motion.circle cx={p.x} cy={p.y + 4} r="14" fill="none" stroke="#ffc49a" strokeWidth="1.5" initial={{ scale: 0.6, opacity: 0.9 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }} style={{ transformOrigin: `${p.x}px ${p.y + 4}px` }} />}
                {d.closed
                  ? <><circle cx={p.x} cy={p.y} r="10" fill="#4fd1ac" /><path d={`M${p.x - 4.5} ${p.y} l3.2 3.3 l5.8 -6.4`} stroke="#0a2433" strokeWidth="2" fill="none" strokeLinecap="round" /></>
                  : <g>
                      <path d={`M${p.x - 8} ${p.y + 9} L${p.x} ${p.y - 13} L${p.x + 8} ${p.y + 9} Z`} fill={cur ? '#ffc49a' : '#ee6125'} />
                      <path d={`M${p.x - 5.3} ${p.y + 1.5} H${p.x + 5.3}`} stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
                      <rect x={p.x - 10} y={p.y + 8} width="20" height="4" rx="2" fill="var(--card-muted)" />
                    </g>}
                <text x={p.x} y={p.y + 30} textAnchor="middle" fontSize="12" fontWeight={cur ? 600 : 400} fill="var(--card-ink)" opacity={d.closed ? 0.55 : 1} style={{ fontFamily: 'var(--font-sans)' }}>{d.short}</text>
                {!d.closed && <text x={p.x} y={p.y + 45} textAnchor="middle" fontSize="11" fill="var(--card-muted)" style={{ fontFamily: 'var(--font-sans)' }}>{Math.round(d.balance / 1000).toLocaleString('ru-RU')} тыс.</text>}
              </motion.g>
            );
          })}
          <g transform={`translate(${W - 40} 62)`}>
            <motion.circle r="18" fill="var(--card-sea)" initial={{ opacity: 0.1 }} animate={{ opacity: [0.12, 0.3, 0.12] }} transition={{ duration: 3, repeat: Infinity }} />
            <foreignObject x="-10" y="-10" width="20" height="20"><Anchor size={20} color="var(--card-sea)" /></foreignObject>
            <text y="36" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--card-sea)" style={{ fontFamily: 'var(--font-sans)' }}>Свобода</text>
          </g>
          {/* судно подплывает к текущей цели и покачивается на волне */}
          <motion.g initial={{ x: 0, y: pts[0]?.y ?? 60 }} animate={{ x: (pts[ti]?.x ?? 56) - 40, y: (pts[ti]?.y ?? 60) - 34 }} transition={{ type: 'spring', stiffness: 50, damping: 14, delay: 0.6 }}>
            <motion.g animate={{ y: [0, -3, 0], rotate: [-3, 3, -3] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
              <foreignObject x="0" y="0" width="28" height="28"><Ship size={26} color="var(--card-ink)" /></foreignObject>
            </motion.g>
          </motion.g>
        </svg>
      </div>
      <div className="mx-5 mt-1 border-t border-card-line pt-3 text-[12.5px] leading-snug text-card-muted">
        {fc.freeMonth
          ? <>Свобода по текущему темпу — <span className="text-card">{monthName(fc.freeMonth)}</span>{planEnd ? <>, по плану — {monthName(planEnd)}</> : null}.</>
          : 'При текущих суммах долг не закрывается за 6 лет.'}
      </div>
    </section>
  );
}

/** Мост на кредитке: сколько взято из лимита моста, по неделям и когда гасить. Закрыт — карточки нет. */
function BridgeCard() {
  const [expenses, bridge, debts] = useStore(useShallow(s => [s.expenses, s.bridge, s.debts] as const));
  const st = useMemo(() => bridgeState(expenses, bridge), [expenses, bridge]);
  if (!st || st.bridge.closed) return null;
  const card = debts.find(d => d.id === st.bridge.card)?.short ?? 'кредитке';
  return (
    <section className="mx-4 mt-3 rounded-[24px] border p-4" style={{ background: 'var(--stack-money)', borderColor: 'var(--stack-money-line)' }}>
      <div className="text-[12.5px]" style={{ color: 'var(--stack-money-kicker)' }}>Мост на кредитке {card}</div>
      <div className="mt-0.5 text-[16px] font-medium">использовано <Money value={st.used} /> из <Money value={st.bridge.cap} /></div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${st.left < 0 ? 'bg-neg' : ''}`} style={{ width: `${Math.min(100, (st.used / st.bridge.cap) * 100)}%`, background: st.left < 0 ? undefined : 'repeating-linear-gradient(135deg, #c77dff 0 5px, #9b5de5 5px 10px)' }} />
      </div>
      <div className="divide-hair mt-3">
        {st.weeks.map(w => (
          <div key={w.monday} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 py-2 text-[13px]">
            <span>{ddmm(w.monday)}–{ddmm(addDays(w.monday, 6))}</span>
            <span className="text-[12px] leading-snug text-muted">из резерва <Money value={w.fromReserve} />, кредитка до <Money value={w.fromCredit} /></span>
            <Money value={w.used} className={`figure text-[13px] ${w.used > w.fromCredit ? 'text-neg' : ''}`} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-muted">
        Долг {card} вырос на <Money value={st.used} className="text-ink" />.
        {st.bridge.repayBy && <> Погасить до {ddmm(st.bridge.repayBy)}.{st.bridge.repayBy.slice(0, 4)}.</>}{st.bridge.repayNote && <> {st.bridge.repayNote.replace(/^./, c => c.toUpperCase())}.</>} Только покупки картой: без переводов и снятия.
      </p>
    </section>
  );
}

function DebtsView() {
  const now = useToday();
  const cal = useCal();
  const [debts, incomes, reserve, plan, baseline, snapshots, oneOff, templateFrom] = useStore(useShallow(s => [s.debts, s.incomes, s.reserve, s.planTrajectory, s.baselineTrajectory, s.snapshots, s.oneOff, s.templateFrom] as const));
  const set = useUi(s => s.set);
  const [adding, setAdding] = useState(false);
  const total = totalDebt(debts);
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
  const openDebts = debts.filter(d => !d.closed).sort((a, b) => a.order - b.order);
  const closed = debts.filter(d => d.closed);

  return (
    <>
      <BridgeCard />

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
      <motion.div className="space-y-2.5 px-4" variants={listAnim} initial="hidden" animate="show">
        {openDebts.length === 0 && <Empty>{debts.length ? 'Все долги закрыты. Свобода.' : 'Долгов пока нет.'}</Empty>}
        {openDebts.map((d, i) => <DebtCard key={d.id} n={i + 1} d={d} next={next[d.id]} closeMonth={fc.closeMonth[d.id]} target={target?.id === d.id} onClick={() => set({ debt: d.id })} />)}
        <motion.button variants={item} type="button" onClick={() => setAdding(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-[13.5px] text-muted"><Plus size={16} /> Добавить долг</motion.button>
      </motion.div>

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

/** n — место в очереди закрытия: порядок здесь и есть план (лавина), поэтому номер — не украшение */
function DebtCard({ n, d, next, closeMonth, target, onClick }: { n: number; d: Debt; next?: { date: string; amount: number; approx?: boolean; dateMode: string }; closeMonth: string | null; target: boolean; onClick: () => void }) {
  const progress = d.startBalance ? 1 - d.balance / d.startBalance : 0;
  const late = closeMonth && d.targetClose && closeMonth > d.targetClose;
  return (
    <motion.button variants={item} whileTap={{ scale: 0.98 }} type="button" onClick={onClick} className={`card block w-full p-4 text-left ${target ? 'border-sea/50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`grid size-6 place-items-center rounded-full text-[12px] font-semibold ${target ? 'bg-sea text-on-sea' : 'bg-surface-2 text-muted'}`} aria-label={`${n}-й по очереди`}>{n}</span>
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
    </motion.button>
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
              <motion.button layout transition={spring} key={c.id} ref={c.id === focus ? focused : undefined} type="button" onClick={() => toggleCheck(c.id)} aria-pressed={done}
                className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-700 ${done ? 'opacity-50' : ''} ${c.id === focus ? 'bg-sea/12' : ''}`}>
                <motion.span animate={{ scale: done ? [1, 1.3, 1] : 1 }} transition={{ duration: 0.35 }} className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border ${done ? 'border-transparent bg-pos text-white' : due === 'overdue' ? 'border-warn' : 'border-line'}`}>{done && <Check size={13} strokeWidth={2.5} />}</motion.span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14.5px] leading-snug ${done ? 'line-through decoration-1' : ''}`}>{c.title}</span>
                  {c.note && !done && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{c.note}</span>}
                </span>
                {c.due && !done && <Chip tone={due === 'overdue' ? 'warn' : due === 'soon' ? 'sea' : 'neutral'} className="mt-0.5">{c.due.length === 7 ? monthName(c.due).split(' ')[0] : ddmm(c.due)}</Chip>}
              </motion.button>
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

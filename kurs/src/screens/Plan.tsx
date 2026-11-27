import { ForecastCard } from '../preview/Tide';
import { Simulator } from '../preview/Simulator';
import { VoyageActions } from '../preview/Visuals';
import { monthDebtActivity } from '../domain/accounts';
import { useLedger } from './Checkup';
// «Долги» — тает ли долг. Общий долг досчитывает вниз от начального, фарватер: долги буями по порядку закрытия,
// судно — у текущей цели, впереди гавань «Свобода». Ниже — «Долги / План / Чек-лист», листаются пальцем.
import { Anchor, Check, ChevronDown, ChevronRight, Gift, Lock, Plus, Ship, Target } from 'lucide-react';
import { motion } from 'motion/react';
import { Pager, spring } from '../components/motion';
import type { Forecast } from '../domain/forecast';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DebtChart } from '../components/DebtChart';
import { PrepaymentCard } from "./Prepayment";
import { SkyHeader } from '../components/Petersburg';
import { Bar, Chip, Empty, LinkButton, Money, SectionTitle } from '../components/ui';
import { bridgeState } from '../domain/bridge';
import { eventsBetween } from '../domain/calendar';
import { addDays, addMonths, ddmm, monthKey, monthName } from '../domain/dates';
import { forecast } from '../domain/forecast';
import { pct } from '../domain/money';
import { currentPhase, monthlyInterest, planConfig, targetDebt } from '../domain/plan';
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
  const [simulate, setSimulate] = useState(false);
  const open = checklist.filter(c => !(checks[c.id]?.done ?? c.done)).length;

  return (
    <div>
      <SkyHeader compact title="Финансы" subtitle="Курс к свободе" action={
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => set({ bonus: {} })} className="flex h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-[13.5px] font-medium text-bg"><Gift size={15} strokeWidth={1.8} /> Пришла премия</motion.button>
      } />
      <DebtHero />
      <div className="nv-page nv-stack nf-flow">
        <VoyageActions explore={() => setSimulate(true)} openPrepay={() => {
          set({ planView:'debts' });
          requestAnimationFrame(() => document.getElementById('kurs-prepayment')?.scrollIntoView({ block:'center' }));
        }} />
        <ForecastCard />
      </div>
      {simulate && <Simulator close={() => setSimulate(false)} />}
      <Pager<PlanView> className="mt-5" value={view} onChange={v => set({ planView: v })} pages={[
        { id: 'debts', label: 'Долги', render: () => <DebtsView /> },
        { id: 'strategy', label: 'План', render: () => <StrategyView /> },
        { id: 'checklist', label: <>Задачи{open ? <span className="ml-1 text-sea">{open}</span> : null}</>, render: () => <ChecklistView /> },
      ]} />
    </div>
  );
}

/** Прогноз по модели плана — один на вкладку и сохраняется между открытиями: те же данные — тот же ответ */
let fcCache: { key: unknown[]; value: Forecast } | null = null;
function useDebtForecast(): Forecast {
  const now = useToday();
  const cal = useCal();
  const { debts, incomes, oneOff, templateFrom } = cal;
  const reserve = useLedger().reserve;
  return useMemo(() => {
    const from = `${addMonths(monthKey(now), 1)}-01`;
    const key = [cal, reserve, from];
    if (fcCache && fcCache.key.every((k, i) => k === key[i])) return fcCache.value;
    const value = forecast({ debts, incomes, reserve, from, oneOff, templateFrom, cal });
    fcCache = { key, value };
    return value;
  }, [cal, debts, incomes, reserve, oneOff, templateFrom, now]);
}

/** Оценка журнала и стратегический порядок выплат. */
function DebtHero() {
  const [debts, plan] = useStore(useShallow(s => [s.debts, s.planTrajectory] as const));
  const set = useUi(s => s.set);
  const led = useLedger();
  const total = Object.values(led.debtBalances).reduce((sum, d) => sum + d.estimated, 0);
  const start = plan[0]?.[1] ?? (debts.every(d => d.startBalance > 0) ? debts.reduce((s, d) => s + d.startBalance, 0) : 0);
  const now = useToday();
  const comparable = start > 0 && debts.length > 0;
  const delta = total - start;
  const paidShare = comparable ? Math.min(1, Math.max(0, 1 - total / start)) : 0;
  const fc = useDebtForecast();
  const planEnd = plan.at(-1)?.[0];
  const target = targetDebt(debts);
  const route = [...debts].sort((a, b) => Number(b.closed) - Number(a.closed) || a.order - b.order);
  return (
    <div className="nf-flow mx-4 mt-3">
      <section className="nf-panel nf-debt" aria-label="Общий долг">
        <header className="nf-head"><h2>Общий долг</h2><span className="nf-tag">Оценка по учёту</span></header>
        <p className="nf-total"><Money value={total} kopecks /></p>
        {comparable && <div className="nf-progress" role="meter" aria-label="Снижение долга к началу плана"
          aria-valuenow={Number((paidShare * 100).toFixed(1))}>
          <span style={{ width: `${paidShare * 100}%` }} />
        </div>}
        <div className="nf-kpis">
          {comparable && <div><small>{delta < 0 ? 'Долг уменьшился' : delta > 0 ? 'Долг вырос' : 'Изменение долга'}</small>
            <strong><Money value={Math.abs(delta)} kopecks className="nf-exact" /></strong>
            <small>{plan[0] ? 'К началу плана · ' + monthName(plan[0][0]) : 'К сумме исходных долгов'}</small>
          </div>}
          <div><small>Проценты за месяц</small>
            <strong><Money value={monthlyInterest(debts)} approx className="nf-exact" /></strong>
            <small>По остаткам и ставкам на {ddmm(now)}</small>
          </div>
        </div>
        <header className="nf-head nf-route-head"><h3>Маршрут погашения</h3><Anchor size={18} aria-hidden="true" /></header>
        {target && <p className="nv-meta">Следующая цель · {target.short}</p>}
        <div className="nf-route" data-noswipe tabIndex={0} aria-label="Маршрут погашения">
          {route.map(d => {
            const state = d.closed ? 'closed' : d.id === target?.id ? 'active' : 'next';
            return <button type="button" key={d.id} className="nf-press" data-state={state} onClick={() => set({ debt: d.id })}>
              {d.closed ? <Check size={18} aria-hidden="true" /> : state === 'active' ? <Ship size={21} aria-hidden="true" /> : <Anchor size={17} aria-hidden="true" />}
              <span>{d.short}</span>
              <small>{d.closed ? 'Закрыт' : state === 'active' ? 'Текущая цель' : 'По очереди'}</small>
            </button>;
          })}
          <span><Anchor size={18} aria-hidden="true" /><span>Свобода</span><small>Все долги закрыты</small></span>
        </div>
        <dl className="nf-debt-dates">
          <div><dt>По текущим платежам</dt><dd>{fc.freeMonth ? monthName(fc.freeMonth) : 'Нет даты в пределах 6 лет'}</dd></div>
          <div><dt>Цель стратегии</dt><dd>{planEnd ? monthName(planEnd) : 'Дата не задана'}</dd></div>
        </dl>
      </section>
    </div>
  );
}

/** Мост на кредитке: сколько взято из лимита моста, по неделям и когда гасить. Закрыт — карточки нет. */
function BridgeCard() {
  const [expenses, bridge, debts] = useStore(useShallow(s => [s.expenses, s.bridge, s.debts] as const));
  const st = useMemo(() => bridgeState(expenses, bridge), [expenses, bridge]);
  if (!st || st.bridge.closed) return null;
  const card = debts.find(d => d.id === st.bridge.card)?.short ?? 'кредитке';
  return (
    <details className="mx-4 mt-3 rounded-[24px] border p-4" style={{ background: 'var(--stack-money)', borderColor: 'var(--stack-money-line)' }}>
      <summary className="min-h-11 cursor-pointer text-[13px]" style={{ color: 'var(--stack-money-kicker)' }}>Мост на кредитке {card} · условный сценарий</summary>
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
    </details>
  );
}

function DebtsView() {
  const now = useToday();
  const cal = useCal();
  const debts = useStore(s => s.debts);
  const led = useLedger();
  const set = useUi(s => s.set);
  const [adding, setAdding] = useState(false);
  const [sort, setSort] = useState('strategy');
  const target = targetDebt(debts);
  const fc = useDebtForecast();
  const next = useMemo(() => {
    const ev = eventsBetween(cal, now, addDays(now, 45)).filter(e => e.kind === 'payment' && e.debtId && !cal.marks?.[e.key]?.done && !e.projection);
    return Object.fromEntries(debts.map(d => [d.id, ev.find(e => e.debtId === d.id)]));
  }, [cal, debts, now]);
  const openDebts = debts.filter(d => !d.closed).sort((a, b) => sort === 'rate' ? b.rate - a.rate :
    sort === 'date' ? (next[a.id]?.date ?? '9999').localeCompare(next[b.id]?.date ?? '9999') || a.order - b.order : a.order - b.order);
  const closed = debts.filter(d => d.closed);

  return (
    <>
      <div id="kurs-prepayment"><PrepaymentCard /></div>

      {target && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-[22px] border border-sea/30 bg-sea/8 px-4 py-3.5">
          <Target size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-sea" />
          <div className="text-[13.5px] leading-snug">
            <button type="button" className="text-left font-medium text-sea" onClick={() => set({ debt: target.id })}>Следующая цель · {target.short}</button>
            {next[target.id] && <p className="mt-1 text-muted">Платёж {ddmm(next[target.id]!.date)} · <Money value={next[target.id]!.amount} approx={next[target.id]!.approx} kopecks /></p>}
          </div>
        </div>
      )}

      <section className="nf-flow mt-4 space-y-2.5 px-4" aria-label="Обязательства">
      <header className="nf-head">
        <h2>Обязательства</h2>
        <select className="nf-select" aria-label="Сортировка долгов" value={sort} onChange={event => setSort(event.target.value)}>
          <option value="strategy">По стратегии</option><option value="date">По сроку платежа</option><option value="rate">По ставке</option>
        </select>
      </header>
      <div className="space-y-2.5">
        {openDebts.length === 0 && <Empty>{debts.length ? 'Все долги закрыты. Свобода.' : 'Долгов пока нет.'}</Empty>}
        {openDebts.map((d, i) => <DebtCard key={d.id} n={i + 1} d={d} balance={led.debtBalances[d.id]?.estimated ?? d.balance} next={next[d.id]} closeMonth={fc.closeMonth[d.id]} target={target?.id === d.id} onClick={() => set({ debt: d.id })} />)}
        <button type="button" onClick={() => setAdding(true)} className="nf-add nf-press"><Plus size={16} /> Добавить долг</button>
      </div>
      </section>

      {closed.length > 0 && (
        <details className="card mx-4 mt-4 px-3">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Закрытые ({closed.length})</summary>
          <div className="divide-hair overflow-hidden">
            {closed.map(d => (
              <button key={d.id} type="button" onClick={() => set({ debt: d.id })} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-[14.5px]"><Check size={15} className="text-pos" /> {d.short}</span>
                <span className="text-[12.5px] text-muted">{d.closedOn ? `закрыт ${ddmm(d.closedOn)}, ` : ''}было <Money value={d.startBalance} /></span>
              </button>
            ))}
          </div>
        </details>
      )}
      <BridgeCard />
      <NewDebtSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

/** n — место в очереди закрытия: порядок здесь и есть план (лавина), поэтому номер — не украшение */
function DebtCard({ n, d, balance, next, closeMonth, target, onClick }: { n: number; d: Debt; balance: number; next?: { date: string; amount: number; approx?: boolean; dateMode: string }; closeMonth: string | null; target: boolean; onClick: () => void }) {
  const paid = Math.max(0, d.startBalance - balance);
  const progress = d.startBalance > 0 && paid > 0;
  const late = closeMonth && d.targetClose && closeMonth > d.targetClose;
  const bankMatched = !!d.bankBalance && balance === d.bankBalance.amount;
  return <details className="nf-panel nf-obligation" data-target={target}>
    <summary>
      <span className="nf-obligation-name">
        <span className="nf-debt-position" aria-label={`${n}-й по очереди`}>{n}</span><strong>{d.short}</strong>
        <small>{pct(d.rate)} годовых</small>
      </span>
      <span className="nf-obligation-amount">
        <Money value={balance} approx={!bankMatched} kopecks className="nf-exact" /><small>{bankMatched ? 'По банку' : 'По учёту'}</small>
      </span>
      <span className="nf-obligation-next">
        {next ? <>Платёж {next.dateMode === 'until' ? 'до ' : ''}{ddmm(next.date)} · <Money value={next.amount} approx={next.approx} kopecks className="nf-exact" /></> : 'Платежей в 45 дней нет'}
      </span>
      <ChevronDown className="nf-disclose" size={18} aria-hidden="true" />
      {(target || d.frozen || late) && <span className="nf-debt-status">
        {target && <span>Текущая цель</span>}{d.frozen && <span><Lock size={13} /> Не тратить</span>}{late && <span>Прогноз позже цели</span>}
      </span>}
    </summary>
    <div className="nf-obligation-detail">
      <p>{d.name}</p>
      {progress && <div>Погашено <Money value={paid} kopecks /> из <Money value={d.startBalance} kopecks /><Bar value={paid / d.startBalance} tone={target ? 'sea' : 'pos'} className="mt-1.5" /></div>}
      <p>Цель стратегии · {d.targetClose ? monthName(d.targetClose) : 'дата не задана'}</p>
      <p>{closeMonth ? 'Прогноз при текущих платежах · ' + monthName(closeMonth) : 'Недостаточно данных для расчёта срока'}</p>
      {late && <p className="nv-meta">Цель зависит от будущих выплат и досрочного погашения. Прогноз использует текущие платежи и доступные поступления.</p>}
      <button type="button" onClick={onClick} className="nf-more nf-press">Открыть долг <ChevronRight size={17} aria-hidden="true" /></button>
    </div>
  </details>;
}

function ChecklistView() {
  const now = useToday();
  const [checklist, checks, toggleCheck] = useStore(useShallow(s => [s.checklist, s.checks, s.toggleCheck] as const));
  const set = useUi(s => s.set);
  const marks = useStore(s => s.marks);
  const isDone = (c: ChecklistItem) => checks[c.id]?.done ?? !!(c.done || (c.eventKey && marks[c.eventKey]?.done));
  const waitsForReceipt = (c: ChecklistItem) => !!c.afterReceiptKey && !marks[c.afterReceiptKey]?.done;
  const sorted = [...checklist].sort((a, b) => Number(isDone(a)) - Number(isDone(b)) ||
    Number(waitsForReceipt(a)) - Number(waitsForReceipt(b)) || (a.due ?? '9999').localeCompare(b.due ?? '9999'));
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
          {sorted.map((c, i) => {
            const done = isDone(c);
            const due = done ? null : checklistDue(c, now);
            return (
              <motion.button layout layoutDependency={i} transition={spring} key={c.id} ref={c.id === focus ? focused : undefined} type="button" onClick={() => toggleCheck(c.id)} aria-pressed={done}
                className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-700 ${done ? 'opacity-50' : ''} ${c.id === focus ? 'bg-sea/12' : ''}`}>
                <motion.span animate={{ scale: done ? [1, 1.3, 1] : 1 }} transition={{ duration: 0.35 }} className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border ${done ? 'border-transparent bg-pos text-white' : due === 'overdue' ? 'border-warn' : 'border-line'}`}>{done && <Check size={13} strokeWidth={2.5} />}</motion.span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14.5px] leading-snug ${done ? 'line-through decoration-1' : ''}`}>{c.title}</span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">{done ? 'Выполнено' : waitsForReceipt(c) ? 'После фактического зачисления' : c.afterReceiptKey ? 'Поступление отмечено, проверьте задачу' : due === 'overdue' ? 'Просрочено'
                    : c.status === 'clarify' ? 'Нужно уточнение' : c.status === 'payment' ? 'Ожидает оплаты' : 'Ожидает проверки'}</span>
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

const LIQUIDITY_RULES = [
  'Сначала минимальные платежи и необходимые расходы. Деньги под автосписание готовятся заранее на нужном счёте.',
  'Получение займа увеличивает деньги и обязательства. Подменять им регулярный доход нельзя.',
  'После обязательных платежей проверьте осторожный прогноз и целевой защитный запас.',
  'Учитывайте подтверждённый факт зачисления отдельно от расчёта выплаты и реально выполненного погашения.',
  'Квартальные и годовые премии сверяйте по факту. Ежемесячная премия входит в регулярный расчёт.',
  'Сравнивайте расходы на обслуживание и документированную экономию. Досрочно направляйте только безопасную сумму.',
];

function DebtActivityPanel() {
  const now = useToday();
  const [book, expenses, snapshots, debts] = useStore(useShallow(s => [s.accountBook, s.expenses, s.snapshots, s.debts] as const));
  const month = monthKey(now);
  const activity = monthDebtActivity(book, expenses, now);
  const led = useLedger();
  const start = snapshots.filter(s => s.month < month).at(-1);
  const end = Object.values(led.debtBalances).reduce((sum, info) => sum + info.estimated, 0);
  const confirmed = debts.every(d => d.closed || (d.bankBalance?.date === now && Math.abs(led.debtBalances[d.id]?.delta ?? 0) < 0.01));
  return <div className="card mx-4 space-y-2 p-4 text-[13px]">
    <h3 className="font-medium">Чистое изменение долга за месяц</h3>
    {start && <div className="flex justify-between"><span>Предыдущий снимок</span><Money value={start.total} /></div>}
    <div className="flex justify-between"><span>Заёмные зачисления</span><Money value={activity.loanDisbursements} kopecks /></div>
    <div className="flex justify-between"><span>Операции по кредиткам</span><Money value={activity.creditOperations} kopecks /></div>
    <div className="flex justify-between"><span>Покупки с кредиток</span><Money value={activity.creditPurchases} kopecks /></div>
    <div className="flex justify-between"><span>Подтверждённые проценты и комиссии</span><Money value={activity.interestAndFees} sign /></div>
    <div className="flex justify-between"><span>Подтверждённое тело платежей</span><Money value={-activity.principal} sign /></div>
    <div className="flex justify-between"><span>Долг {confirmed ? 'по банку' : 'по учёту'}</span><Money value={end} approx={!confirmed} /></div>
    {start && <div className="flex justify-between"><span>Изменение относительно снимка</span><Money value={end - start.total} sign approx={!confirmed} /></div>}
    {activity.unknownPrincipal > 0 && <p className="text-muted">Для платежей на <Money value={activity.unknownPrincipal} /> пока нет разбивки.</p>}
  </div>;
}

function PlanChart() {
  const now = useToday();
  const [plan, baseline, snapshots] = useStore(useShallow(s => [s.planTrajectory, s.baselineTrajectory, s.snapshots] as const));
  const led = useLedger();
  const fc = useDebtForecast();
  const cur = monthKey(now);
  const total = Object.values(led.debtBalances).reduce((sum, row) => sum + row.estimated, 0);
  const fact: [string, number][] = [...snapshots.filter(s => s.month < cur).map(s => [s.month, s.total] as [string, number]),
    [cur, total] as [string, number]].sort((a, b) => a[0].localeCompare(b[0]));
  const comparison: [string, number][] = [fact[fact.length - 1], ...fc.trajectory.filter(p => p[0] > cur)];
  if (!plan.length && fact.length < 2) return null;
  return <details className="card mx-4 mt-3 p-4">
    <summary className="min-h-11 cursor-pointer py-2 font-medium">План и факт</summary>
    <p className="mb-3 text-xs text-muted">Долг в рублях · срез {ddmm(now)}. Пунктир — прогноз при текущих платежах. Отдельная линия показывает только минимальные платежи.</p>
    <DebtChart plan={plan} fact={fact} forecast={comparison} baseline={baseline} />
  </details>;
}

function StrategyView() {
  const now = useToday();
  const [debts, strategy, rules] = useStore(useShallow(s => [s.debts, s.strategy, s.rules] as const));
  const phases = planConfig().phases;
  const cur = currentPhase(debts, now);
  const closedNames = (p: number) => debts.filter(d => d.phase === p).every(d => d.closed);
  return (
    <>
      <PlanChart />
      <SectionTitle>Ликвидность</SectionTitle>
      <DebtActivityPanel />
      <ul className="card mx-4 mt-3 list-disc space-y-2 py-4 pl-8 pr-4 text-[13px]">
        {LIQUIDITY_RULES.map(rule => <li key={rule}>{rule}</li>)}
      </ul>
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

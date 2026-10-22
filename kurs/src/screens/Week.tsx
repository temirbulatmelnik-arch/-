import { ChevronRight, FileUp, Hourglass, PiggyBank, Plus, Settings as Cog, Vault } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertRow, EventRow, ExpenseRow } from '../components/rows';
import { Bar, CatIcon, Empty, IconButton, LinkButton, Money, SectionTitle } from '../components/ui';
import { eventsBetween } from '../domain/calendar';
import { addDays, dayMonth, ddmm, fromKey, monthIn, plural, weekdayFull } from '../domain/dates';
import { BIG_PURCHASE_HOURS, currentPhase, phaseByDate, reserveNeed, totalDebt } from '../domain/plan';
import { alerts as buildAlerts, type Alert, weekSummary } from '../domain/summary';
import { weekReport, weekToClose } from '../domain/weekly';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';

export function Week() {
  const now = useToday();
  const cal = useCal();
  const [expenses, debts, marks, wishes, reserve, savings, settings, overrides, startTotal, closures, checklist, checks] = useStore(useShallow(s => [
    s.expenses, s.debts, s.marks, s.wishes, s.reserve, s.savings, s.settings, s.weeklyOverrides, s.planTrajectory[0]?.[1] ?? 0, s.closures, s.checklist, s.checks,
  ] as const));
  const ui = useUi();
  const week = useMemo(() => weekSummary(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const phase = currentPhase(debts, now);
  const planPhase = phaseByDate(now);
  const list = useMemo(() => buildAlerts({ cal, marks, expenses, wishes, now, nowMs: Date.now(), lastBackupAt: settings.lastBackupAt, lastIcsAt: settings.lastIcsAt, checklist, checks }),
    [cal, marks, expenses, wishes, now, settings.lastBackupAt, settings.lastIcsAt, checklist, checks]);
  const upcoming = useMemo(() => eventsBetween(cal, now, addDays(now, 7)).filter(e => e.kind !== 'weekly' && !marks[e.key]?.done && !list.some(a => a.id === e.key)).slice(0, 4), [cal, now, marks, list]);
  const pending = wishes.filter(w => !w.resolved);
  const debt = totalDebt(debts);
  const over = week.left < 0;
  const spentShare = week.limit ? week.spent / week.limit : 0;
  const { need, next } = reserveNeed(now, debts);
  const weeksSaved = Object.values(closures).filter(c => c.transferred > 0).length;

  // в выходные и в начале недели — предложить закрыть неделю
  const closeMonday = weekToClose(now, closures);
  const dow = fromKey(now).getDay();
  const offerClose = !closures[closeMonday] && (dow === 0 || dow === 6 || closeMonday < week.monday);
  const closing = useMemo(() => (offerClose ? weekReport(expenses, debts, overrides, closeMonday) : null), [offerClose, expenses, debts, overrides, closeMonday]);

  const onAlert = (a: Alert) => {
    if (a.action === 'pay' || a.action === 'weekly') ui.set({ event: a.event ?? null });
    else if (a.action === 'income') ui.set({ bonus: { event: a.event } });
    else if (a.action === 'backup' || a.action === 'calendar') ui.set({ settings: true });
    else if (a.action === 'check') ui.setTab('plan');
    else if (a.action === 'wish') document.getElementById('wishes')?.scrollIntoView({ behavior: 'smooth' });
    else if (a.id === 'credit') ui.setTab('budget');
  };

  return (
    <div>
      <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div>
          <div className="text-[13px] text-muted first-letter:uppercase">{weekdayFull(now)}, {dayMonth(now)}</div>
          <div className="mt-0.5 text-[15px] font-medium">
            Этап {phase.id} · {phase.title}
            {phase.id < planPhase.id && planPhase.id > 0 && <span className="ml-2 text-[12.5px] font-normal text-warn">по плану уже этап {planPhase.id}</span>}
          </div>
        </div>
        <IconButton onClick={() => ui.set({ settings: true })} label="Настройки"><Cog size={18} strokeWidth={1.5} /></IconButton>
      </header>

      <section className="black-card mx-4 px-6 pt-6 pb-5">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-card-muted">Неделя · {ddmm(week.monday)}–{ddmm(week.sunday)}</span>
          <span className="text-[12px] text-card-muted">из <Money value={week.limit} /></span>
        </div>
        <div className="mt-5 text-[13px] text-card-muted">{over ? 'Перерасход недели' : 'Можно потратить'}</div>
        <motion.div key={Math.round(week.left)} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className={`figure mt-1 text-[58px] leading-none ${over ? 'text-[#f2a596]' : ''}`}>
          <Money value={Math.abs(week.left)} />
        </motion.div>
        <Bar value={spentShare} marker={week.timeShare} tone={over ? 'neg' : 'card'} onCard className="mt-6" />
        <div className="mt-3 flex justify-between text-[12.5px] text-card-muted">
          <span>{over ? 'до понедельника — только необходимое' : <>≈ <Money value={week.perDay} className="text-card" /> в день</>}</span>
          <span>{week.daysLeft} {plural(week.daysLeft, 'день', 'дня', 'дней')} до понедельника</span>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3 px-4">
        <button type="button" onClick={() => ui.set({ reserve: true })} className="card p-4 text-left">
          <div className="flex items-center justify-between text-muted"><span className="text-[12.5px]">Резерв</span><Vault size={16} strokeWidth={1.5} /></div>
          <Money value={reserve} className="figure mt-2 block text-[26px] leading-none" />
          <div className={`mt-2 text-[11.5px] leading-snug ${reserve < need ? 'text-warn' : 'text-faint'}`}>держит <Money value={need} /> до премии {monthIn(next)}</div>
        </button>
        <button type="button" onClick={() => ui.set({ savings: true })} className="card p-4 text-left">
          <div className="flex items-center justify-between text-muted"><span className="text-[12.5px]">Остатки недель</span><PiggyBank size={16} strokeWidth={1.5} /></div>
          <Money value={savings} className="figure mt-2 block text-[26px] leading-none" />
          <div className="mt-2 text-[11.5px] leading-snug text-faint">{weeksSaved ? `${weeksSaved} ${plural(weeksSaved, 'неделя', 'недели', 'недель')} с остатком` : 'отдельный счёт'}</div>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-3 px-4">
        <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => ui.set({ add: {} })}
          className="bg-brass-grad flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[15.5px] font-semibold text-on-brass">
          <Plus size={19} strokeWidth={2} /> Трата
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => ui.set({ scan: true })}
          className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-[15px] font-medium">
          <FileUp size={18} strokeWidth={1.5} /> Выписка
        </motion.button>
      </div>

      {closing && (
        <button type="button" onClick={() => ui.set({ week: closeMonday })} className="card mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-4 p-4 text-left">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brass/12 text-brass"><PiggyBank size={18} strokeWidth={1.5} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium">Закрыть неделю {ddmm(closeMonday)}–{ddmm(addDays(closeMonday, 6))}</span>
            <span className="block text-[12.5px] text-muted">
              {closing.left > 0 ? <>Остаток <Money value={closing.left} /> — на счёт остатков. </> : closing.left < 0 ? <>Перерасход <Money value={-closing.left} />. </> : null}
              Сначала загрузите выписку.
            </span>
          </span>
          <ChevronRight size={16} className="text-faint" />
        </button>
      )}

      {list.length > 0 && (
        <>
          <SectionTitle>Внимание</SectionTitle>
          <div className="card divide-hair mx-4 overflow-hidden">{list.map(a => <AlertRow key={a.id} a={a} now={now} onClick={() => onAlert(a)} />)}</div>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <SectionTitle action={<LinkButton onClick={() => ui.setTab('payments')}>Все платежи</LinkButton>}>Ближайшие 7 дней</SectionTitle>
          <div className="card divide-hair mx-4 overflow-hidden">
            {upcoming.map(e => <EventRow key={e.key} e={e} mark={marks[e.key]} now={now} onClick={() => ui.set({ event: e })} />)}
          </div>
        </>
      )}

      {pending.length > 0 && (
        <div id="wishes">
          <SectionTitle>Пауза 48 часов</SectionTitle>
          <div className="card divide-hair mx-4 overflow-hidden">{pending.map(w => <WishRow key={w.id} id={w.id} />)}</div>
        </div>
      )}

      <SectionTitle action={<span className="text-[12.5px] text-muted">{week.expenses.length ? <Money value={week.spent} /> : null}</span>}>Траты недели</SectionTitle>
      {week.expenses.length ? (
        <div className="card divide-hair mx-4 overflow-hidden">
          {[...week.expenses].reverse().map(e => <ExpenseRow key={e.id} e={e} onClick={() => ui.set({ add: { edit: e } })} />)}
        </div>
      ) : <div className="px-4"><Empty>На этой неделе трат пока нет. Записывайте по ходу или загрузите выписку в воскресенье.</Empty></div>}

      <button type="button" onClick={() => ui.setTab('plan')} className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center justify-between rounded-[22px] px-4 py-3 text-left text-[13px] text-muted">
        <span>Общий долг <Money value={debt} className="text-ink" />{startTotal > debt ? <span className="text-pos"> · −<Money value={startTotal - debt} /> с начала</span> : null}</span>
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

function WishRow({ id }: { id: string }) {
  const w = useStore(s => s.wishes.find(x => x.id === id))!;
  const resolve = useStore(s => s.resolveWish);
  const set = useUi(s => s.set);
  const left = Date.parse(w.createdAt) + BIG_PURCHASE_HOURS * 3600_000 - Date.now();
  const ready = left <= 0;
  const h = Math.ceil(left / 3600_000);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <CatIcon id={w.category} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-medium">{w.title}</div>
        <div className={`flex items-center gap-1 text-[12px] ${ready ? 'text-pos' : 'text-muted'}`}>
          <Hourglass size={11} /> {ready ? 'можно решать' : `ещё ${h} ${plural(h, 'час', 'часа', 'часов')}`} · <Money value={w.amount} />
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button type="button" onClick={() => resolve(w.id, 'skipped')} className="rounded-full bg-pos/12 px-3 py-1.5 text-[12.5px] font-medium text-pos">Не нужно</button>
        {ready && <button type="button" onClick={() => set({ add: { amount: w.amount, category: w.category, note: w.title, wishId: w.id } })} className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-medium">Купить</button>}
      </div>
    </div>
  );
}

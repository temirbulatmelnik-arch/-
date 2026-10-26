import { ChevronRight, FileUp, Hourglass, PiggyBank, Plus, Settings as Cog } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertRow, EventRow, ExpenseRow } from '../components/rows';
import { DayRing } from '../components/DayRing';
import { SkyButton, WeekScene } from '../components/Petersburg';
import { CatIcon, Empty, LinkButton, Money, SectionTitle } from '../components/ui';
import { useCountUp } from '../components/useCountUp';
import { eventsBetween } from '../domain/calendar';
import { addDays, dayMonth, ddmm, fromKey, monthIn, plural, weekdayFull, weekRange } from '../domain/dates';
import { BIG_PURCHASE_HOURS, currentPhase, phaseByDate, reserveNeed, totalDebt } from '../domain/plan';
import { alerts as buildAlerts, type Alert, dayBudget, weekSummary } from '../domain/summary';
import { weekReport, weekToClose } from '../domain/weekly';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';

export function Week() {
  const now = useToday();
  const cal = useCal();
  const [expenses, debts, marks, wishes, reserve, settings, overrides, startTotal, closures, checklist, checks] = useStore(useShallow(s => [
    s.expenses, s.debts, s.marks, s.wishes, s.reserve, s.settings, s.weeklyOverrides, s.planTrajectory[0]?.[1] ?? 0, s.closures, s.checklist, s.checks,
  ] as const));
  const ui = useUi();
  const week = useMemo(() => weekSummary(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const today = useMemo(() => dayBudget(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const phase = currentPhase(debts, now);
  const planPhase = phaseByDate(now);
  const list = useMemo(() => buildAlerts({ cal, marks, expenses, wishes, now, nowMs: Date.now(), lastBackupAt: settings.lastBackupAt, lastIcsAt: settings.lastIcsAt, checklist, checks }),
    [cal, marks, expenses, wishes, now, settings.lastBackupAt, settings.lastIcsAt, checklist, checks]);
  const upcoming = useMemo(() => eventsBetween(cal, now, addDays(now, 7)).filter(e => e.kind !== 'weekly' && !marks[e.key]?.done && !list.some(a => a.id === e.key)).slice(0, 4), [cal, now, marks, list]);
  const pending = wishes.filter(w => !w.resolved);
  const debt = totalDebt(debts);
  const over = week.left < 0;
  const shown = useCountUp(Math.abs(week.left));
  const { need, next } = reserveNeed(now, debts);
  // воскресное пополнение карты жизни: лимит следующей недели минус то, что на ней осталось
  const current = useMemo(() => weekReport(expenses, debts, overrides, week.monday), [expenses, debts, overrides, week.monday]);
  const topped = closures[week.monday]?.topUp;

  // в выходные и в начале недели — предложить закрыть неделю
  const closeMonday = weekToClose(now, closures);
  const dow = fromKey(now).getDay();
  const offerClose = !closures[closeMonday] && (dow === 0 || dow === 6 || closeMonday < week.monday);
  const closing = useMemo(() => (offerClose ? weekReport(expenses, debts, overrides, closeMonday) : null), [offerClose, expenses, debts, overrides, closeMonday]);

  const onAlert = (a: Alert) => {
    if (a.action === 'pay' || a.action === 'weekly') ui.set({ event: a.event ?? null });
    else if (a.action === 'income') ui.set({ bonus: { event: a.event } });
    else if (a.action === 'backup') ui.set({ settings: true, settingsFocus: 'backup' });
    else if (a.action === 'calendar') ui.set({ settings: true, settingsFocus: 'reminders' });
    else if (a.action === 'check') { ui.set({ planView: 'checklist', focus: a.id.replace(/^check:/, '') }); ui.setTab('plan'); }
    else if (a.action === 'wish') document.getElementById('wishes')?.scrollIntoView({ behavior: 'smooth' });
    else if (a.id === 'credit') ui.setTab('budget');
  };

  return (
    <div>
      <WeekScene today={(fromKey(now).getDay() + 6) % 7}>
        <div className="flex items-start justify-between gap-3 px-5 pt-2.5">
          <div style={{ color: 'var(--scene-ink)' }}>
            <div className="text-[14px] first-letter:uppercase" style={{ color: 'var(--scene-muted)' }}>{weekdayFull(now)}, {dayMonth(now)}</div>
            <div className="font-display mt-0.5 text-[19px] font-medium">Неделя {weekRange(week.monday, week.sunday)}</div>
          </div>
          <span className="pointer-events-auto"><SkyButton onClick={() => ui.set({ settings: true })} label="Настройки"><Cog size={18} strokeWidth={1.5} /></SkyButton></span>
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-3 pr-4 pl-5">
          <div className="pt-3" style={{ color: over ? 'var(--neg)' : 'var(--scene-ink)' }}>
            <div className="figure text-[36px] leading-[.95]" aria-live="polite">
              {over && <span className="mr-0.5">−</span>}<Money value={shown} />
            </div>
            <div className="mt-1.5 text-[14px] leading-snug" style={{ color: over ? 'var(--neg)' : 'var(--scene-muted)' }}>
              {over ? <>перерасход<br />за неделю</> : <>на неделю,<br />до воскресенья</>}
            </div>
          </div>
          <DayRing day={today.day} left={today.left} />
        </div>
        {(today.left < 0 || today.exhausted) && (
          <p className="sc-pop mx-5 mt-3 rounded-2xl border px-3.5 py-2.5 text-[14px] leading-snug backdrop-blur-md"
            style={{ background: 'var(--pill)', borderColor: 'var(--pill-border)', color: 'var(--scene-ink)' }}>
            {today.exhausted ? (
              <><span className="font-medium" style={{ color: 'var(--ring-neg)' }}>Недельный лимит исчерпан,</span> до понедельника только необходимое</>
            ) : today.nextWeek ? (
              <><span className="font-medium" style={{ color: 'var(--ring-neg)' }}>Сегодня перерасход <Money value={-today.left} />.</span> С понедельника новая неделя: <Money value={today.tomorrow} /> в день</>
            ) : (
              <><span className="font-medium" style={{ color: 'var(--ring-neg)' }}>Сегодня перерасход <Money value={-today.left} />,</span> поэтому с завтра лимит <Money value={today.tomorrow} /> в день</>
            )}
          </p>
        )}
      </WeekScene>

      <div className="mt-1 grid grid-cols-2 px-5">
        <button type="button" onClick={() => ui.set({ reserve: true })} className="border-r border-line pr-4 text-left">
          <span className="text-[13px] text-muted">Резерв</span>
          <Money value={reserve} className="figure mt-1 block text-[21px] leading-tight" />
          <span className={`mt-1 block text-[12px] leading-snug ${reserve < need ? 'text-warn' : 'text-muted'}`}>держит <Money value={need} /> до премии {monthIn(next)}</span>
        </button>
        <button type="button" onClick={() => ui.set({ week: week.monday })} className="pl-4 text-left">
          <span className="text-[13px] text-muted">{topped != null ? 'Долито в воскресенье' : 'Долить в воскресенье'}</span>
          <Money value={topped ?? current.topUp} className="figure mt-1 block text-[21px] leading-tight" />
          <span className="mt-1 block text-[12px] leading-snug text-muted">
            {topped != null ? 'из резерва на карту жизни' : current.leftover > 0 ? <>из резерва; <Money value={current.leftover} /> останется на карте</> : 'из резерва, до полного лимита'}
          </span>
        </button>
      </div>

      <div className="mt-4 grid grid-cols-[1.4fr_1fr] gap-3 px-4">
        <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => ui.set({ add: {} })}
          className="flex h-[54px] items-center justify-center gap-2 rounded-[18px] bg-ink text-[15.5px] font-medium text-bg">
          <Plus size={19} strokeWidth={2} /> Записать трату
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => ui.set({ scan: true })}
          className="flex h-[54px] items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-ink text-[15px] font-medium">
          <FileUp size={18} strokeWidth={1.5} /> Выписка
        </motion.button>
      </div>

      {closing && (
        <button type="button" onClick={() => ui.set({ week: closeMonday })} className="card mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-4 p-4 text-left">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sea/12 text-sea"><PiggyBank size={18} strokeWidth={1.5} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium">Закрыть неделю {ddmm(closeMonday)}–{ddmm(addDays(closeMonday, 6))}</span>
            <span className="block text-[12.5px] leading-snug text-muted">
              Долить на карту жизни из резерва <Money value={closing.topUp} className="text-ink" />
              {closing.leftover > 0 ? <>: остаток <Money value={closing.leftover} /> уже на ней</> : closing.left < 0 ? <>: перерасход <Money value={-closing.left} /></> : ''}.
              {' '}Сначала загрузите выписку.
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

      <button type="button" onClick={() => ui.setTab('plan')} className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-between gap-3 rounded-[20px] px-4 py-3 text-left text-[13px] text-muted">
        <span className="min-w-0">
          <span className="block text-ink">Этап {phase.id}: {phase.title}</span>
          {phase.id < planPhase.id && planPhase.id > 0 && <span className="block text-warn">по плану уже этап {planPhase.id}</span>}
          <span className="block">Общий долг <Money value={debt} className="text-ink" />{startTotal > debt ? <span className="text-pos">, уже −<Money value={startTotal - debt} /></span> : null}</span>
        </span>
        <ChevronRight size={15} className="shrink-0" />
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
          <Hourglass size={11} /> {ready ? 'можно решать' : `ещё ${h} ${plural(h, 'час', 'часа', 'часов')}`}, <Money value={w.amount} />
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button type="button" onClick={() => resolve(w.id, 'skipped')} className="rounded-full bg-pos/12 px-3 py-1.5 text-[12.5px] font-medium text-pos">Не нужно</button>
        {ready && <button type="button" onClick={() => set({ add: { amount: w.amount, category: w.category, note: w.title, wishId: w.id } })} className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-medium">Купить</button>}
      </div>
    </div>
  );
}

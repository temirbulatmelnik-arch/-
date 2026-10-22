import { Camera, ChevronRight, Hourglass, Plus, Settings as Cog } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertCard, EventRow, ExpenseRow } from '../components/rows';
import { Bar, Chip, Empty, IconButton, SectionTitle } from '../components/ui';
import { eventsBetween } from '../domain/calendar';
import { addDays, dayMonth, ddmm, plural, weekdayFull } from '../domain/dates';
import { rub } from '../domain/money';
import { BIG_PURCHASE_HOURS, CATEGORY, currentPhase, phaseByDate, totalDebt } from '../domain/plan';
import { alerts as buildAlerts, type Alert, weekSummary } from '../domain/summary';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';

export function Week() {
  const now = useToday();
  const cal = useCal();
  const [expenses, debts, marks, wishes, reserve, settings, overrides, startTotal] = useStore(useShallow(s => [
    s.expenses, s.debts, s.marks, s.wishes, s.reserve, s.settings, s.weeklyOverrides, s.planTrajectory[0]?.[1] ?? 0,
  ]));
  const ui = useUi();
  const week = useMemo(() => weekSummary(expenses, debts, overrides, now), [expenses, debts, overrides, now]);
  const phase = currentPhase(debts, now);
  const planPhase = phaseByDate(now);
  const list = useMemo(() => buildAlerts({ cal, marks, expenses, wishes, now, nowMs: Date.now(), lastBackupAt: settings.lastBackupAt, lastIcsAt: settings.lastIcsAt }), [cal, marks, expenses, wishes, now, settings.lastBackupAt, settings.lastIcsAt]);
  const upcoming = useMemo(() => eventsBetween(cal, now, addDays(now, 10)).filter(e => e.kind !== 'weekly' && !marks[e.key]?.done && !list.some(a => a.id === e.key)).slice(0, 5), [cal, now, marks, list]);
  const pending = wishes.filter(w => !w.resolved);
  const debt = totalDebt(debts);
  const over = week.left < 0;
  const spentShare = week.limit ? week.spent / week.limit : 0;

  const onAlert = (a: Alert) => {
    if (a.action === 'pay' || a.action === 'weekly') ui.set({ event: a.event ?? null });
    else if (a.action === 'income') ui.set({ bonus: { event: a.event } });
    else if (a.action === 'backup' || a.action === 'calendar') ui.set({ settings: true });
    else if (a.action === 'wish') document.getElementById('wishes')?.scrollIntoView({ behavior: 'smooth' });
    else if (a.id === 'credit') ui.setTab('budget');
  };

  return (
    <div>
      <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <div className="eyebrow text-muted">{weekdayFull(now)}, {dayMonth(now)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Chip tone="accent">Этап {phase.id} · {phase.title}</Chip>
            {phase.id < planPhase.id && planPhase.id > 0 && <Chip tone="warn">по плану уже этап {planPhase.id}</Chip>}
          </div>
        </div>
        <IconButton onClick={() => ui.set({ settings: true })} label="Настройки" className="bg-surface"><Cog size={20} /></IconButton>
      </header>

      <section className="hero mx-4 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-semibold text-hero-muted">{over ? 'Перерасход недели' : 'Осталось на неделю'}</span>
          <span className="text-[13px] font-semibold text-hero-muted">из {rub(week.limit)}</span>
        </div>
        <motion.div key={week.left} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className={`mt-1 text-[52px] leading-none font-extrabold tracking-tight ${over ? 'text-[#ff9b9b]' : ''}`}>
          {rub(Math.abs(week.left))}
        </motion.div>
        <Bar value={spentShare} marker={week.timeShare} tone={over ? 'danger' : spentShare > week.timeShare + 0.15 ? 'warn' : 'hero'} className="mt-4" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/8 p-3">
            <div className="text-[12px] font-semibold text-hero-muted">Можно в день</div>
            <div className="mt-0.5 text-[22px] font-extrabold">{over ? '0 ₽' : rub(week.perDay)}</div>
          </div>
          <div className="rounded-2xl bg-white/8 p-3">
            <div className="text-[12px] font-semibold text-hero-muted">До понедельника</div>
            <div className="mt-0.5 text-[22px] font-extrabold">{week.daysLeft} {plural(week.daysLeft, 'день', 'дня', 'дней')}</div>
          </div>
        </div>
        {over && <p className="mt-3 text-[13px] leading-snug text-[#ffd0d0]">Лимит кончился — до понедельника только самое необходимое. Резерв на жизнь не трогаем.</p>}
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => ui.set({ add: {} })}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#7ee2b8] text-[17px] font-extrabold text-[#06251a]">
            <Plus size={22} strokeWidth={3} /> Трата
          </motion.button>
          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => ui.set({ scan: true })} aria-label="Загрузить скриншот или выписку"
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/12 px-5 text-[15px] font-bold">
            <Camera size={20} /> Скрин
          </motion.button>
        </div>
      </section>

      {list.length > 0 && <div className="mt-4 space-y-2.5 px-4">{list.map(a => <AlertCard key={a.id} a={a} now={now} onClick={() => onAlert(a)} />)}</div>}

      {upcoming.length > 0 && (
        <>
          <SectionTitle action={<button type="button" onClick={() => ui.setTab('calendar')} className="text-[14px] font-semibold text-accent">Весь календарь</button>}>Ближайшие 10 дней</SectionTitle>
          <div className="card mx-4 divide-y divide-line overflow-hidden">
            {upcoming.map(e => <EventRow key={e.key} e={e} mark={marks[e.key]} now={now} onClick={() => ui.set({ event: e })} />)}
          </div>
        </>
      )}

      {pending.length > 0 && (
        <div id="wishes">
          <SectionTitle>Пауза 48 часов</SectionTitle>
          <div className="card mx-4 divide-y divide-line overflow-hidden">
            {pending.map(w => <WishRow key={w.id} id={w.id} />)}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5 px-4">
        <button type="button" onClick={() => ui.set({ reserve: true })} className="card p-4 text-left">
          <div className="text-[12.5px] font-semibold text-muted">Резерв</div>
          <div className="mt-1 text-[20px] font-extrabold">{rub(reserve)}</div>
          <div className="mt-1 text-[12px] text-faint">нехватка и срочное</div>
        </button>
        <button type="button" onClick={() => ui.setTab('debts')} className="card p-4 text-left">
          <div className="text-[12.5px] font-semibold text-muted">Долг</div>
          <div className="mt-1 text-[20px] font-extrabold">{rub(debt)}</div>
          {startTotal > 0 && <div className="mt-1 text-[12px] font-semibold text-accent">−{rub(Math.max(0, startTotal - debt))} с начала</div>}
        </button>
      </div>

      <SectionTitle action={<span className="text-[13px] font-semibold text-muted">{ddmm(week.monday)}–{ddmm(week.sunday)}</span>}>Траты недели</SectionTitle>
      {week.expenses.length ? (
        <div className="card mx-4 divide-y divide-line overflow-hidden">
          {[...week.expenses].reverse().map(e => <ExpenseRow key={e.id} e={e} onClick={() => ui.set({ add: { edit: e } })} />)}
        </div>
      ) : <div className="px-4"><Empty>Пока ни одной траты на этой неделе. Нажмите «Трата» или загрузите скриншот из банка.</Empty></div>}
      <p className="px-6 pt-3 text-center text-[12px] text-faint">Фикс (связь, спортзал, подписки) и траты из резерва в недельный лимит не входят.</p>
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
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[19px]">{CATEGORY[w.category].emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{w.title}</div>
        <div className={`flex items-center gap-1 text-[12.5px] font-medium ${ready ? 'text-accent' : 'text-muted'}`}>
          <Hourglass size={12} /> {ready ? 'можно решать' : `ещё ${h} ${plural(h, 'час', 'часа', 'часов')}`} · {rub(w.amount)}
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button type="button" onClick={() => resolve(w.id, 'skipped')} className="rounded-xl bg-accent/12 px-3 py-2 text-[13px] font-bold text-accent">Не нужно</button>
        {ready && <button type="button" onClick={() => set({ add: { amount: w.amount, category: w.category, note: w.title, wishId: w.id } })} className="flex items-center rounded-xl bg-surface-2 px-2.5 py-2 text-[13px] font-bold">Купить <ChevronRight size={14} /></button>}
      </div>
    </div>
  );
}

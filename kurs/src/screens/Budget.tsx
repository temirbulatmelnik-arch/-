// «Траты» — куда ушли деньги. Месяц против лимитов этапа: «прилив» из цветов категорий, категории с полосами,
// недели месяца, поиск и фильтры, все траты по дням. Нажатие на категорию — фильтр; свайп влево — изменить, удалить.
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, CreditCard, Pencil, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { item, list as listAnim, Roll, spring, SwipeRow } from '../components/motion';
import { SkyButton, SkyHeader } from '../components/Petersburg';
import { ExpenseRow } from '../components/rows';
import { CAT_COLOR, CatIcon, Empty, Money } from '../components/ui';
import { addDays, addMonths, ddmm, monthKey, monthName, weekday, weekStart } from '../domain/dates';
import { CATEGORY, currentPhase, weeklyLimit } from '../domain/plan';
import { countsWeekly, monthByCategory } from '../domain/summary';
import type { CategoryId, Expense, Source } from '../domain/types';
import { useStore } from '../store/store';
import { toast, useToday, useUi } from '../store/ui';


type SourceFilter = 'all' | Source;
const SOURCES: { id: SourceFilter; label: string }[] = [{ id: 'all', label: 'Все' }, { id: 'life', label: 'Карта' }, { id: 'credit', label: 'Кредитка' }, { id: 'reserve', label: 'Резерв' }];

export function Budget() {
  const now = useToday();
  const [expenses, debts, wishes, overrides] = useStore(useShallow(s => [s.expenses, s.debts, s.wishes, s.weeklyOverrides] as const));
  const set = useUi(s => s.set);
  const [month, setMonth] = useState(monthKey(now));
  const [cat, setCat] = useState<CategoryId | null>(null);
  const [source, setSource] = useState<SourceFilter>('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => monthByCategory(expenses, debts, month), [expenses, debts, month]);
  const monthList = useMemo(() => expenses.filter(e => monthKey(e.date) === month), [expenses, month]);
  const phase = currentPhase(debts, `${month}-15`);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const limit = rows.reduce((s, r) => s + r.limit, 0);
  const baseline = rows.reduce((s, r) => s + r.baseline, 0);
  const credit = monthList.filter(e => e.source === 'credit');
  const fromReserve = monthList.filter(e => e.source === 'reserve').reduce((s, e) => s + e.amount, 0);
  const saved = wishes.filter(w => w.resolved === 'skipped').reduce((s, w) => s + w.amount, 0);
  const shown = rows.filter(r => r.spent > 0).sort((a, b) => b.spent - a.spent);

  // недели месяца: потрачено против лимита недели
  const weeks = useMemo(() => {
    const out: { monday: string; spent: number; limit: number }[] = [];
    for (let m = weekStart(`${month}-01`); monthKey(m) <= month && m <= now; m = addDays(m, 7)) {
      if (monthKey(addDays(m, 6)) < month) continue;
      const list = expenses.filter(e => e.date >= m && e.date <= addDays(m, 6) && countsWeekly(e));
      out.push({ monday: m, spent: list.reduce((s, e) => s + e.amount, 0), limit: weeklyLimit(debts, m, overrides) });
    }
    return out.reverse();
  }, [expenses, debts, overrides, month, now]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => monthList.filter(e =>
    (!cat || e.category === cat) && (source === 'all' || e.source === source) &&
    (!needle || `${e.note ?? ''} ${CATEGORY[e.category].short}`.toLowerCase().includes(needle) || String(Math.round(e.amount)).includes(needle)),
  ).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [monthList, cat, source, needle]);
  const byDay = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of filtered) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [filtered]);
  const filteredSum = filtered.reduce((s, e) => s + e.amount, 0);
  const remove = (e: Expense) => { useStore.getState().removeExpense(e.id); toast(`Удалено: ${e.note || CATEGORY[e.category].short}`); };

  return (
    <div>
      <SkyHeader
        title="Траты"
        subtitle={<button type="button" onClick={() => setMonth(monthKey(now))} className="text-left first-letter:uppercase">{monthName(month)}{month !== monthKey(now) ? ', к текущему' : ''}</button>}
        action={
          <div className="flex gap-2">
            <SkyButton onClick={() => setMonth(addMonths(month, -1))} label="Предыдущий месяц"><ChevronLeft size={18} strokeWidth={1.7} /></SkyButton>
            <SkyButton onClick={() => setMonth(addMonths(month, 1))} label="Следующий месяц"><ChevronRight size={18} strokeWidth={1.7} /></SkyButton>
          </div>
        } />

      <section className="deep-card mx-4 mt-3 px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-card-muted">Потрачено за месяц</span>
          <span className="text-[12.5px] text-card-muted">лимит этапа {phase.id}: <Money value={limit} className="text-card" /></span>
        </div>
        <span className={`figure mt-1 block text-[42px] leading-none ${spent > limit ? 'text-[#f2a596]' : ''}`}><Roll value={spent} /></span>
        {/* прилив: доли категорий в лимите месяца; нажатие на полосу — фильтр */}
        <div className="mt-5 flex h-3.5 overflow-hidden rounded-full bg-card/12" role="group" aria-label="Категории месяца">
          {shown.map((r, i) => (
            <motion.button key={r.id} type="button" onClick={() => setCat(cat === r.id ? null : r.id)} aria-label={`${CATEGORY[r.id].short}: ${Math.round(r.spent)} ₽`}
              initial={{ width: 0 }} animate={{ width: `${(r.spent / Math.max(limit, spent, 1)) * 100}%`, opacity: !cat || cat === r.id ? 1 : 0.3 }}
              transition={{ ...spring, delay: 0.08 + i * 0.05 }} className="h-full border-r border-[rgba(0,0,0,.18)] last:border-0" style={{ background: CAT_COLOR[r.id] }} />
          ))}
        </div>
        <div className="mt-2.5 flex justify-between text-[12px] text-card-muted">
          <span>{spent <= limit ? <>осталось <Money value={limit - spent} className="text-card" /></> : <>сверх лимита <Money value={spent - limit} className="text-[#f2a596]" /></>}</span>
          {baseline > 0 && <span>до плана уходило <Money value={baseline} className="text-card" /></span>}
        </div>
        {fromReserve > 0 && <p className="mt-2 text-[12px] leading-snug text-card-muted">Из резерва — <Money value={fromReserve} className="text-card" />, в лимит не входит.</p>}
      </section>

      {credit.length > 0 && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-[22px] bg-neg/10 px-4 py-3.5 text-neg">
          <CreditCard size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          <div className="text-[13.5px] leading-snug">С кредиток: {credit.length} на <Money value={credit.reduce((s, e) => s + e.amount, 0)} />. В неделю моста — по плану моста, иначе это нарушение: кредитки только гасим.</div>
        </div>
      )}

      {weeks.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 px-5 text-[14px] font-medium">Недели</div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
            {weeks.map(w => {
              const over = w.spent > w.limit;
              return (
                <motion.button key={w.monday} type="button" whileTap={{ scale: 0.95 }} onClick={() => set({ week: w.monday })}
                  className="w-[132px] shrink-0 rounded-[18px] border border-line bg-surface p-3 text-left">
                  <div className="text-[12px] text-muted">{ddmm(w.monday)}–{ddmm(addDays(w.monday, 6))}</div>
                  <Money value={w.spent} className={`figure mt-1 block text-[17px] leading-none ${over ? 'text-neg' : ''}`} />
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <motion.div className={`h-full rounded-full ${over ? 'bg-neg' : 'bg-sea'}`} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (w.spent / Math.max(w.limit, 1)) * 100)}%` }} transition={spring} />
                  </div>
                  <div className="mt-1.5 text-[11px] text-faint">из <Money value={w.limit} /></div>
                </motion.button>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-5">
        <div className="mb-2 flex items-baseline justify-between px-5">
          <span className="text-[14px] font-medium">По категориям</span>
          {cat && <button type="button" onClick={() => setCat(null)} className="text-[13px] font-medium text-sea">Все категории</button>}
        </div>
        <motion.div className="card divide-hair mx-4 overflow-hidden" variants={listAnim} initial="hidden" animate="show">
          {rows.map(r => {
            const over = r.spent > r.limit;
            const on = cat === r.id;
            return (
              <motion.button key={r.id} variants={item} type="button" onClick={() => setCat(on ? null : r.id)} whileTap={{ scale: 0.985 }}
                className={`relative flex w-full items-center gap-3 px-4 py-3 text-left transition-opacity ${cat && !on ? 'opacity-45' : ''}`}>
                {on && <motion.span layoutId="cat-on" className="absolute inset-0 bg-sea/8" transition={spring} />}
                <CatIcon id={r.id} className="relative size-9" />
                <span className="relative min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[14px]">{CATEGORY[r.id].short}</span>
                    <span className="shrink-0 text-[13.5px]"><Money value={r.spent} className={over ? 'text-neg' : ''} /><span className="text-faint"> из <Money value={r.limit} /></span></span>
                  </span>
                  <span className="mt-2 block h-[5px] overflow-hidden rounded-full bg-line">
                    <motion.span className="block h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, r.limit ? (r.spent / r.limit) * 100 : r.spent ? 100 : 0)}%` }}
                      transition={spring} style={{ background: over ? 'var(--neg)' : CAT_COLOR[r.id] }} />
                  </span>
                  {r.baseline > 0 && <span className="mt-1 block text-[11px] text-faint">до плана <Money value={r.baseline} /></span>}
                </span>
              </motion.button>
            );
          })}
        </motion.div>
        {saved > 0 && <p className="mx-6 mt-2 text-[12.5px] text-pos">Пауза 48 часов уже сберегла <Money value={saved} />.</p>}
      </section>

      <section className="mt-6">
        <div className="mx-4 flex items-center gap-2 rounded-[16px] border border-line bg-surface px-3.5">
          <Search size={17} strokeWidth={1.6} className="shrink-0 text-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Найти трату: название, категория, сумма" className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" />
          <AnimatePresence>{q && <motion.button type="button" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} onClick={() => setQ('')} aria-label="Очистить"><X size={16} className="text-muted" /></motion.button>}</AnimatePresence>
        </div>
        <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto px-4">
          {SOURCES.map(s => (
            <motion.button key={s.id} type="button" whileTap={{ scale: 0.95 }} onClick={() => setSource(s.id)}
              className={`relative shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-medium ${source === s.id ? 'border-transparent text-bg' : 'border-line text-muted'}`}>
              {source === s.id && <motion.span layoutId="spend-source" className="absolute inset-0 rounded-full bg-ink" transition={spring} />}
              <span className="relative">{s.label}</span>
            </motion.button>
          ))}
        </div>
        <div className="mt-4 mb-2 flex items-baseline justify-between px-5">
          <span className="text-[14px] font-medium">{cat ? CATEGORY[cat].short : 'Все траты'}{needle ? ', поиск' : ''}</span>
          <span className="text-[12.5px] text-muted">{filtered.length} на <Money value={filteredSum} /></span>
        </div>
        {byDay.length === 0 ? (
          <div className="space-y-2 px-4">
            <Empty>{monthList.length ? 'Ничего не нашлось — смените фильтр или поиск.' : 'В этом месяце трат нет.'}</Empty>
            {/* у пустого экрана — одно понятное действие (baseline-ui) */}
            {monthList.length
              ? <button type="button" onClick={() => { setCat(null); setSource('all'); setQ(''); }} className="h-11 w-full rounded-2xl border border-line text-[14px] font-medium text-sea">Сбросить фильтры</button>
              : <button type="button" onClick={() => set({ add: {} })} className="h-11 w-full rounded-2xl bg-ink text-[14px] font-medium text-bg">Записать трату</button>}
          </div>
        ) : (
          <motion.div key={`${month}${cat}${source}${needle}`} variants={listAnim} initial="hidden" animate="show">
            {byDay.map(([date, list]) => (
              <motion.div key={date} variants={item} className="mb-3">
                <div className="mb-1.5 flex items-baseline justify-between px-5 text-[12.5px] text-muted">
                  <span>{date === now ? 'Сегодня' : `${weekday(date)}, ${ddmm(date)}`}</span>
                  <Money value={list.reduce((s, e) => s + e.amount, 0)} />
                </div>
                <div className="card divide-hair mx-4 overflow-hidden">
                  <AnimatePresence initial={false}>
                    {list.map(e => (
                      <motion.div key={e.id} layout exit={{ opacity: 0, height: 0 }} transition={spring}>
                        <SwipeRow right={[
                          { label: 'Изменить', icon: <Pencil size={16} />, tone: 'sea', onAction: () => set({ add: { edit: e } }) },
                          { label: 'Удалить', icon: <Trash2 size={16} />, tone: 'neg', onAction: () => remove(e) },
                        ]}>
                          <ExpenseRow e={e} onClick={() => set({ add: { edit: e } })} />
                        </SwipeRow>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
        {byDay.length > 0 && <p className="px-6 pt-1 text-center text-[11.5px] text-faint">Сдвиньте трату влево — изменить или удалить.</p>}
      </section>
    </div>
  );
}

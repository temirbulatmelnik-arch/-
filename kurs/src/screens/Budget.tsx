// «Траты» — куда ушли деньги. Месяц против лимитов этапа: «прилив» из цветов категорий, категории с полосами,
// недели месяца, поиск и фильтры, все траты по дням. Нажатие на категорию — фильтр; свайп влево — изменить, удалить.
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Copy, Pencil, Search, Trash2, X } from 'lucide-react';
import { Hold } from '../components/Hold';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { item, list as listAnim, Roll, spring, SwipeRow, useEnter } from '../components/motion';
import { SkyButton, SkyHeader } from '../components/Petersburg';
import { ExpenseRow } from '../components/rows';
import { CAT_COLOR, CatIcon, Empty, Money } from '../components/ui';
import { addDays, addMonths, ddmm, monthKey, monthName, weekday, weekStart } from '../domain/dates';
import { CATEGORY, currentPhase, weeklyLimit } from '../domain/plan';
import { bySource } from '../domain/sources';
import { countsWeekly, monthByCategory } from '../domain/summary';
import type { CategoryId, Expense, Source } from '../domain/types';
import { useStore } from '../store/store';
import { toast, useToday, useUi } from '../store/ui';


type SourceFilter = 'all' | Source;
const SOURCES: { id: SourceFilter; label: string; dot?: string }[] = [
  { id: 'all', label: 'Все' }, { id: 'life', label: 'Свои', dot: 'var(--own)' }, { id: 'credit', label: 'В долг', dot: 'var(--loan-hatch)' }, { id: 'reserve', label: 'Резерв', dot: 'var(--rsv)' },
];

export function Budget() {
  const now = useToday();
  const enter = useEnter();
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
  // откуда ушли деньги месяца: свои, в долг (кредитка) и из резерва
  const src = useMemo(() => bySource(monthList), [monthList]);
  const srcAll = Math.max(1, src.life + src.credit + src.reserve);
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
  // та же покупка ещё раз (кофе, проезд) — одним движением
  const repeat = (e: Expense) => {
    useStore.getState().addExpenses([{ date: now, amount: e.amount, category: e.category, note: e.note, source: e.source, origin: 'manual', ...(e.creditCard ? { creditCard: e.creditCard } : {}) }]);
    toast(`Записано ещё раз: ${e.note || CATEGORY[e.category].short}`);
  };

  return (
    <div>
      <SkyHeader back={{ label: 'Сегодня', onClick: () => useUi.getState().setTab('week') }}
        title="Траты"
        subtitle={<button type="button" onClick={() => setMonth(monthKey(now))} className="text-left first-letter:uppercase">{monthName(month)}{month !== monthKey(now) ? ', к текущему' : ''}</button>}
        action={
          <div className="flex gap-2">
            <SkyButton onClick={() => setMonth(addMonths(month, -1))} label="Предыдущий месяц"><ChevronLeft size={18} strokeWidth={1.7} /></SkyButton>
            <SkyButton onClick={() => setMonth(addMonths(month, 1))} label="Следующий месяц"><ChevronRight size={18} strokeWidth={1.7} /></SkyButton>
          </div>
        } />

      <section className="deep-card mx-4 mt-3 px-5 pt-5 pb-4">
        <span aria-hidden="true" className="deep-sheen" />
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
        {/* откуда деньги: сплошная — свои, штриховка — в долг, сумерки — из резерва (в лимит не входит) */}
        {(src.credit > 0 || src.reserve > 0) && (
          <>
            <div className="mt-4 flex h-1.5 gap-px overflow-hidden rounded-full bg-card/12">
              <span className="h-full bg-white/85" style={{ width: `${(src.life / srcAll) * 100}%` }} />
              <span className="h-full" style={{ width: `${(src.credit / srcAll) * 100}%`, background: 'var(--loan-hatch)' }} />
              <span className="h-full bg-[#aab8f0]" style={{ width: `${(src.reserve / srcAll) * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-card-muted">
              <span><span className="mr-1.5 inline-block size-2 rounded-[3px] bg-white/85 align-[0px]" />свои <Money value={src.life} className="text-card" /></span>
              {src.credit > 0 && <span><span className="mr-1.5 inline-block size-2 rounded-[3px] align-[0px]" style={{ background: 'var(--loan-hatch)' }} />в долг <Money value={src.credit} className="text-card" /></span>}
              {src.reserve > 0 && <span><span className="mr-1.5 inline-block size-2 rounded-[3px] bg-[#aab8f0] align-[0px]" />из резерва <Money value={src.reserve} className="text-card" /></span>}
            </div>
          </>
        )}
      </section>

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
        <motion.div className="card divide-hair mx-4 overflow-hidden" variants={listAnim} initial={false} animate="show">
          {rows.filter(r => r.spent > 0).sort((a, b) => b.spent - a.spent).map(r => {
            const over = r.spent > r.limit;
            const on = cat === r.id;
            return (
              <motion.button key={r.id} variants={item} type="button" onClick={() => setCat(on ? null : r.id)} whileTap={{ scale: 0.985 }}
                className={`relative flex w-full items-center gap-3 px-4 py-3 text-left transition-[opacity,background-color] duration-200 ${on ? 'bg-sea/8' : ''} ${cat && !on ? 'opacity-45' : ''}`}>
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
          {/* категории без трат — одной строкой, а не десятью пустыми полосами */}
          {rows.some(r => r.spent === 0) && (
            <motion.div variants={item} className="px-4 py-3 text-[12.5px] leading-snug text-muted">
              Без трат: {rows.filter(r => r.spent === 0).map(r => CATEGORY[r.id].short.toLowerCase()).join(', ')}
            </motion.div>
          )}
          {rows.every(r => r.spent === 0) && <div className="px-4 pb-3 text-[13px] text-muted">В этом месяце ещё ничего. Нажмите «+», чтобы записать трату.</div>}
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
              className={`relative shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors duration-200 ${source === s.id ? 'border-transparent bg-ink text-bg' : 'border-line text-muted'}`}>
              <span className="relative flex items-center gap-1.5">{s.dot && <span className="size-2 rounded-[3px]" style={{ background: s.dot }} />}{s.label}</span>
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
          <motion.div key={`${month}${cat}${source}${needle}`} variants={listAnim} initial={enter} animate="show">
            {byDay.map(([date, list]) => (
              <motion.div key={date} variants={item} className="mb-3">
                <div className="mb-1.5 flex items-baseline justify-between px-5 text-[12.5px] text-muted">
                  <span>{date === now ? 'Сегодня' : `${weekday(date)}, ${ddmm(date)}`}</span>
                  <Money value={list.reduce((s, e) => s + e.amount, 0)} />
                </div>
                <div className="card divide-hair mx-4 overflow-hidden">
                  <AnimatePresence initial={false}>
                    {list.map(e => (
                      <motion.div key={e.id} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                        <Hold preview={<div className="pointer-events-none"><ExpenseRow e={e} /></div>} actions={[
                          { label: 'Изменить', icon: <Pencil size={17} />, onSelect: () => set({ add: { edit: e } }) },
                          { label: 'Повторить сегодня', icon: <Copy size={17} />, onSelect: () => repeat(e) },
                          { label: 'Удалить', icon: <Trash2 size={17} />, danger: true, onSelect: () => remove(e) },
                        ]}>
                          <SwipeRow right={[
                            { label: 'Изменить', icon: <Pencil size={16} />, tone: 'sea', onAction: () => set({ add: { edit: e } }) },
                            { label: 'Удалить', icon: <Trash2 size={16} />, tone: 'neg', onAction: () => remove(e) },
                          ]}>
                            <ExpenseRow e={e} onClick={() => set({ add: { edit: e } })} />
                          </SwipeRow>
                        </Hold>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
        {byDay.length > 0 && <p className="px-6 pt-1 text-center text-[11.5px] text-faint">Сдвиньте трату влево — изменить или удалить. Удержите — ещё «Повторить сегодня».</p>}
      </section>
    </div>
  );
}

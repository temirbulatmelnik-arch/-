import { ArrowLeft, ChartPie, ChevronDown, History, ScanLine, CalendarDays, X } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { SkyHeader } from '../components/Petersburg';
import { CatIcon, CAT_COLOR, Money, Sheet } from '../components/ui';
import { rubles, weeklyExpenseCents } from '../domain/accounts';
import { addDays, dayMonth, weekStart } from '../domain/dates';
import { CATEGORY } from '../domain/plan';
import type { Expense, CategoryId } from '../domain/types';
import { useBudgetExpenses, useToday, useUi } from '../store/ui';
import { Glyph, IconLabel, Jump } from './Visuals';
import { History as Journal } from '../screens/History';

export function HistoryStudio() {
  const set = useUi(s => s.set);
  const range = useUi(s => s.historyRange);
  const now = useToday();
  const expenses = useBudgetExpenses();
  const [period, setPeriod] = useState(0);
  const [category, choose] = useState<CategoryId | null>(null);
  const [selected, detail] = useState<Expense | null>(null);
  const [journal, showJournal] = useState(false);
  useEffect(() => { if (range) showJournal(true); }, [range]);
  const start = addDays(weekStart(now), -7 * period);
  const end = period === 0 ? now : addDays(start, 6);
  const { slices, total, rows } = useMemo(() => {
    const rows = expenses.filter(x => x.date >= start && x.date <= end && weeklyExpenseCents(x) !== 0)
      .sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const sums = new Map<CategoryId, number>();
    for (const row of rows) sums.set(row.category, (sums.get(row.category) ?? 0) + weeklyExpenseCents(row));
    const slices = [...sums].filter(([,value]) => value > 0).sort((a,b) => b[1] - a[1]);
    const pieTotal = slices.reduce((sum,[,value]) => sum + value, 0);
    let offset = 0;
    return { total: [...sums.values()].reduce((a,b) => a+b,0), rows, slices: slices.map(([id,cents]) => {
      const size = 100 * cents / pieTotal;
      const segment = { id, cents, start: offset, size };
      offset += size;
      return segment;
    }) };
  }, [expenses, start, end]);
  const highlighted = slices.find(x => x.id === category);
  const toggle = (id: CategoryId) => choose(cat => cat === id ? null : id);
  const group = rows.filter(x => !highlighted || x.category === highlighted.id);
  const openJournal = () => { showJournal(true); window.scrollTo(0,0); };
  if (journal || range) return <div className="nv-original">
    <div className="nv-back"><Jump icon={ArrowLeft} label="К диаграмме" onClick={() => {
      set({ historyRange: undefined });
      showJournal(false);
    }} /></div>
    <Journal />
  </div>;
  return <>
    <SkyHeader compact title="История" action={<button type="button" className="nv-sky-button" onClick={() => set({ scan: true })} aria-label="Из банка"><ScanLine size={19} aria-hidden="true" /> Банк</button>} />
    <div className="nv-page nv-stack">
      <section className="nv-glass nv-spend" aria-label="Траты по категориям">
        <header className="nv-widget-head"><IconLabel icon={ChartPie}>Траты по бюджету</IconLabel>
          {!!highlighted && <button className="nv-iconbtn" type="button" onClick={() => choose(null)} aria-label="Все категории"><X size={18} /></button>}
        </header>
        <div className="nv-period" aria-label="Период расходов">
          <button type="button" aria-pressed={period===0} onClick={() => {setPeriod(0);choose(null)}}><CalendarDays size={15} aria-hidden="true" /> Эта неделя</button>
          <button type="button" aria-pressed={period===1} onClick={() => {setPeriod(1);choose(null)}}><History size={15} aria-hidden="true" /> Прошлая</button>
        </div>
        <div className="nv-donut">
          <svg viewBox="0 0 230 230" className="nv-donut-svg" aria-label="Диаграмма расходов">
            <circle cx="115" cy="115" r="96" fill="none" stroke="var(--line)" strokeWidth="21" aria-hidden="true" />
            {slices.map(({id,cents,start,size}) => <circle key={id} cx="115" cy="115" r="96" fill="none"
              className="nv-donut-segment" stroke={CAT_COLOR[id]} strokeWidth={highlighted?.id===id?25:18} opacity={highlighted && highlighted.id!==id ? .31 : 1}
              transform="rotate(-90 115 115)" pathLength="100" strokeDasharray={`${Math.max(.15, size - Math.min(size * .14, 1.5))} 100`} strokeDashoffset={-start}
              role="button" tabIndex={0} aria-pressed={highlighted?.id===id} aria-label={`${CATEGORY[id].short}, ${rubles(cents)} ₽`}
              onClick={() => toggle(id)} onKeyDown={(e: KeyboardEvent<SVGCircleElement>) => {
                if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(id);}
              }} />)}
          </svg>
          <div className="nv-donut-center" aria-live="polite">
            {highlighted ? <CatIcon id={highlighted.id} className="nv-category-icon" /> : <Glyph icon={ChartPie} size={18} />}
            <strong><Money value={rubles(highlighted?.cents ?? total)} kopecks /></strong>
            <small>{highlighted ? CATEGORY[highlighted.id].short : `${dayMonth(start)} — ${dayMonth(end)}`}</small>
          </div>
        </div>
        <div className="nv-categories" aria-label="Категории">
          {slices.map(({id,cents}) => <button className="nv-category nv-press" type="button" key={id}
            aria-pressed={highlighted?.id===id} onClick={() => toggle(id)} style={{ '--category': CAT_COLOR[id] } as CSSProperties}>
            <CatIcon id={id} className="nv-category-icon" /><span>{CATEGORY[id].short}</span><strong><Money value={rubles(cents)} kopecks /></strong>
          </button>)}
        </div>
      </section>
      <section aria-label={highlighted ? `Операции · ${CATEGORY[highlighted.id].short}` : 'Недавние операции'} className="nv-history-detail">
        <div className="nv-widget-head"><IconLabel icon={History}>{highlighted ? CATEGORY[highlighted.id].short : 'Недавние операции'}</IconLabel></div>
        {group.length===0 ? <p className="nv-meta">За этот период трат нет</p> :
          <div className="nv-rail" data-noswipe>
            {group.map(x => <button className="nv-receipt nv-glass nv-press" type="button" key={x.id} onClick={() => detail(x)}>
              <CatIcon id={x.category} className="nv-category-icon" /><small>{dayMonth(x.date)}</small>
              <strong><Money value={x.amount} kopecks /></strong><span>{x.note ?? CATEGORY[x.category].short}</span>
            </button>)}
          </div>}
      </section>
      <div className="nv-actions">
        <Jump icon={History} label="Весь журнал" onClick={openJournal} />
        <Jump icon={ScanLine} label="Из банка" tone="iris" onClick={() => set({ scan: true })} />
      </div>
    </div>
    <Sheet open={selected!==null} title={selected?.note ?? 'Операция'} onClose={() => detail(null)} compact>
      {selected && <div className="nv-stack">
        <div className="nv-quick-summary"><CatIcon id={selected.category} className="nv-category-icon" />
          <strong><Money value={selected.amount} kopecks /></strong><small>{dayMonth(selected.date)} · {CATEGORY[selected.category].short}</small>
        </div>
        <Jump icon={ChevronDown} label="Открыть весь журнал" onClick={() => {detail(null); openJournal()}} />
      </div>}
    </Sheet>
  </>;
}

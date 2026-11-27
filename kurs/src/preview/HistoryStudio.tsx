import { ArrowLeft, ChartPie, ChevronDown, ChevronRight, History, ScanLine, CalendarDays, X } from 'lucide-react';
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

const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });

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
  const { slices, credits, total, rows } = useMemo(() => {
    const rows = expenses.filter(x => x.date >= start && x.date <= end && weeklyExpenseCents(x) !== 0)
      .sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const sums = new Map<CategoryId, number>();
    for (const row of rows) sums.set(row.category, (sums.get(row.category) ?? 0) + weeklyExpenseCents(row));
    const slices = [...sums].filter(([,value]) => value > 0).sort((a,b) => b[1] - a[1]);
    const pieTotal = slices.reduce((sum,[,value]) => sum + value, 0);
    let offset = 0;
    return { total: [...sums.values()].reduce((a,b) => a+b,0), rows, credits: [...sums].filter(([,value]) => value < 0), slices: slices.map(([id,cents]) => {
      const size = 100 * cents / pieTotal;
      const segment = { id, cents, start: offset, size };
      offset += size;
      return segment;
    }) };
  }, [expenses, start, end]);
  const credit = credits.find(([id]) => id === category);
  const highlighted = slices.find(x => x.id === category) ?? (credit && { id: credit[0], cents: credit[1] });
  const toggle = (id: CategoryId) => choose(cat => cat === id ? null : id);
  const group = rows.filter(x => !highlighted || x.category === highlighted.id);
  const days = new Map<string, Expense[]>();
  for (const x of group) {
    const list = days.get(x.date) ?? [];
    list.push(x);
    days.set(x.date, list);
  }
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
    <div className="nv-page nv-stack nf-flow">
      <section className="nf-panel nf-spending" aria-label="Траты по категориям">
        <header className="nf-head"><h2><IconLabel icon={ChartPie}>Траты по бюджету</IconLabel></h2>
          {!!highlighted && <button className="nv-iconbtn" type="button" onClick={() => choose(null)} aria-label="Все категории"><X size={18} /></button>}
        </header>
        <div className="nv-period" role="group" aria-label="Период расходов">
          <button type="button" aria-pressed={period===0} onClick={() => {setPeriod(0);choose(null)}}><CalendarDays size={15} aria-hidden="true" /> Эта неделя</button>
          <button type="button" aria-pressed={period===1} onClick={() => {setPeriod(1);choose(null)}}><History size={15} aria-hidden="true" /> Прошлая</button>
        </div>
        <div className="nv-donut">
          <svg viewBox="0 0 230 230" className="nv-donut-svg" role="group" aria-label="Диаграмма расходов">
            <circle cx="115" cy="115" r="96" fill="none" stroke="var(--nf-line)" strokeWidth="21" aria-hidden="true" />
            {slices.map(({id,cents,start,size}) => <circle key={id} cx="115" cy="115" r="96" fill="none"
              className="nv-donut-segment" stroke={CAT_COLOR[id]} strokeWidth={highlighted?.id===id?25:18} opacity={highlighted && highlighted.id!==id ? .31 : 1}
              transform="rotate(-90 115 115)" pathLength="100" strokeDasharray={`${size} 100`} strokeDashoffset={-start}
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
        <div className="nf-legend" role="group" aria-label="Категории">
          {[...slices, ...credits.map(([id, cents]) => ({ id, cents, size: null }))].map(({id,cents,size}) =>
            <button className="nf-category-row nf-press" type="button" key={id}
              aria-pressed={highlighted?.id===id} onClick={() => toggle(id)} style={{ '--category': CAT_COLOR[id] } as CSSProperties}>
              <CatIcon id={id} className="nv-category-icon" />
              <span>{CATEGORY[id].short}</span>
              <small>{size == null ? 'Возвраты' : percent.format(size / 100)}</small>
              <strong><Money value={rubles(cents)} kopecks className="nf-exact" /></strong>
            </button>)}
        </div>
        {credits.length > 0 && <p className="nv-meta mt-2">В кольце — доли категорий с расходами. Возвраты входят в общий итог.</p>}
      </section>
      <section aria-label={highlighted ? `Операции · ${CATEGORY[highlighted.id].short}` : 'Недавние операции'} className="nv-history-detail">
        <header className="nf-head">
          <h2><IconLabel icon={History}>{highlighted ? CATEGORY[highlighted.id].short : 'Недавние операции'}</IconLabel></h2>
          <button className="nf-journal-link nf-press" type="button" onClick={openJournal}>Весь журнал <ChevronRight size={16} aria-hidden="true" /></button>
        </header>
        {group.length === 0 ? <p className="nv-meta">За этот период трат нет</p> : [...days].map(([date, operations]) =>
          <section className="nf-day-group" key={date} aria-label={dayMonth(date)}>
            <h3>{dayMonth(date)}</h3>
            <ul className="nf-panel">
              {operations.map(x => <li key={x.id}>
                <button className="nf-operation nf-press" type="button" onClick={() => detail(x)}>
                  <CatIcon id={x.category} className="nv-category-icon" />
                  <span><strong>{x.note ?? CATEGORY[x.category].short}</strong><small>{CATEGORY[x.category].short}</small></span>
                  <Money value={x.amount} kopecks className="nf-exact" />
                </button>
              </li>)}
            </ul>
          </section>
        )}
      </section>
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

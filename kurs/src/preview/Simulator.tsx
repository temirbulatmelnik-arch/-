import { ArrowDownLeft, Banknote, CalendarHeart, Clock3, FlaskConical, Gift, Shield, ShoppingBag, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCoverage } from '../components/Coverage';
import { Money, Sheet } from '../components/ui';
import { cashIncomeEvent, eventsBetween } from '../domain/calendar';
import { coverage } from '../domain/coverage';
import { addDays, dayMonth, daysBetween, weekStart } from '../domain/dates';
import { weeklyLimit } from '../domain/plan';
import type { CalEvent } from '../domain/types';
import { useUi } from '../store/ui';
import { TideChart } from './Tide';
import { Glyph, IconLabel } from './Visuals';

const modes = [
  { id:'limit', label:'Лимит', icon:Wallet },
  { id:'expense', label:'Трата', icon:ShoppingBag },
  { id:'income', label:'Доход', icon:ArrowDownLeft },
  { id:'defer', label:'Сдвиг премии', icon:Clock3 },
  { id:'skip', label:'Без премии', icon:Gift },
  { id:'leave', label:'Отпуск', icon:CalendarHeart },
  { id:'early', label:'Досрочка', icon:Banknote },
] as const;
type Mode = typeof modes[number]['id'];

export function Simulator({ close }: { close: () => void }) {
  const selectedScenario = useUi(s => s.scenario);
  const { input, now, cov } = useCoverage();
  const [mode, setMode] = useState<Mode>('limit');
  const [amount, setAmount] = useState(weeklyLimit(input.debts,now,input.cal.weeklyOverrides));
  const [delay, setDelay] = useState(7);
  const [result, setResult] = useState<ReturnType<typeof coverage> | null>(null);
  const [showResult, toggleResult] = useState(true);
  const [date, setDate] = useState(addDays(now,5));
  const vacation = input.cal.work?.vacations?.find(v=>v.status==='planned'&&v.from>=now);
  const bonus = useMemo(() => eventsBetween(input.cal,now,addDays(now,120)).find(e =>
    cashIncomeEvent(e) && e.incomeKind?.startsWith('bonus') && !e.payroll?.documented && !input.marks[e.key]?.done), [input, now]);
  const max = mode==='limit'?25000:100000;
  const amountMode = mode==='limit'||mode==='expense'||mode==='income'||mode==='early';
  const run = () => {
    const cal = { ...input.cal };
    if (mode==='limit') {
      const first = addDays(weekStart(now),7);
      cal.weeklyOverrides = [{ from:first, to:cov.to, amount }, ...cal.weeklyOverrides];
    } else if (mode==='skip'||mode==='defer') {
      if (!bonus) return;
      cal.overrides = { ...cal.overrides, [bonus.key]: { ...cal.overrides?.[bonus.key],
        ...(mode==='skip' ? { amount:0 } : { date:addDays(bonus.date,delay) }) } };
    } else if (mode==='leave') {
      if (!vacation||!cal.work||!date) return;
      cal.work = { ...cal.work, vacations:cal.work.vacations?.map(v => v.id===vacation.id
        ? { ...v, from:date, to:addDays(date,daysBetween(v.from,v.to)), payDate:undefined } : v) };
    } else {
      const kind = mode==='income'?'income':'payment';
      const title = mode==='early'?'Учебная досрочка': mode==='income'?'Учебное поступление':'Учебная трата';
      const event:CalEvent = { key:'trial:flow', date, dateMode:'exact', title, amount, kind, accountId:'life' };
      cal.oneOff = [...cal.oneOff,event];
    }
    setResult(coverage({ ...input, cal },now,selectedScenario,cov.to));
    toggleResult(true);
  };
  const limitation = (mode==='defer'||mode==='skip')&&!bonus || mode==='leave'&&!vacation;
  const chart = showResult && result ? result : cov;
  return <Sheet open title="Что, если" onClose={close}>
    <div className="nv-stack nv-studio" data-noswipe>
      <div className="nv-sim-grid" aria-label="Что изменить">
        {modes.map(({id,label,icon}) => <button type="button" key={id} className="nv-mode nv-glass nv-press"
          aria-pressed={id===mode} onClick={() => {setMode(id);setResult(null);setAmount(id==='limit'?weeklyLimit(input.debts,now,input.cal.weeklyOverrides):5000);setDate(id==='leave'&&vacation?vacation.from:addDays(now,5));}}>
          <Glyph icon={icon} size={19} tone={id==='expense'||id==='early'?'amber':'iris'}/><span>{label}</span>
        </button>)}
      </div>
      <section className="nv-glass nv-sim-controls">
        <IconLabel icon={FlaskConical}>{modes.find(m=>m.id===mode)?.label}</IconLabel>
        {amountMode && <label className="nv-control">
          <span>Сумма <strong><Money value={amount} /></strong></span>
          <input aria-label="Сумма сценария" type="range" step="250" min="0" max={max} value={amount} onChange={e=>{setAmount(+e.target.value);setResult(null)}} />
        </label>}
        {mode==='defer' && <label className="nv-control"><span>Дней задержки <strong>{delay}</strong></span>
          <input aria-label="Дней задержки" type="range" min="1" max="31" value={delay} onChange={e=>{setDelay(+e.target.value);setResult(null)}} />
        </label>}
        {(mode==='defer'||mode==='skip') && <small className="nv-meta">{bonus ? `${bonus.title} · ${dayMonth(bonus.date)}` : 'Условной премии в плане нет'}</small>}
        {mode!=='limit'&&mode!=='defer'&&mode!=='skip' && <label className="nv-control nv-control-date"><span>{mode==='leave'?'Начало отпуска':'Дата'}</span>
          <input type="date" aria-label="Дата сценария" min={now} max={cov.to} value={date}
            onChange={e=>{setDate(e.target.value);setResult(null)}}/>
        </label>}
        {mode==='early'&&<small className="nv-meta">Влияние на резерв, без расчёта выгоды от досрочки.</small>}
        <button type="button" className="nv-primary nv-press" onClick={run} disabled={limitation || !date}><FlaskConical size={18} aria-hidden="true" /> Посчитать</button>
      </section>
      {result && <section className="nv-glass nv-forecast" aria-label="Результат сценария">
        <header className="nv-widget-head"><IconLabel icon={Shield}>Только примерка</IconLabel></header>
        <div className="nv-switch"><button type="button" aria-pressed={!showResult} onClick={() => toggleResult(false)}>Без изменений</button>
          <button type="button" aria-pressed={showResult} onClick={() => toggleResult(true)}>С изменением</button></div>
        <TideChart key={String(showResult)} coverage={chart} days={60} />
      </section>}
    </div>
  </Sheet>;
}

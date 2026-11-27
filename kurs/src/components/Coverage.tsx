// «Хватит ли» — один ответ крупно и линия резерва, которую можно вести пальцем: под пальцем — дата, остаток и платёж.
// Если не хватает — не больше двух подсказок, только про недельные деньги. Месяцы и узкие места — по нажатию.
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronDown, TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { compareCoverage, coverage, coverageHints, coverageInput, discretionaryLiquidityCap, HORIZON_DAYS, NARROW, type Coverage, type CoverageInput, type CoverageStep, type Scenario } from '../domain/coverage';
import { horizonUnverified, SCENARIO_LABEL } from '../domain/financialView';
import { accountOptions, EMPTY_BOOK } from '../domain/accounts';
import { addDays, dayMonth, ddmm, ddmmyyyy, monthName } from '../domain/dates';
import { num } from '../domain/money';
import { useLedger } from '../screens/Checkup';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';
import { haptic } from './haptics';
import { ease, spring } from './motion';
import { ActionArrow } from '../preview/Visuals';
import { Money, Segmented } from './ui';

/**
 * Прогноз покрытия — один на всё приложение: «Хватит ли», остаток дня в календаре, «самая тонкая точка» на карте и
 * status.coverage в файле для чата считаются одной функцией с одним входом (coverageInput). Результат запоминается:
 * экраны, которые живут одновременно, не пересчитывают его каждый своё.
 */
const coverageCache = new Map<Scenario, { key: unknown[]; input: CoverageInput; cov: Coverage }>();
export function useCoverage(override?: Scenario): { input: CoverageInput; cov: Coverage; now: string } {
  const selected = useUi(s => s.scenario);
  const scenario = override ?? selected;
  const now = useToday();
  const cal = useCal();
  const [marks, expenses] = useStore(useShallow(s => [s.marks, s.expenses] as const));
  const led = useLedger();
  return useMemo(() => {
    // ключ — сами данные хранилища (у каждого экрана свой объект cal, но поля в нём общие)
    const key = [...Object.values(cal), marks, expenses, led.reserve, led.incomeOnCard, led.heldOnCard, led.card, led.cashAccounts, led.reserveVerified, now, scenario];
    let covCache = coverageCache.get(scenario);
    if (!covCache || covCache.key.some((k, i) => k !== key[i])) {
      const input = coverageInput({ ...cal, marks, expenses }, led);
      covCache = { key, input, cov: coverage(input, now, scenario) };
      coverageCache.set(scenario, covCache);
    }
    return { input: covCache.input, cov: covCache.cov, now };
  }, [cal, marks, expenses, led.reserve, led.incomeOnCard, led.heldOnCard, led.card, led.cashAccounts, led.reserveVerified, now, scenario]);
}

export function useDailyLiquidityCap() {
  const { input, now } = useCoverage('cautious');
  return useMemo(() => discretionaryLiquidityCap(input, now), [input, now]);
}

const W = 340, H = 132, PAD = 14;

/** Линия резерва по дням; палец ведёт курсор — показываем, сколько останется в тот день и из-за чего */
function ReserveScrub({ steps, start, from, to, focus }: { steps: CoverageStep[]; start: number; from: string; to: string; focus: number }) {
  const t0 = Date.parse(from), span = Math.max(1, Date.parse(to) - t0);
  const pts = useMemo(() => [{ k: 0, v: start, s: null as CoverageStep | null }, ...steps.map(s => ({ k: (Date.parse(s.date) - t0) / span, v: s.balance, s }))], [steps, start, t0, span]);
  const vals = pts.map(p => p.v);
  const max = Math.max(...vals, NARROW * 2), min = Math.min(0, ...vals);
  const x = (k: number) => +(k * W).toFixed(1);
  const y = (v: number) => +(PAD + (1 - (v - min) / (max - min || 1)) * (H - PAD * 2)).toFixed(1);
  let d = `M0 ${y(start)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = [x(pts[i - 1].k), y(pts[i - 1].v)], [x2, y2] = [x(pts[i].k), y(pts[i].v)];
    const k = Math.min(6, (x2 - x1) / 2);
    d += ` H${x2 - k} C${x2 - k / 2} ${y1} ${x2 - k / 2} ${y2} ${x2} ${y2}`;
  }
  d += ` H${W}`;
  const [cur, setCur] = useState(focus);
  const box = useRef<HTMLDivElement>(null);
  const pick = (e: RPointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    // ближайшее событие слева от пальца — его остаток и держится до следующего
    let i = 0;
    for (let j = 0; j < pts.length; j++) if (pts[j].k <= k) i = j;
    if (i !== cur) { setCur(i); if (pts[i].v < NARROW) haptic(); }
  };
  const p = pts[Math.min(cur, pts.length - 1)];
  const px = x(p.k), py = y(p.v);
  const low = p.v < NARROW, neg = p.v < 0;
  return (
    <div className="nf-scrub relative mt-2 select-none" data-noswipe>
      <div ref={box} className="relative touch-pan-y" onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); pick(e); }} onPointerMove={e => e.buttons && pick(e)}
        role="slider" aria-label="Остаток резерва по дням" aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(p.v)} aria-valuetext={`${p.s ? dayMonth(p.s.date) : 'сегодня'}: ${num(p.v)} ₽`}
        tabIndex={0} onKeyDown={e => {
          const next = { ArrowRight: cur + 1, ArrowUp: cur + 1, ArrowLeft: cur - 1, ArrowDown: cur - 1, Home: 0, End: pts.length - 1 }[e.key];
          if (next !== undefined) { e.preventDefault(); setCur(Math.min(pts.length - 1, Math.max(0, next))); }
        }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="cov-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--nf-accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--nf-accent)" stopOpacity="0" /></linearGradient>
            <clipPath id="cov-low"><rect x="0" y={y(NARROW)} width={W} height={H} /></clipPath>
            <clipPath id="cov-neg"><rect x="0" y={y(0)} width={W} height={H} /></clipPath>
          </defs>
          <path d={`${d} V${H} H0 Z`} fill="url(#cov-fill)" />
          <path d={`M0 ${y(0)} H${W}`} strokeWidth="1" stroke="var(--nf-edge)" strokeDasharray="4 3" />
          <path d={`M0 ${y(1000)} H${W}`} strokeWidth="1" strokeDasharray="3 5" stroke="var(--nf-edge)" opacity=".8" />
          <path d={d} fill="none" strokeWidth="2.2" stroke="var(--nf-accent)" />
          <path d={d} fill="none" strokeWidth="2.4" clipPath="url(#cov-low)" stroke="var(--nf-prepared)" />
          <path d={d} fill="none" strokeWidth="2.6" clipPath="url(#cov-neg)" stroke="var(--nf-warn)" />
          <line x1={px} x2={px} y1={4} y2={H} strokeWidth="1" stroke="var(--nf-edge)" opacity=".7" />
          <circle r="5.5" cx={px} cy={py} fill={neg ? 'var(--nf-warn)' : low ? 'var(--nf-prepared)' : 'var(--nf-accent)'} stroke="var(--nf-surface)" strokeWidth="2" />
          {min < 0 && <text className="nf-zero-label" x="2" y={y(0) - 3}>0 ₽</text>}
        </svg>
      </div>
      <div className="nf-scrub-dates"><span>{ddmm(from)}</span><span>{ddmm(to)}</span></div>
      <div className="nf-scrub-event">
        <span>{p.s ? dayMonth(p.s.date) : 'На начало прогноза'}</span>
        <strong><Money value={p.v} kopecks className="nf-exact" /></strong>
        {p.s && <p>{p.s.title} · <Money value={p.s.delta} kopecks sign className="nf-exact" /></p>}
      </div>
    </div>
  );
}

export function CoverageCard({ onReconcile }: { onReconcile: () => void }) {
  const set = useUi(s => s.set);
  // резерв по учёту: минус оплаченное из него после последнего остатка из банка, плюс поступления, ждущие перевода с карты
  const { input, cov, now } = useCoverage();
  const scenario = useUi(s => s.scenario);
  const risk = cov.accountRisk;
  const unverified = horizonUnverified(input);
  const riskName = accountOptions(input.cal.accountBook ?? EMPTY_BOOK).find(a => a.id === risk?.accountId)?.name;
  const [open, setOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [compareYear, setCompareYear] = useState(false);
  const end = compareYear ? `${Math.max(2027, Number(now.slice(0, 4)))}-12-31` : addDays(now, HORIZON_DAYS);
  const comparisons = useMemo(() => compare ? compareCoverage(input, now, end) : [], [compare, input, now, end]);
  const funding = cov.paymentFunding?.filter(p => p.date <= addDays(now, 45)) ?? [];
  const accountName = (id?: string) => accountOptions(input.cal.accountBook ?? EMPTY_BOOK).find(a => a.id === id)?.name;
  const hints = useMemo(() => coverageHints(input, now, cov), [input, now, cov]);
  const s = cov.shortage, m = cov.min;
  const focus = Math.max(0, (s ? cov.steps.findIndex(x => x.balance < 0) : m ? cov.steps.indexOf(m) : -1) + 1);
  const helpful = hints.filter(h => h.closes).slice(0, 2);
  const fallback = !helpful.length && s && !risk;

  return (
    <section className="nf-flow nf-cover mx-4 mt-4">
      <div className="mb-3"><Segmented value={scenario} onChange={scenario => set({ scenario })} options={[
        { id: 'base', label: SCENARIO_LABEL.base }, { id: 'cautious', label: SCENARIO_LABEL.cautious }, { id: 'stress', label: SCENARIO_LABEL.stress },
      ]} /></div>
      <div className="nf-panel nf-cover-lead" data-risk={!!(s || risk || unverified)}>
        <div className="flex items-start gap-2">
          {s || risk || unverified ? <TriangleAlert size={21} aria-hidden="true" /> : <CheckCircle2 size={21} aria-hidden="true" />}
          <div className="min-w-0">
            <p className="nv-meta">{SCENARIO_LABEL[scenario]} · до {ddmmyyyy(cov.to)}</p>
            <h2>{s ? `Первый кассовый разрыв · ${dayMonth(s.date)}` : risk || unverified ? 'Нужна сверка для прогноза' : `Денег хватает до ${dayMonth(cov.to)}`}</h2>
            {s && <strong className="nf-alert-amount"><Money value={-s.amount} kopecks className="nf-exact" /></strong>}
            {s && <p>{s.title}</p>}
            {m && <p className="nv-meta">Самый низкий остаток · {ddmm(m.date)} · <Money value={m.balance} kopecks className="nf-exact" /></p>}
            {s && <p className="nv-meta">Максимальная нехватка <Money value={cov.maxShortfall} kopecks className="nf-exact" /></p>}
          </div>
        </div>
        {unverified && <p className="nv-meta">Расчёт уточнится после сверки счетов.</p>}
        <button className="nf-alert-button nf-more nf-press" type="button" onClick={onReconcile}>Сверить с банком <ActionArrow /></button>
      </div>
      <div className="nf-panel nf-cover-plot">
        <h3>Остаток относительно нуля</h3>
        <ReserveScrub key={scenario} steps={cov.steps} start={cov.start} from={cov.from} to={cov.to} focus={focus} />
      </div>
      {risk && <div className="nf-alert">
        <strong>{risk.reason === 'insufficient' ? 'Не хватает на счёте списания' : 'Нужна сверка счёта списания'}</strong>
        <p>{dayMonth(risk.date)} · {risk.title}</p>
        <p>{riskName ?? 'Счёт списания не указан'}{risk.amount != null ? <> · прогнозная недостача <Money value={risk.amount} kopecks /></>
          : riskName ? ' · остаток не подтверждён' : ' · сумма на этом счёте пока неизвестна'}</p>
        {hints[0] && <p className="nv-meta">{hints[0].text}</p>}
      </div>}
      {cov.bufferRisk && <p className="mt-3 px-1 nv-meta">С {dayMonth(cov.bufferRisk.date)} запас ниже цели на <Money value={cov.bufferRisk.amount} kopecks />.</p>}
      {funding.length > 0 && <details className="card mt-3 p-4 text-[13px]">
        <summary className="font-medium text-sea">Счета и подготовка ближайших платежей</summary>
        <div className="mt-2 divide-y divide-line">
          {funding.map(p => <div className="py-2" key={p.key}>
            <p>{ddmm(p.date)} · {p.title} · <Money value={p.amount} kopecks /></p>
            <p className="text-muted">{accountName(p.accountId) ?? 'Счёт списания нужно указать'}
              {p.shortfall == null ? (p.accountId ? ' · остаток нужно сверить' : '')
                : p.shortfall > 0 ? <> · подготовить к {ddmm(p.prepareBy)} ещё <Money value={p.shortfall} kopecks /></>
                  : ' · хватает по прогнозу'}</p>
            {!!p.held && <p className="text-muted">Выделено <Money value={p.held} kopecks /></p>}
            {!!p.fromReserve && <p className="text-muted">Из резерва <Money value={p.fromReserve} kopecks /></p>}
            {!!p.inTransit && <p className="text-muted">На промежуточной карте <Money value={p.inTransit} kopecks /></p>}
            {!!p.reserveShortfall && <p className="text-warn">В резерве не хватает <Money value={p.reserveShortfall} kopecks /></p>}
          </div>)}
        </div>
        <p className="mt-2 text-muted">Сначала подтвердите счёт списания. Затем сверьте доступные деньги на счёте-источнике и срок перевода. Если перевод нужен, подготовьте разницу на счёте списания к указанной дате.</p>
      </details>}
      <details className="card mt-3 p-4 text-[13px]" onToggle={event => setCompare(event.currentTarget.open)}>
        <summary className="font-medium text-sea">Сравнить сценарии на одинаковом горизонте</summary>
        {compare && <button type="button" className="my-2 text-sea" onClick={() => setCompareYear(!compareYear)}>
          {compareYear ? 'Показать первые 150 дней' : 'Показать до конца года'}
        </button>}
        {comparisons.map(row => <div className="border-t border-line py-2" key={row.scenario}>
          <p>{{ base: 'С премиями', cautious: 'Осторожный', stress: 'Стрессовый' }[row.scenario]} · минимум <Money value={row.min} kopecks /> {ddmm(row.minDate)}</p>
          <p className="mt-1 text-muted">{row.assumptions}</p>
          {row.criticalDates.length > 0 && <ul className="mt-1 text-muted">{row.criticalDates.map(critical =>
            <li key={critical.date}>{ddmm(critical.date)} · {critical.title} · <Money value={critical.balance} kopecks /></li>)}</ul>}
        </div>)}
        {comparisons[0] && <p className="mt-2 text-muted">Расчёт до {ddmmyyyy(comparisons[0].to)}. В день автоплатежа поступления с неизвестным временем считаются после списания.</p>}
      </details>
      {scenario === 'stress' && !input.cal.accountBook?.stress && <p className="mt-2 px-1 text-[13px] text-muted">Добавьте непредвиденный расход в настройках счетов для стресс-сценария.</p>}
      {s && (
        <div className="mt-3 space-y-2">
          {helpful.map((h, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 + i * 0.05 }}
              className="flex items-start gap-3 rounded-[18px] bg-pos/10 px-4 py-3 text-[13.5px] leading-snug">
              <CheckCircle2 size={18} strokeWidth={1.8} className="mt-px shrink-0 text-pos" /><span>{h.text.replace(/ — нехватка закрывается$/, '')}</span>
            </motion.div>
          ))}
          {fallback && (
            <button type="button" onClick={() => set({ sync: true })} className="flex w-full items-start gap-3 rounded-[18px] bg-warn/12 px-4 py-3 text-left text-[13.5px] leading-snug">
              <TriangleAlert size={18} strokeWidth={1.8} className="mt-px shrink-0 text-warn" />
              <span>Недельными деньгами не закрыть — нужен пересчёт плана. <span className="font-medium text-sea">Отправить файл в Claude</span></span>
            </button>
          )}
        </div>
      )}

      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-3 flex w-full items-center justify-between rounded-[18px] px-1 py-2 text-left text-[14px] font-medium text-sea">
        По месяцам и узкие места
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring}><ChevronDown size={18} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="more" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: ease.out }} className="overflow-hidden">
            <div className="card divide-hair overflow-hidden">
              {cov.months.map(r => (
                <div key={r.month} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium first-letter:uppercase">{monthName(r.month)}</div>
                    <div className="mt-0.5 text-[12px] text-muted">меньше всего {ddmm(r.minDate)}</div>
                  </div>
                  <Money value={r.min} className={`figure shrink-0 text-[16px] ${r.min < 0 ? 'text-neg' : r.min < NARROW ? 'text-warn' : 'text-pos'}`} />
                </div>
              ))}
            </div>
            {cov.narrow.length > 0 && (
              <div className="card divide-hair mt-3 overflow-hidden">
                <div className="px-4 pt-3 pb-1 text-[12.5px] text-muted">Дни, когда останется меньше {num(NARROW)} ₽</div>
                {cov.narrow.slice(0, 8).map(n => (
                  <div key={n.date} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                    <span className="min-w-0 truncate"><span className="font-medium">{ddmm(n.date)}</span> <span className="text-muted">{n.title}</span></span>
                    <Money value={n.balance} className={`shrink-0 ${n.balance < 0 ? 'text-neg' : 'text-warn'}`} />
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 px-1 text-[11.5px] leading-snug text-faint">Суммы с ≈ — оценка. Линия показывает общую сумму по счетам. Для автоплатежа отдельно проверяется счёт списания.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

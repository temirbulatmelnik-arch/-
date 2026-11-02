// «Хватит ли» — один ответ крупно и линия резерва, которую можно вести пальцем: под пальцем — дата, остаток и платёж.
// Если не хватает — не больше двух подсказок, только про недельные деньги. Месяцы и узкие места — по нажатию.
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronDown, TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { coverage, coverageHints, NARROW, type CoverageStep } from '../domain/coverage';
import { dayMonth, ddmm, monthName } from '../domain/dates';
import { num } from '../domain/money';
import { useLedger } from '../screens/Checkup';
import { useStore } from '../store/store';
import { useCal, useToday, useUi } from '../store/ui';
import { haptic } from './haptics';
import { ease, spring } from './motion';
import { Money } from './ui';

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
    <div className="relative mt-4 select-none" data-noswipe>
      <div ref={box} className="relative touch-none" onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); pick(e); }} onPointerMove={e => e.buttons && pick(e)}
        role="slider" aria-label="Остаток резерва по дням" aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(p.v)} aria-valuetext={`${p.s ? dayMonth(p.s.date) : 'сегодня'}: ${num(p.v)} ₽`}
        tabIndex={0} onKeyDown={e => { if (e.key === 'ArrowRight') setCur(c => Math.min(pts.length - 1, c + 1)); if (e.key === 'ArrowLeft') setCur(c => Math.max(0, c - 1)); }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="cov-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--card-sea)" stopOpacity=".28" /><stop offset="1" stopColor="var(--card-sea)" stopOpacity="0" /></linearGradient>
            <clipPath id="cov-low"><rect x="0" y={y(NARROW)} width={W} height={H} /></clipPath>
            <clipPath id="cov-neg"><rect x="0" y={y(0)} width={W} height={H} /></clipPath>
          </defs>
          <path d={`${d} V${H} H0 Z`} fill="url(#cov-fill)" />
          <path d={`M0 ${y(0)} H${W}`} strokeWidth="1" style={{ stroke: 'var(--card-muted)' }} opacity=".45" />
          <path d={`M0 ${y(1000)} H${W}`} strokeWidth="1" strokeDasharray="3 5" style={{ stroke: '#ffc49a' }} opacity=".6" />
          <motion.path d={d} fill="none" strokeWidth="2.2" style={{ stroke: 'var(--card-ink)' }} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: ease.out }} />
          <path d={d} fill="none" strokeWidth="2.4" clipPath="url(#cov-low)" style={{ stroke: '#ffc49a' }} />
          <path d={d} fill="none" strokeWidth="2.6" clipPath="url(#cov-neg)" style={{ stroke: '#ff8a5c' }} />
          <line x1={px} x2={px} y1={4} y2={H} strokeWidth="1" style={{ stroke: 'var(--card-ink)' }} opacity=".35" />
          <motion.circle r="5.5" animate={{ cx: px, cy: py }} transition={{ type: 'spring', bounce: 0, duration: 0.2 }} style={{ fill: neg ? '#ff8a5c' : low ? '#ffc49a' : 'var(--card-ink)', stroke: 'var(--card-bg-solid, #134c66)' }} strokeWidth="2" />
        </svg>
        {/* подпись под пальцем: дата, остаток, что списывается */}
        <div className="pointer-events-none absolute -top-1 rounded-xl bg-black/30 px-2.5 py-1.5 text-[12px] leading-tight backdrop-blur-sm"
          style={{ left: `clamp(0px, calc(${(px / W) * 100}% - 70px), calc(100% - 140px))`, width: 140 }}>
          <div className="text-card-muted">{p.s ? dayMonth(p.s.date) : 'сегодня'}</div>
          <div className={`font-display text-[15px] font-medium ${neg ? 'text-[#ff9a70]' : low ? 'text-[#ffc49a]' : 'text-card'}`}>{num(Math.round(p.v))} ₽</div>
          {p.s && <div className="truncate text-card-muted">{p.s.delta > 0 ? '+' : '−'}{num(Math.abs(Math.round(p.s.delta)))} {p.s.title}</div>}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-card-muted"><span>сегодня</span><span>ведите пальцем по линии</span><span>{ddmm(to)}</span></div>
    </div>
  );
}

export function CoverageCard() {
  const now = useToday();
  const cal = useCal();
  const [marks, debts, expenses, bridge] = useStore(useShallow(s => [s.marks, s.debts, s.expenses, s.bridge] as const));
  const set = useUi(s => s.set);
  // резерв по учёту: минус оплаченное из него после последнего остатка из банка, плюс поступления, ждущие перевода с карты
  const led = useLedger();
  const reserve = led.reserve + led.incomeOnCard;
  const [open, setOpen] = useState(false);
  const input = useMemo(() => ({ cal, marks, reserve, debts, expenses, bridge }), [cal, marks, reserve, debts, expenses, bridge]);
  const cov = useMemo(() => coverage(input, now), [input, now]);
  const hints = useMemo(() => coverageHints(input, now, cov), [input, now, cov]);
  const s = cov.shortage, m = cov.min;
  const focus = Math.max(0, (s ? cov.steps.findIndex(x => x.balance < 0) : m ? cov.steps.indexOf(m) : -1) + 1);
  const helpful = hints.filter(h => h.closes).slice(0, 2);
  const fallback = !helpful.length && s;

  return (
    <section className="mx-4 mt-4">
      <div className="deep-card px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          {s ? <TriangleAlert size={22} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[#ff9a70]" /> : <CheckCircle2 size={22} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[#9ff0d4]" />}
          <div className="min-w-0">
            <h2 className="font-display text-[21px] leading-tight font-medium">
              {s ? <>{dayMonth(s.date)} не хватит {num(s.amount)} ₽</> : <>Хватает до {dayMonth(cov.to)}</>}
            </h2>
            <p className="mt-1 text-[13.5px] leading-snug text-card-muted">
              {s ? <>на «{s.title}». Резерв <Money value={reserve} className="text-card" /> и всё, что придёт, против платежей и пополнений карты.</>
                : m ? <>Тоньше всего {dayMonth(m.date)}: останется <Money value={m.balance} className="text-card" />. Резерв <Money value={reserve} className="text-card" /> плюс всё, что придёт.</> : null}
            </p>
          </div>
        </div>
        <ReserveScrub steps={cov.steps} start={cov.start} from={cov.from} to={cov.to} focus={focus} />
      </div>

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
            <p className="mt-2 px-1 text-[11.5px] leading-snug text-faint">Суммы с ≈ — оценка. Недели вне моста — худший случай: лимит потрачен до нуля. Мост гасится в срок с процентами.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

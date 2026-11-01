// Покрытие обязательных платежей на «Платежах»: хватит ли резерва на долги и обязательные платежи на 150+ дней вперёд.
// Плашка словами, линия резерва по дням, подсказки при нехватке (только про недельные деньги), узкие места, месяцы.
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { coverage, coverageHints, NARROW, type CoverageStep } from '../domain/coverage';
import { ddmm, monthName } from '../domain/dates';
import { num } from '../domain/money';
import { useStore } from '../store/store';
import { useCal, useToday } from '../store/ui';
import { Money } from './ui';

const W = 340, H = 96, PAD = 8;

function ReserveLine({ steps, start, from, to }: { steps: CoverageStep[]; start: number; from: string; to: string }) {
  const t0 = Date.parse(from), span = Math.max(1, Date.parse(to) - t0);
  const pts: [number, number][] = [[0, start], ...steps.map(s => [(Date.parse(s.date) - t0) / span, s.balance] as [number, number])];
  const vals = pts.map(p => p[1]);
  const max = Math.max(...vals, NARROW * 2), min = Math.min(0, ...vals);
  const x = (k: number) => +(k * W).toFixed(1);
  const y = (v: number) => +(PAD + (1 - (v - min) / (max - min || 1)) * (H - PAD * 2)).toFixed(1);
  let d = `M0 ${y(start)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = [x(pts[i - 1][0]), y(pts[i - 1][1])], [x2, y2] = [x(pts[i][0]), y(pts[i][1])];
    const k = Math.min(6, (x2 - x1) / 2);
    d += ` H${x2 - k} C${x2 - k / 2} ${y1} ${x2 - k / 2} ${y2} ${x2} ${y2}`;
  }
  d += ` H${W}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
      <defs>
        <clipPath id="cov-low"><rect x="0" y={y(NARROW)} width={W} height={H} /></clipPath>
        <clipPath id="cov-neg"><rect x="0" y={y(0)} width={W} height={H} /></clipPath>
      </defs>
      <path d={`M0 ${y(0)} H${W}`} strokeWidth="1" style={{ stroke: 'var(--ink)' }} opacity=".35" />
      <path d={`M0 ${y(1000)} H${W}`} strokeWidth="1" strokeDasharray="3 4" style={{ stroke: 'var(--warn)' }} opacity=".6" />
      <path d={d} fill="none" strokeWidth="2" style={{ stroke: 'var(--sea)' }} />
      <path d={d} fill="none" strokeWidth="2.2" clipPath="url(#cov-low)" style={{ stroke: 'var(--warn)' }} />
      <path d={d} fill="none" strokeWidth="2.4" clipPath="url(#cov-neg)" style={{ stroke: 'var(--neg)' }} />
      {steps.filter(s => s.kind !== 'weekly').map((s, i) => (
        <circle key={i} cx={x((Date.parse(s.date) - t0) / span)} cy={y(s.balance)} r="2" style={{ fill: s.delta > 0 ? 'var(--pos)' : s.balance < NARROW ? 'var(--neg)' : 'var(--muted)' }} />
      ))}
    </svg>
  );
}

export function CoverageCard() {
  const now = useToday();
  const cal = useCal();
  const [marks, reserve, debts, expenses, bridge] = useStore(useShallow(s => [s.marks, s.reserve, s.debts, s.expenses, s.bridge] as const));
  const [all, setAll] = useState(false);
  const [allNarrow, setAllNarrow] = useState(false);
  const input = useMemo(() => ({ cal, marks, reserve, debts, expenses, bridge }), [cal, marks, reserve, debts, expenses, bridge]);
  const cov = useMemo(() => coverage(input, now), [input, now]);
  const hints = useMemo(() => coverageHints(input, now, cov), [input, now, cov]);
  const s = cov.shortage, m = cov.min;
  const months = all ? cov.months : cov.months.slice(0, 3);

  return (
    <section className="mx-4 mt-6">
      <h2 className="text-[14px] font-medium">Покрытие обязательных платежей</h2>
      <p className="mt-0.5 text-[12.5px] leading-snug text-muted">Резерв <Money value={reserve} className="text-ink" /> и всё, что придёт, против долгов, обязательных платежей и пополнений карты до {ddmm(cov.to)}</p>
      <div className={`mt-3 rounded-2xl px-4 py-3 text-[14px] leading-snug ${s ? 'bg-neg/12 text-neg' : 'bg-pos/10'}`}>
        {s
          ? <>{ddmm(s.date)} не хватит <b className="font-semibold">{num(s.amount)} ₽</b> на «{s.title}».</>
          : <>Все обязательные платежи до {ddmm(cov.to)} покрыты.{m && <> Самый тонкий день — {ddmm(m.date)}, останется <Money value={m.balance} className="font-medium" /> ({m.title}).</>}</>}
      </div>
      <div className="mt-3"><ReserveLine steps={cov.steps} start={cov.start} from={cov.from} to={cov.to} /></div>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{ddmm(cov.from)}</span><span>пунктир — запас 1 000 ₽</span><span>{ddmm(cov.to)}</span></div>

      {hints.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[13px] leading-snug">
          {hints.map((h, i) => <li key={i} className={h.closes ? 'text-pos' : 'text-muted'}>{h.closes ? '✓ ' : '· '}{h.text}</li>)}
        </ul>
      )}

      {cov.narrow.length > 0 && (
        <div className="card divide-hair mt-3 overflow-hidden">
          <div className="px-4 pt-3 pb-1 text-[13px] text-muted">Узкие места: останется меньше {num(NARROW)} ₽</div>
          {(allNarrow ? cov.narrow : cov.narrow.slice(0, 5)).map(n => (
            <div key={n.date} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
              <span className="min-w-0"><span className="font-medium">{ddmm(n.date)}</span> <span className="text-muted">{n.title}</span></span>
              <Money value={n.balance} className={`shrink-0 ${n.balance < 0 ? 'text-neg' : 'text-warn'}`} />
            </div>
          ))}
          {cov.narrow.length > 5 && <button type="button" onClick={() => setAllNarrow(!allNarrow)} className="w-full px-4 py-2.5 text-left text-[13px] font-medium text-sea">{allNarrow ? 'Свернуть' : `Ещё ${cov.narrow.length - 5}`}</button>}
        </div>
      )}

      <div className="card divide-hair mt-3 overflow-hidden">
        {months.map(r => (
          <div key={r.month} className="px-4 py-3 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium first-letter:uppercase">{monthName(r.month)}</span>
              <span className={r.min < 0 ? 'text-neg' : r.min < NARROW ? 'text-warn' : 'text-pos'}>{r.min < 0 ? 'не покрыто' : 'покрыто'}</span>
            </div>
            <div className="mt-1 text-[12.5px] leading-snug text-muted">
              платежи <Money value={r.payments} />, поступления <Money value={r.incomes} />, на жизнь <Money value={r.life} />; меньше всего {ddmm(r.minDate)} — <Money value={r.min} className={r.min < NARROW ? 'text-warn' : ''} />
            </div>
          </div>
        ))}
        {cov.months.length > 3 && <button type="button" onClick={() => setAll(!all)} className="w-full px-4 py-2.5 text-left text-[13px] font-medium text-sea">{all ? 'Свернуть' : `Ещё ${cov.months.length - 3} мес.`}</button>}
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-faint">Суммы с ≈ в календаре — оценка. Недели вне моста — худший случай: лимит потрачен до нуля. Мост гасится в срок с процентами.</p>
    </section>
  );
}

import { motion } from 'motion/react';
import { AlertTriangle, Check, Frown, Meh, Smile, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ScreenHeader, capitalize, plural } from '../components/ui';
import { levelById } from '../engine/program';
import { SESSION_TITLE } from '../engine/program';
import { addDays, bestStreak, countByDay, dayKey, kindOf, streak, totals, type CheckRecord, type SessionRecord } from '../engine/stats';
import { formatDuration } from '../engine/timeline';
import { useStore } from '../store/store';

const WEEKS = 12;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function heatClass(count: number, goal: number) {
  if (!count) return 'bg-surface-2';
  const r = count / goal;
  if (r < 0.5) return 'bg-heat-1';
  if (r < 1) return 'bg-heat-2';
  return 'bg-heat-3';
}

const fmtDay = (d: Date) => capitalize(d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }));

function Heatmap({ days, goal }: { days: Map<string, number>; goal: number }) {
  const today = new Date();
  const [sel, setSel] = useState<string>(dayKey(today));
  // сетка начинается с понедельника WEEKS недель назад
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = addDays(today, -mondayOffset - (WEEKS - 1) * 7);
  const cols = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const selDate = new Date(sel + 'T12:00');
  const selCount = days.get(sel) ?? 0;

  return (
    <div>
      <div className="grid items-center gap-[3px]" style={{ gridTemplateColumns: `1.6rem repeat(${WEEKS}, minmax(0, 1fr))` }}>
        {WEEKDAYS.map((name, row) => [
          <span key={name} className="text-[10px] leading-none text-faint">{row % 2 === 0 ? name : ''}</span>,
          ...cols.map(col => {
            const d = col[row];
            const k = dayKey(d);
            const future = d > today && k !== dayKey(today);
            const n = days.get(k) ?? 0;
            return (
              <button
                key={k}
                type="button"
                disabled={future}
                onClick={() => setSel(k)}
                title={`${fmtDay(d)}: ${n}`}
                aria-label={`${fmtDay(d)}: ${n} ${plural(n, 'тренировка', 'тренировки', 'тренировок')}`}
                className={`aspect-square rounded-[4px] ${future ? 'bg-transparent' : heatClass(n, goal)} ${k === sel ? 'ring-1 ring-gold ring-offset-1 ring-offset-surface' : ''}`}
              />
            );
          }),
        ])}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[13px]">
        <span className="text-ink">
          {fmtDay(selDate)}: <b>{selCount}</b> {plural(selCount, 'тренировка', 'тренировки', 'тренировок')}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted">
          0
          <span className="size-3 rounded-[3px] bg-surface-2" />
          <span className="size-3 rounded-[3px] bg-heat-1" />
          <span className="size-3 rounded-[3px] bg-heat-2" />
          <span className="size-3 rounded-[3px] bg-heat-3" />
          цель
        </span>
      </div>
    </div>
  );
}

function WeekBars({ days, goal }: { days: Map<string, number>; goal: number }) {
  const today = new Date();
  const list = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const max = Math.max(goal, ...list.map(d => days.get(dayKey(d)) ?? 0));
  const H = 120;
  const [sel, setSel] = useState(6);
  const selN = days.get(dayKey(list[sel])) ?? 0;

  return (
    <div>
      <div className="relative" style={{ height: H }}>
        {/* линия цели */}
        <div className="absolute inset-x-0 border-t border-dashed border-gold/45" style={{ bottom: (goal / max) * H }} />
        <span className="absolute right-0 -translate-y-full pb-0.5 text-[9.5px] tracking-[0.16em] text-gold uppercase" style={{ bottom: (goal / max) * H }}>цель {goal}</span>
        <div className="absolute inset-0 flex items-end justify-around border-b border-line">
          {list.map((d, i) => {
            const n = days.get(dayKey(d)) ?? 0;
            return (
              <button key={i} type="button" onClick={() => setSel(i)} className="flex h-full w-10 items-end justify-center"
                aria-label={`${fmtDay(d)}: ${n}`}>
                <span
                  className={`block w-[14px] rounded-full transition-[height] duration-700 ${n >= goal ? 'bg-gold-grad' : 'bg-heat-2'} ${i === sel ? 'opacity-100' : 'opacity-75'}`}
                  style={{ height: n ? Math.max(4, (n / max) * H) : 0 }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex justify-around text-[12px] text-muted">
        {list.map((d, i) => (
          <span key={i} className={`w-10 text-center ${i === sel ? 'font-semibold text-ink' : ''}`}>{d.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
        ))}
      </div>
      <p className="mt-2 text-[13px]">{fmtDay(list[sel])}: <b>{selN}</b> {plural(selN, 'тренировка', 'тренировки', 'тренировок')}</p>
    </div>
  );
}

const RATING_ICON = { easy: Smile, ok: Meh, hard: Frown } as const;
const RATING_LABEL = { easy: 'с запасом', ok: 'на пределе', hard: 'ослабевало' } as const;

function SessionRow({ s }: { s: SessionRecord }) {
  const d = new Date(s.at);
  const Icon = s.rating ? RATING_ICON[s.rating] : null;
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">
          {d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, {d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="text-[13px] text-muted">
          {kindOf(s) !== 'main' && `${SESSION_TITLE[kindOf(s)]} · `}Ур. {s.levelId} «{levelById(s.levelId).name}» · {formatDuration(s.duration)} · {s.contractions} сокр.{!s.completed && ' · частично'}
        </div>
      </div>
      {s.discomfort && <AlertTriangle size={18} className="text-gold" aria-label="дискомфорт" />}
      {Icon && <span className="flex items-center gap-1 text-[12px] text-muted"><Icon size={18} />{RATING_LABEL[s.rating!]}</span>}
    </li>
  );
}

const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/** Один показатель самотеста во времени: одна линия, одна шкала от нуля, подпись у последней точки */
function TestChart({ points, unit }: { points: { at: string; v: number }[]; unit: string }) {
  const [sel, setSel] = useState(points.length - 1);
  const W = 320, H = 110, PX = 16, PT = 18, PB = 8;
  const max = Math.max(1, ...points.map(p => p.v));
  const top = Math.ceil((max * 1.15) / 5) * 5;
  const x = (i: number) => (points.length === 1 ? W / 2 : PX + (i * (W - 2 * PX)) / (points.length - 1));
  const y = (v: number) => PT + (1 - v / top) * (H - PT - PB);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.v)}`).join(' ');
  const cur = points[Math.min(sel, points.length - 1)];
  const last = points[points.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`${points.length} результатов, последний ${last.v} ${unit}`}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1" />
        <line x1={0} x2={W} y1={y(top / 2)} y2={y(top / 2)} stroke="var(--line)" strokeWidth="1" opacity="0.6" />
        <text x={0} y={y(top / 2) - 4} className="fill-[var(--faint)] text-[10px]">{top / 2}</text>
        <path d={path} fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.at} onClick={() => setSel(i)} className="cursor-pointer">
            <circle cx={x(i)} cy={y(p.v)} r={14} fill="transparent" />
            <circle cx={x(i)} cy={y(p.v)} r={i === sel ? 5.5 : 4} fill="var(--gold)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        ))}
        <text x={x(points.length - 1)} y={y(last.v) - 10} textAnchor={points.length > 1 ? 'end' : 'middle'} className="fill-[var(--ink)] text-[12px] font-semibold">{last.v} {unit}</text>
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{fmtShort(points[0].at)}</span>
        {points.length > 1 && <span>{fmtShort(last.at)}</span>}
      </div>
      <p className="mt-1 text-[13px]">{fmtShort(cur.at)}: <b>{cur.v} {unit}</b></p>
    </div>
  );
}

function Checks({ checks }: { checks: CheckRecord[] }) {
  const holds = checks.filter(c => c.hold !== undefined).map(c => ({ at: c.at, v: c.hold! }));
  const quick = checks.filter(c => c.quick !== undefined).map(c => ({ at: c.at, v: c.quick! }));
  const Mark = ({ ok }: { ok: boolean }) => (ok ? <Check size={16} className="text-gold" aria-label="да" /> : <X size={16} className="text-squeeze" aria-label="нет" />);
  if (!checks.length) return <p className="text-[14px] text-muted">Пройдите контроль на главном экране: проверка техники и самотест силы. Здесь появится динамика.</p>;
  return (
    <div className="space-y-5">
      {holds.length > 0 && <div><h3 className="mb-2 text-[14px] font-medium">Удержание в полную силу, с</h3><TestChart points={holds} unit="с" /></div>}
      {quick.length > 0 && <div><h3 className="mb-2 text-[14px] font-medium">Чётких быстрых сокращений подряд</h3><TestChart points={quick} unit="" /></div>}
      <table className="w-full text-left text-[13px]">
        <thead className="text-muted">
          <tr><th className="py-1 font-medium">Дата</th><th className="font-medium">Техника</th><th className="font-medium">Отпускает</th><th className="text-right font-medium">Удерж.</th><th className="text-right font-medium">Быстрые</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...checks].reverse().slice(0, 8).map(c => (
            <tr key={c.id}>
              <td className="py-1.5">{fmtShort(c.at)}</td>
              <td><Mark ok={c.technique} /></td>
              <td><Mark ok={c.relaxes} /></td>
              <td className="text-right tabular-nums">{c.hold !== undefined ? `${c.hold} с` : '—'}</td>
              <td className="text-right tabular-nums">{c.quick ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Progress() {
  const { history, settings, checks } = useStore();
  const days = useMemo(() => countByDay(history), [history]);
  const t = totals(history);
  const cur = streak(history);
  const best = bestStreak(history);
  const recent = [...history].reverse().slice(0, 12);

  const tiles: [string, string][] = [
    ['Лучшая серия', `${best} ${plural(best, 'день', 'дня', 'дней')}`],
    ['Тренировок', String(t.sessions)],
    ['Минут', String(t.minutes)],
    ['Сокращений', t.contractions.toLocaleString('ru-RU')],
  ];

  return (
    <div className="pb-4">
      <ScreenHeader eyebrow="Дневник" title="Прогресс" subtitle="Регулярность важнее рекордов" />
      <div className="space-y-3 px-5">
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="vitrine rounded-[28px] p-6 shadow-xl">
          <div className="eyebrow text-gold">Текущая серия</div>
          <div className="font-display mt-2 text-[68px] leading-none">{cur} <span className="text-[24px] italic text-muted">{plural(cur, 'день', 'дня', 'дней')}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {tiles.map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-white/10 px-3.5 py-3">
                <div className="text-[9.5px] tracking-[0.16em] text-muted uppercase">{k}</div>
                <div className="font-display mt-1 text-[24px] leading-tight">{v}</div>
              </div>
            ))}
          </div>
        </motion.section>

        <section className="card p-5">
          <h2 className="font-display mb-5 text-[24px] leading-tight">Тренировки за 7 дней</h2>
          <WeekBars days={days} goal={settings.dailyGoal} />
        </section>

        <section className="card p-5">
          <h2 className="font-display mb-5 text-[24px] leading-tight">Последние {WEEKS} недель</h2>
          <Heatmap days={days} goal={settings.dailyGoal} />
        </section>

        <section className="card p-5">
          <h2 className="font-display mb-5 text-[24px] leading-tight">Самотесты и техника</h2>
          <Checks checks={checks} />
        </section>

        <section className="card px-5 pt-4 pb-1">
          <h2 className="font-display text-[24px] leading-tight">Журнал</h2>
          {recent.length ? (
            <ul className="divide-y divide-line">{recent.map(s => <SessionRow key={s.id} s={s} />)}</ul>
          ) : (
            <p className="py-4 text-[14px] text-muted">Здесь появятся ваши тренировки.</p>
          )}
        </section>
      </div>
    </div>
  );
}

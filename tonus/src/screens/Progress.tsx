import { AlertTriangle, Frown, Meh, Smile } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ScreenHeader, capitalize, plural } from '../components/ui';
import { levelById } from '../engine/program';
import { addDays, bestStreak, countByDay, dayKey, streak, totals, type SessionRecord } from '../engine/stats';
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
                className={`aspect-square rounded-[4px] ${future ? 'bg-transparent' : heatClass(n, goal)} ${k === sel ? 'ring-2 ring-ink' : ''}`}
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
        <div className="absolute inset-x-0 border-t border-line" style={{ bottom: (goal / max) * H }} />
        <span className="absolute right-0 -translate-y-full pb-0.5 text-[11px] text-muted" style={{ bottom: (goal / max) * H }}>цель {goal}</span>
        <div className="absolute inset-0 flex items-end justify-around border-b border-line">
          {list.map((d, i) => {
            const n = days.get(dayKey(d)) ?? 0;
            return (
              <button key={i} type="button" onClick={() => setSel(i)} className="flex h-full w-10 items-end justify-center"
                aria-label={`${fmtDay(d)}: ${n}`}>
                <span
                  className={`block w-6 rounded-t-[4px] transition-[height] duration-500 ${n >= goal ? 'bg-heat-3' : 'bg-heat-2'} ${i === sel ? 'opacity-100' : 'opacity-80'}`}
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
const RATING_LABEL = { easy: 'легко', ok: 'нормально', hard: 'тяжело' } as const;

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
          Ур. {s.levelId} «{levelById(s.levelId).name}» · {formatDuration(s.duration)} · {s.contractions} сокр.{!s.completed && ' · частично'}
        </div>
      </div>
      {s.discomfort && <AlertTriangle size={18} className="text-gold" aria-label="дискомфорт" />}
      {Icon && <span className="flex items-center gap-1 text-[12px] text-muted"><Icon size={18} />{RATING_LABEL[s.rating!]}</span>}
    </li>
  );
}

export function Progress() {
  const { history, settings } = useStore();
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
      <ScreenHeader title="Прогресс" subtitle="Регулярность важнее рекордов" />
      <div className="space-y-3 px-5">
        <section className="card p-5">
          <div className="text-[13px] text-muted">Текущая серия</div>
          <div className="text-[52px] leading-none font-semibold">{cur} <span className="text-[22px] font-medium text-muted">{plural(cur, 'день', 'дня', 'дней')}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {tiles.map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-surface-2 px-3 py-3">
                <div className="text-[12px] text-muted">{k}</div>
                <div className="text-[20px] font-semibold">{v}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-[16px] font-semibold">Тренировки за 7 дней</h2>
          <WeekBars days={days} goal={settings.dailyGoal} />
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-[16px] font-semibold">Последние {WEEKS} недель</h2>
          <Heatmap days={days} goal={settings.dailyGoal} />
        </section>

        <section className="card px-5 pt-4 pb-1">
          <h2 className="text-[16px] font-semibold">Журнал</h2>
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

import { motion } from 'motion/react';
import { ArrowUpRight, Clock, Flame, Lightbulb, Mic, MicOff, Play, Settings2, Vibrate, VibrateOff, Volume2, VolumeX } from 'lucide-react';
import { useMemo } from 'react';
import { Chip, IconButton, PrimaryButton, capitalize, plural } from '../components/ui';
import { BLOCK_INFO, LEVELS, POSITION_SHORT, levelById, type Block } from '../engine/program';
import { levelReadiness, streak, todayCount } from '../engine/stats';
import { buildTimeline, formatDuration } from '../engine/timeline';
import { useStore } from '../store/store';
import { TIPS } from './tips';

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function GoalRing({ done, goal }: { done: number; goal: number }) {
  const r = 52, len = 2 * Math.PI * r;
  const p = Math.min(1, done / goal);
  return (
    <div className="relative size-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="size-full -rotate-90" aria-hidden>
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <motion.circle
          cx="66" cy="66" r={r} fill="none" stroke="url(#goalGrad)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={len} initial={{ strokeDashoffset: len }} animate={{ strokeDashoffset: len * (1 - p) }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
        <defs>
          <linearGradient id="goalGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--calm)" />
            <stop offset="1" stopColor="var(--breath)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[34px] leading-none font-semibold">{done}<span className="text-[20px] text-faint">/{goal}</span></div>
        <div className="mt-1 text-[12px] text-muted">сегодня</div>
      </div>
    </div>
  );
}

export function Today({ onStart, onSettings, onPlan }: { onStart: () => void; onSettings: () => void; onPlan: () => void }) {
  const { history, levelId, settings, setSettings, setLevel } = useStore();
  const level = levelById(levelId);
  const tl = useMemo(() => buildTimeline(level), [level]);
  const done = todayCount(history);
  const days = streak(history);
  const ready = levelReadiness(history, levelId);
  const next = LEVELS.find(l => l.id === levelId + 1);
  const tip = TIPS[Math.floor(Date.now() / 86_400_000) % TIPS.length];
  const goalMet = done >= settings.dailyGoal;

  const quick = [
    { on: settings.sound, set: () => setSettings({ sound: !settings.sound }), icon: settings.sound ? Volume2 : VolumeX, label: 'Звук' },
    { on: settings.voice, set: () => setSettings({ voice: !settings.voice }), icon: settings.voice ? Mic : MicOff, label: 'Голос' },
    { on: settings.vibration, set: () => setSettings({ vibration: !settings.vibration }), icon: settings.vibration ? Vibrate : VibrateOff, label: 'Вибрация' },
  ];

  return (
    <div className="px-5 pb-4">
      <header className="flex items-center justify-between pt-6 pb-5">
        <div>
          <p className="text-[15px] text-muted">{capitalize(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{greeting()}</h1>
        </div>
        <IconButton label="Настройки" onClick={onSettings} className="bg-surface"><Settings2 size={22} /></IconButton>
      </header>

      {/* цель дня */}
      <section className="card flex items-center gap-5 p-5">
        <GoalRing done={done} goal={settings.dailyGoal} />
        <div className="min-w-0">
          <div className="text-[17px] font-semibold">{goalMet ? 'Цель дня выполнена' : `Ещё ${settings.dailyGoal - done} ${plural(settings.dailyGoal - done, 'тренировка', 'тренировки', 'тренировок')}`}</div>
          <p className="mt-1 text-[14px] leading-snug text-muted">
            {goalMet ? 'Мышцам нужен и отдых — продолжим завтра.' : 'Лучше распределить их на утро, день и вечер.'}
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-[14px] font-medium">
            <Flame size={16} className="text-gold" />
            {days ? `${days} ${plural(days, 'день', 'дня', 'дней')} подряд` : 'Начните серию'}
          </div>
        </div>
      </section>

      {/* готовность к следующему уровню */}
      {ready.ready && next && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-3 rounded-3xl bg-calm/15 p-4">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Готовы к уровню {next.id} «{next.name}»</div>
            <div className="text-[13px] text-muted">{ready.done} тренировок на текущем — можно усложнять.</div>
          </div>
          <button type="button" onClick={() => setLevel(next.id)} className="rounded-xl bg-calm px-3 py-2 text-[14px] font-semibold text-on-accent">Перейти</button>
        </motion.section>
      )}
      {ready.holdBack && (
        <section className="mt-3 rounded-3xl bg-gold/15 p-4 text-[14px] leading-snug">
          Последние тренировки были тяжёлыми или с дискомфортом. Останьтесь на этом уровне, а при боли — на уровень ниже.
        </section>
      )}

      {/* тренировка */}
      <section className="card mt-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium tracking-wide text-muted uppercase">Уровень {level.id} из {LEVELS.length}</div>
            <h2 className="mt-0.5 text-[22px] font-semibold">{level.name}</h2>
            <p className="text-[14px] text-muted">{level.subtitle}</p>
          </div>
          <button type="button" onClick={onPlan} className="flex items-center gap-1 rounded-xl bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-muted">
            Программа <ArrowUpRight size={14} />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Chip><Clock size={14} /> {formatDuration(tl.total)}</Chip>
          <Chip>{POSITION_SHORT[level.position]}</Chip>
          <Chip tone="squeeze">{tl.contractions} {plural(tl.contractions, 'сокращение', 'сокращения', 'сокращений')}</Chip>
        </div>

        {/* состав тренировки */}
        <div className="mt-4 flex gap-[2px]" aria-hidden>
          {tl.blocks.map((b, i) => (
            <div key={i} style={{ flexGrow: b.end - b.start }}
              className={`h-2 rounded-full ${BLOCK_INFO[b.type].color === 'squeeze' ? 'bg-squeeze/80' : b.type === 'breath' ? 'bg-breath/70' : 'bg-calm/70'}`} />
          ))}
        </div>
        <ul className="mt-3 space-y-1.5">
          {level.blocks.map((b, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`size-2 rounded-full ${BLOCK_INFO[b.type].color === 'squeeze' ? 'bg-squeeze' : b.type === 'breath' ? 'bg-breath' : 'bg-calm'}`} />
                {BLOCK_INFO[b.type].title}
              </span>
              <span className="shrink-0 text-[13px] whitespace-nowrap text-muted">{blockSummary(b)}</span>
            </li>
          ))}
        </ul>

        <PrimaryButton onClick={onStart} className="mt-5">
          <Play size={20} fill="currentColor" /> Начать тренировку
        </PrimaryButton>

        <div className="mt-3 flex gap-2">
          {quick.map(q => (
            <button key={q.label} type="button" onClick={q.set} aria-pressed={q.on}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium transition ${q.on ? 'bg-surface-2 text-ink' : 'bg-transparent text-faint ring-1 ring-line ring-inset'}`}>
              <q.icon size={16} /> {q.label}
            </button>
          ))}
        </div>
      </section>

      {/* совет дня */}
      <section className="card mt-3 flex gap-3 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold"><Lightbulb size={20} /></span>
        <div>
          <div className="text-[15px] font-semibold">{tip.title}</div>
          <p className="mt-1 text-[14px] leading-relaxed text-muted">{tip.text}</p>
        </div>
      </section>
    </div>
  );
}

export function blockSummary(b: Block): string {
  switch (b.type) {
    case 'breath':
    case 'release': return `${b.cycles} ${plural(b.cycles, 'вдох', 'вдоха', 'вдохов')}`;
    case 'slow': return `${b.reps} × ${b.hold} с, отдых ${b.rest} с`;
    case 'quick': return `${b.reps} × ${b.on} с`;
    case 'lift': return `${b.reps} × 3 этажа`;
    case 'endurance': return `${b.reps} × ${b.hold} с вполсилы`;
  }
}

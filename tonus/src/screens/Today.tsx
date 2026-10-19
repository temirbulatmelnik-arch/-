import { motion } from 'motion/react';
import { ArrowUpRight, Circle, CircleCheck, ClipboardCheck, Clock, Flame, Lightbulb, Mic, MicOff, Play, Settings2, Smartphone, TrendingUp, Vibrate, VibrateOff, Volume2, VolumeX, Waves, X } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Chip, IconButton, PrimaryButton, SecondaryButton, capitalize, plural } from '../components/ui';
import { INTENSIVE_DAYS, WEEK_MIN, WEEK_TARGET, dayPlan } from '../engine/plan';
import { BLOCK_INFO, KNACK_TASKS, LEVELS, MAINTENANCE_ID, POSITION_SHORT, blockTitle, sessionLevel, type Block, type BlockType, type SessionKind } from '../engine/program';
import { checkStatus, levelReadiness, recentDiscomfort, streak, todayCount, todayDone, weekMains, type LevelReadiness } from '../engine/stats';
import { buildTimeline, formatDuration, type Timeline } from '../engine/timeline';
import { INSTALL_URL, detectPlatform, isStandalone } from '../install/platform';
import { useStore } from '../store/store';
import { TIPS } from './tips';

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function GoalRing({ done, goal, label }: { done: number; goal: number; label: string }) {
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
        <div className="mt-1 text-[12px] text-muted">{label}</div>
      </div>
    </div>
  );
}

export function Today({ onStart, onCheck, onSettings, onPlan }: {
  onStart: (kind: SessionKind) => void; onCheck: () => void; onSettings: () => void; onPlan: () => void;
}) {
  const { history, levelId, levelSince, intensive, checks, settings, setSettings, setLevel, startIntensive } = useStore();
  const plan = dayPlan({ levelId, levelSince, intensive, checks });
  const level = plan.level;
  const mainTl = useMemo(() => buildTimeline(level), [level]);
  const lightLevel = useMemo(() => sessionLevel(level, 'light'), [level]);
  const lightTl = useMemo(() => buildTimeline(lightLevel), [lightLevel]);
  const done = todayCount(history);
  const mainToday = todayDone(history, 'main');
  const week = weekMains(history);
  const days = streak(history);
  const ready = levelReadiness(history, levelId, { since: levelSince, checks });
  const check = checkStatus(checks, new Date(), plan.mode === 'maintenance');
  const next = LEVELS.find(l => l.id === levelId + 1);
  const discomfort = recentDiscomfort(history);
  const tense = !!check.last && !check.last.relaxes;
  const tip = TIPS[Math.floor(Date.now() / 86_400_000) % TIPS.length];
  const goal = settings.dailyGoal;
  const goalMet = done >= goal;
  const showInstall = !settings.installHintHidden && detectPlatform() !== 'desktop' && !isStandalone();

  const quick = [
    { on: settings.sound, set: () => setSettings({ sound: !settings.sound }), icon: settings.sound ? Volume2 : VolumeX, label: 'Звук' },
    { on: settings.voice, set: () => setSettings({ voice: !settings.voice }), icon: settings.voice ? Mic : MicOff, label: 'Голос' },
    { on: settings.vibration, set: () => setSettings({ vibration: !settings.vibration }), icon: settings.vibration ? Vibrate : VibrateOff, label: 'Вибрация' },
  ];

  const weekLeft = Math.max(0, WEEK_MIN - week);
  const goalTitle = plan.mode === 'maintenance'
    ? (weekLeft ? `Ещё ${weekLeft} ${plural(weekLeft, 'полная тренировка', 'полные тренировки', 'полных тренировок')} на неделе` : 'Неделя закрыта')
    : !mainToday ? 'Основная тренировка впереди' : goalMet ? 'Цель дня выполнена' : `Основная есть. Лёгких — ещё ${goal - done}`;
  const goalText = plan.mode === 'maintenance'
    ? 'Поддержка: 2–3 полные тренировки в неделю и ежедневный «Knack».'
    : !mainToday ? 'Одна основная в день — главное. Лёгкие — по желанию.' : goalMet ? 'Мышцам нужен и отдых — продолжим завтра.' : 'Пропуск лёгких не мешает прогрессу и не прерывает серию.';
  const mainFirst = plan.mode === 'maintenance' ? week < WEEK_TARGET && !mainToday : !mainToday;

  return (
    <div className="px-5 pb-4">
      <header className="flex items-center justify-between pt-6 pb-5">
        <div>
          <p className="text-[15px] text-muted">{capitalize(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{greeting()}</h1>
        </div>
        <IconButton label="Настройки" onClick={onSettings} className="bg-surface"><Settings2 size={22} /></IconButton>
      </header>

      {/* цель дня или недели */}
      <section className="card flex items-center gap-5 p-5">
        {plan.mode === 'maintenance' ? <GoalRing done={week} goal={WEEK_TARGET} label="за неделю" /> : <GoalRing done={done} goal={goal} label="сегодня" />}
        <div className="min-w-0">
          <div className="text-[17px] font-semibold">{goalTitle}</div>
          <p className="mt-1 text-[14px] leading-snug text-muted">{goalText}</p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-[14px] font-medium">
            <Flame size={16} className="text-gold" />
            {days ? `${days} ${plural(days, 'день', 'дня', 'дней')} подряд` : 'Начните серию'}
          </div>
        </div>
      </section>

      {showInstall && (
        <section className="mt-3 flex items-center gap-3 rounded-3xl bg-breath/15 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-breath/20 text-breath"><Smartphone size={20} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Установите на экран «Домой»</div>
            <div className="text-[13px] text-muted">Без App Store: откроется как приложение и будет работать без интернета.</div>
          </div>
          <a href={INSTALL_URL} target={INSTALL_URL.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
            className="rounded-xl bg-breath px-3 py-2 text-[14px] font-semibold text-on-accent">Как</a>
          <button type="button" aria-label="Скрыть" onClick={() => setSettings({ installHintHidden: true })} className="-mr-1 p-1 text-faint"><X size={18} /></button>
        </section>
      )}

      {/* при дискомфорте или если мышца не отпускается — только расслабление */}
      {(discomfort || tense) && (
        <Notice tone="gold" icon={<Waves size={20} />} title="Сегодня — только расслабление"
          action={<button type="button" onClick={() => onStart('relax')} className="rounded-xl bg-gold px-3 py-2 text-[14px] font-semibold text-on-accent">2 мин</button>}>
          {tense
            ? 'По последней проверке мышца не отпускается полностью. Это признак перенапряжения: пока только расслабление и консультация специалиста по тазовому дну.'
            : 'После дискомфорта 1–2 дня делайте только расслабление. Если боль повторяется — к специалисту.'}
        </Notice>
      )}

      {check.due && (
        <Notice tone="breath" icon={<ClipboardCheck size={20} />}
          title={check.due === 'first' ? 'Сначала — проверка техники' : check.due === 'retry' ? 'Повторите проверку техники' : `Пора на контроль: ${check.days} ${plural(check.days ?? 0, 'день', 'дня', 'дней')} с прошлого`}
          action={<button type="button" onClick={onCheck} className="rounded-xl bg-breath px-3 py-2 text-[14px] font-semibold text-on-accent">Пройти</button>}>
          Зеркало, ладонь и самотест силы — 3–4 минуты. Без свежей проверки приложение не предложит следующий уровень.
        </Notice>
      )}

      {plan.mode === 'maintenance' && plan.suggest && (
        <Notice tone="calm" icon={<TrendingUp size={20} />} title="Пора на интенсивный блок"
          action={<button type="button" onClick={startIntensive} className="rounded-xl bg-calm px-3 py-2 text-[14px] font-semibold text-on-accent">Начать</button>}>
          {plan.suggest === 'drop' ? 'Самотест показал спад больше чем на 20 %.' : 'Прошло 3 месяца поддержки.'} 4 недели ежедневно на уровне «Пик», потом снова поддержка.
        </Notice>
      )}

      {/* готовность к следующему уровню */}
      {ready.ready && next && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-3 rounded-3xl bg-calm/15 p-4">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">{next.maintenance ? 'Пора на поддержку' : `Готовы к уровню ${next.id} «${next.name}»`}</div>
            <div className="text-[13px] text-muted">{ready.days} {plural(ready.days, 'день', 'дня', 'дней')} на уровне, все сжатия в полную силу и с запасом, техника проверена.</div>
          </div>
          <button type="button" onClick={() => setLevel(next.id)} className="rounded-xl bg-calm px-3 py-2 text-[14px] font-semibold text-on-accent">Перейти</button>
        </motion.section>
      )}
      {ready.holdBack && plan.mode === 'training' && (
        <section className="mt-3 rounded-3xl bg-gold/15 p-4 text-[14px] leading-snug">
          Последние тренировки были тяжёлыми или с дискомфортом. Останьтесь на этом уровне, а при боли — на уровень ниже.
        </section>
      )}

      {/* основная тренировка */}
      <section className="card mt-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium tracking-wide text-muted uppercase">
              {plan.mode === 'training' ? `Основная · уровень ${level.id} из ${MAINTENANCE_ID - 1}` : plan.mode === 'intensive' ? `Интенсивный блок · день ${plan.day} из ${INTENSIVE_DAYS}` : 'Полная тренировка · поддержка'}
            </div>
            <h2 className="mt-0.5 text-[22px] font-semibold">{level.name}</h2>
            <p className="text-[14px] text-muted">{level.subtitle}</p>
          </div>
          <button type="button" onClick={onPlan} className="flex items-center gap-1 rounded-xl bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-muted">
            Программа <ArrowUpRight size={14} />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Chip><Clock size={14} /> {formatDuration(mainTl.total)}</Chip>
          <Chip>{POSITION_SHORT[level.position]}</Chip>
          <Chip tone="squeeze">{mainTl.contractions} {plural(mainTl.contractions, 'сокращение', 'сокращения', 'сокращений')}</Chip>
        </div>

        <BlockBar tl={mainTl} />
        <ul className="mt-3 space-y-1.5">
          {level.blocks.map((b, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${dotClass(b.type)}`} />
                {blockTitle(b)}
              </span>
              <span className="shrink-0 text-right text-[13px] text-muted">{blockSummary(b)}</span>
            </li>
          ))}
        </ul>

        {plan.mode === 'training' && Number.isFinite(ready.need) && !ready.ready && <NextLevel r={ready} />}

        {mainFirst ? (
          <PrimaryButton onClick={() => onStart('main')} className="mt-5"><Play size={20} fill="currentColor" /> Начать основную</PrimaryButton>
        ) : (
          <SecondaryButton onClick={() => onStart('main')} className="mt-5 w-full"><Play size={18} /> {mainToday ? 'Повторить основную' : 'Начать основную'}</SecondaryButton>
        )}

        <div className="mt-3 flex gap-2">
          {quick.map(q => (
            <button key={q.label} type="button" onClick={q.set} aria-pressed={q.on}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium transition ${q.on ? 'bg-surface-2 text-ink' : 'bg-transparent text-faint ring-1 ring-line ring-inset'}`}>
              <q.icon size={16} /> {q.label}
            </button>
          ))}
        </div>
      </section>

      {/* лёгкая тренировка */}
      <section className="card mt-3 p-5">
        <div className="text-[13px] font-medium tracking-wide text-muted uppercase">{plan.mode === 'maintenance' ? 'Каждый день' : 'По желанию, 1–2 раза в день'}</div>
        <h2 className="mt-0.5 text-[20px] font-semibold">{plan.mode === 'maintenance' ? 'Ежедневный «Knack»' : 'Лёгкая тренировка'}</h2>
        <p className="mt-1 text-[14px] text-muted">{capitalize(lightLevel.blocks.filter(b => b.type !== 'release').map(b => blockTitle(b).toLowerCase()).join(', '))} и расслабление.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip><Clock size={14} /> {formatDuration(lightTl.total)}</Chip>
          <Chip tone="squeeze">{lightTl.contractions} {plural(lightTl.contractions, 'сокращение', 'сокращения', 'сокращений')}</Chip>
        </div>
        {!mainFirst && !goalMet ? (
          <PrimaryButton onClick={() => onStart('light')} className="mt-4"><Play size={20} fill="currentColor" /> Лёгкая тренировка</PrimaryButton>
        ) : (
          <SecondaryButton onClick={() => onStart('light')} className="mt-4 w-full"><Play size={18} /> Лёгкая тренировка</SecondaryButton>
        )}
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

const NOTICE_TONES = {
  gold: 'bg-gold/15 text-gold',
  breath: 'bg-breath/15 text-breath',
  calm: 'bg-calm/15 text-calm',
} as const;

function Notice({ tone, icon, title, action, children }: { tone: keyof typeof NOTICE_TONES; icon: ReactNode; title: string; action: ReactNode; children: ReactNode }) {
  return (
    <section className={`mt-3 rounded-3xl p-4 ${NOTICE_TONES[tone].split(' ')[0]}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${NOTICE_TONES[tone]}`}>{icon}</span>
        <div className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">{title}</div>
        {action}
      </div>
      <p className="mt-2 text-[13px] leading-snug text-muted">{children}</p>
    </section>
  );
}

/** Что осталось до следующего уровня: тренировки, дни, запас сил, проверка техники */
export function NextLevel({ r }: { r: LevelReadiness }) {
  const items: [boolean, string][] = [
    [r.done >= r.need, `Тренировки ${Math.min(r.done, r.need)}/${r.need}`],
    [r.days >= r.needDays, `Дни ${Math.min(r.days, r.needDays)}/${r.needDays}`],
    [r.reserve, '3 раза «с запасом»'],
    [r.checked, 'Техника проверена'],
  ];
  return (
    <div className="mt-4 rounded-2xl bg-surface-2 p-3">
      <div className="text-[13px] font-medium text-muted">До следующего уровня</div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
        {items.map(([ok, text]) => (
          <li key={text} className={`flex items-center gap-1.5 ${ok ? 'text-ink' : 'text-muted'}`}>
            {ok ? <CircleCheck size={15} className="shrink-0 text-calm" /> : <Circle size={15} className="shrink-0 text-faint" />}{text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const dotClass = (t: BlockType) => (BLOCK_INFO[t].color === 'squeeze' ? 'bg-squeeze' : t === 'breath' ? 'bg-breath' : 'bg-calm');

function BlockBar({ tl }: { tl: Timeline }) {
  return (
    <div className="mt-4 flex gap-[2px]" aria-hidden>
      {tl.blocks.map((b, i) => (
        <div key={i} style={{ flexGrow: b.end - b.start }}
          className={`h-2 rounded-full ${BLOCK_INFO[b.type].color === 'squeeze' ? 'bg-squeeze/80' : b.type === 'breath' ? 'bg-breath/70' : 'bg-calm/70'}`} />
      ))}
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
    case 'knack': return b.tasks.map(t => `${b.reps} × ${KNACK_TASKS[t].title}`).join(', ');
  }
}

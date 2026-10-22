import { motion } from 'motion/react';
import { ArrowUpRight, Circle, CircleCheck, ClipboardCheck, Clock, Flame, Mic, MicOff, Play, Settings2, Smartphone, TrendingUp, Vibrate, VibrateOff, Volume2, VolumeX, Waves, X } from 'lucide-react';
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

/** Плавное появление карточек по очереди */
const rise = (i: number) => ({
  initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay: 0.07 * i, ease: [0.22, 1, 0.36, 1] as const },
});

/** Цель дня как циферблат: деления, золотая дуга и стрелка */
function Dial({ done, goal, label }: { done: number; goal: number; label: string }) {
  const r = 58, len = 2 * Math.PI * r;
  const p = Math.min(1, done / goal);
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="relative size-[150px] shrink-0">
      <svg viewBox="0 0 150 150" className="size-full" aria-hidden>
        <defs>
          <linearGradient id="dialGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3dcab" />
            <stop offset="0.5" stopColor="#cfab6f" />
            <stop offset="1" stopColor="#8c6b3a" />
          </linearGradient>
        </defs>
        {ticks.map(i => {
          const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
          const r1 = 71, r2 = big ? 64 : 67.5;
          return <line key={i} x1={75 + r1 * Math.sin(a)} y1={75 - r1 * Math.cos(a)} x2={75 + r2 * Math.sin(a)} y2={75 - r2 * Math.cos(a)}
            stroke="#d6b67e" strokeOpacity={big ? 0.75 : 0.32} strokeWidth={big ? 1.4 : 0.8} strokeLinecap="round" />;
        })}
        <circle cx="75" cy="75" r={r} fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="2.5" />
        <motion.circle cx="75" cy="75" r={r} fill="none" stroke="url(#dialGold)" strokeWidth="2.5" strokeLinecap="round" transform="rotate(-90 75 75)"
          strokeDasharray={len} initial={{ strokeDashoffset: len }} animate={{ strokeDashoffset: len * (1 - p) }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} />
        <circle cx="75" cy="75" r="49" fill="none" stroke="#d6b67e" strokeOpacity="0.18" strokeWidth="0.75" />
        {/* метка-«жемчужина» на кольце показывает, сколько пройдено */}
        <motion.g initial={{ rotate: 0 }} animate={{ rotate: p * 360 }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} style={{ originX: '75px', originY: '75px' }}>
          <line x1="75" y1="24" x2="75" y2="11" stroke="url(#dialGold)" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="75" cy={75 - r} r="3.4" fill="#f3dcab" stroke="#8c6b3a" strokeWidth="0.8" />
        </motion.g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        <div className="font-display text-[40px] leading-none">{done}<span className="text-[22px] opacity-50">/{goal}</span></div>
        <div className="eyebrow mt-1.5 text-[9.5px] opacity-60">{label}</div>
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
      <header className="flex items-start justify-between pt-7 pb-6">
        <div>
          <div className="eyebrow text-gold">{capitalize(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          <h1 className="font-display mt-2.5 text-[44px] leading-[0.98]">{greeting()}</h1>
        </div>
        <IconButton label="Настройки" onClick={onSettings} className="hairline mt-1 bg-surface"><Settings2 size={19} strokeWidth={1.6} /></IconButton>
      </header>

      {/* цель дня или недели — циферблат на тёмной витрине */}
      <motion.section {...rise(0)} className="vitrine relative overflow-hidden rounded-[32px] p-5 shadow-[var(--shadow)]">
        <span className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-[radial-gradient(circle,rgba(214,182,126,0.22),transparent_65%)]" />
        <div className="relative flex items-center gap-4">
          {plan.mode === 'maintenance' ? <Dial done={week} goal={WEEK_TARGET} label="за неделю" /> : <Dial done={done} goal={goal} label="сегодня" />}
          <div className="min-w-0">
            <div className="eyebrow text-[#d6b67e]">{plan.mode === 'maintenance' ? 'Неделя' : 'Сегодня'}</div>
            <div className="font-display mt-1.5 text-[23px] leading-[1.1]">{goalTitle}</div>
            <p className="mt-2 text-[13.5px] leading-snug text-muted">{goalText}</p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#d6b67e]/45 px-3 py-1 text-[12.5px] font-medium tracking-wide">
              <Flame size={14} className="text-[#d6b67e]" />
              {days ? `${days} ${plural(days, 'день', 'дня', 'дней')} подряд` : 'Начните серию'}
            </div>
          </div>
        </div>
      </motion.section>

      {showInstall && (
        <section className="card mt-3 flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-gold"><Smartphone size={19} strokeWidth={1.6} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[19px] leading-tight">Установите на экран «Домой»</div>
            <div className="text-[13px] text-muted">Без App Store: откроется как приложение и будет работать без интернета.</div>
          </div>
          <a href={INSTALL_URL} target={INSTALL_URL.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
            className="bg-gold-grad rounded-full px-4 py-2 text-[12px] font-medium tracking-[0.14em] text-on-accent uppercase">Как</a>
          <button type="button" aria-label="Скрыть" onClick={() => setSettings({ installHintHidden: true })} className="-mr-1 p-1 text-faint"><X size={18} /></button>
        </section>
      )}

      {/* при дискомфорте или если мышца не отпускается — только расслабление */}
      {(discomfort || tense) && (
        <Notice tone="gold" icon={<Waves size={20} />} title="Сегодня — только расслабление"
          action={<button type="button" onClick={() => onStart('relax')} className="bg-gold-grad rounded-full px-4 py-2 text-[12px] font-medium tracking-[0.14em] text-on-accent uppercase">2 мин</button>}>
          {tense
            ? 'По последней проверке мышца не отпускается полностью. Это признак перенапряжения: пока только расслабление и консультация специалиста по тазовому дну.'
            : 'После дискомфорта 1–2 дня делайте только расслабление. Если боль повторяется — к специалисту.'}
        </Notice>
      )}

      {check.due && (
        <Notice tone="breath" icon={<ClipboardCheck size={20} />}
          title={check.due === 'first' ? 'Сначала — проверка техники' : check.due === 'retry' ? 'Повторите проверку техники' : `Пора на контроль: ${check.days} ${plural(check.days ?? 0, 'день', 'дня', 'дней')} с прошлого`}
          action={<button type="button" onClick={onCheck} className="bg-gold-grad rounded-full px-4 py-2 text-[12px] font-medium tracking-[0.14em] text-on-accent uppercase">Пройти</button>}>
          Зеркало, ладонь и самотест силы — 3–4 минуты. Без свежей проверки приложение не предложит следующий уровень.
        </Notice>
      )}

      {plan.mode === 'maintenance' && plan.suggest && (
        <Notice tone="calm" icon={<TrendingUp size={20} />} title="Пора на интенсивный блок"
          action={<button type="button" onClick={startIntensive} className="bg-gold-grad rounded-full px-4 py-2 text-[12px] font-medium tracking-[0.14em] text-on-accent uppercase">Начать</button>}>
          {plan.suggest === 'drop' ? 'Самотест показал спад больше чем на 20 %.' : 'Прошло 3 месяца поддержки.'} 4 недели ежедневно на уровне «Пик», потом снова поддержка.
        </Notice>
      )}

      {/* готовность к следующему уровню */}
      {ready.ready && next && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card mt-3 flex items-center gap-3 border-gold/50 p-4">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[19px] leading-tight">{next.maintenance ? 'Пора на поддержку' : `Готовы к уровню ${next.id} «${next.name}»`}</div>
            <div className="text-[13px] text-muted">{ready.days} {plural(ready.days, 'день', 'дня', 'дней')} на уровне, все сжатия в полную силу и с запасом, техника проверена.</div>
          </div>
          <button type="button" onClick={() => setLevel(next.id)} className="bg-gold-grad rounded-full px-4 py-2 text-[12px] font-medium tracking-[0.14em] text-on-accent uppercase">Перейти</button>
        </motion.section>
      )}
      {ready.holdBack && plan.mode === 'training' && (
        <section className="card mt-3 p-4 text-[14px] leading-snug">
          Последние тренировки были тяжёлыми или с дискомфортом. Останьтесь на этом уровне, а при боли — на уровень ниже.
        </section>
      )}

      {/* основная тренировка */}
      <motion.section {...rise(1)} className="card mt-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow text-gold">
              {plan.mode === 'training' ? `Основная · уровень ${level.id} из ${MAINTENANCE_ID - 1}` : plan.mode === 'intensive' ? `Интенсивный блок · день ${plan.day} из ${INTENSIVE_DAYS}` : 'Полная тренировка · поддержка'}
            </div>
            <h2 className="font-display mt-2 text-[32px] leading-none">{level.name}</h2>
            <p className="mt-1.5 text-[14px] text-muted">{level.subtitle}</p>
          </div>
          <button type="button" onClick={onPlan} className="hairline flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
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
          <PrimaryButton onClick={() => onStart('main')} className="mt-5"><Play size={16} fill="currentColor" /> Начать основную</PrimaryButton>
        ) : (
          <SecondaryButton onClick={() => onStart('main')} className="mt-5 w-full"><Play size={16} /> {mainToday ? 'Повторить основную' : 'Начать основную'}</SecondaryButton>
        )}

        <div className="mt-3 flex gap-2">
          {quick.map(q => (
            <button key={q.label} type="button" onClick={q.set} aria-pressed={q.on}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border py-2 text-[12px] font-medium tracking-wide transition ${q.on ? 'border-gold/45 text-ink' : 'border-line text-faint'}`}>
              <q.icon size={15} strokeWidth={1.6} className={q.on ? 'text-gold' : ''} /> {q.label}
            </button>
          ))}
        </div>
      </motion.section>

      {/* лёгкая тренировка */}
      <motion.section {...rise(2)} className="card mt-3 p-5">
        <div className="eyebrow text-gold">{plan.mode === 'maintenance' ? 'Каждый день' : 'По желанию, 1–2 раза в день'}</div>
        <h2 className="font-display mt-2 text-[27px] leading-none">{plan.mode === 'maintenance' ? 'Ежедневный «Knack»' : 'Лёгкая тренировка'}</h2>
        <p className="mt-1 text-[14px] text-muted">{capitalize(lightLevel.blocks.filter(b => b.type !== 'release').map(b => blockTitle(b).toLowerCase()).join(', '))} и расслабление.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip><Clock size={14} /> {formatDuration(lightTl.total)}</Chip>
          <Chip tone="squeeze">{lightTl.contractions} {plural(lightTl.contractions, 'сокращение', 'сокращения', 'сокращений')}</Chip>
        </div>
        {!mainFirst && !goalMet ? (
          <PrimaryButton onClick={() => onStart('light')} className="mt-4"><Play size={16} fill="currentColor" /> Лёгкая тренировка</PrimaryButton>
        ) : (
          <SecondaryButton onClick={() => onStart('light')} className="mt-4 w-full"><Play size={16} /> Лёгкая тренировка</SecondaryButton>
        )}
      </motion.section>

      {/* совет дня */}
      <motion.figure {...rise(3)} className="mx-1 mt-9 border-l border-gold/60 pl-5">
        <div className="eyebrow mb-2 text-gold">Совет дня · {tip.title}</div>
        <blockquote className="font-display text-[20px] leading-snug italic">{tip.text}</blockquote>
      </motion.figure>
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
    <section className="card mt-3 p-4">
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${NOTICE_TONES[tone]}`}>{icon}</span>
        <div className="font-display min-w-0 flex-1 text-[19px] leading-tight">{title}</div>
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
    <div className="mt-4 rounded-[20px] border border-line p-3.5">
      <div className="eyebrow text-[10px] text-muted">До следующего уровня</div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
        {items.map(([ok, text]) => (
          <li key={text} className={`flex items-center gap-1.5 ${ok ? 'text-ink' : 'text-muted'}`}>
            {ok ? <CircleCheck size={15} className="shrink-0 text-gold" /> : <Circle size={15} className="shrink-0 text-faint" />}{text}
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
          className={`h-[3px] rounded-full ${BLOCK_INFO[b.type].color === 'squeeze' ? 'bg-squeeze' : b.type === 'breath' ? 'bg-breath' : 'bg-calm'}`} />
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

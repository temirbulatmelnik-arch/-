import { motion } from 'motion/react';
import { ArrowUpRight, Camera, Check, Download, Play, Settings2, X } from 'lucide-react';
import type { Actions } from '../App';
import { FaceArt, PostureArt } from '../components/Art';
import { Chip, IconButton, SectionTitle, capitalize, plural } from '../components/ui';
import { HABITS, TIPS } from '../engine/content';
import type { BlockId } from '../engine/exercises';
import { BLOCKS, EXTRA_PER_DAY } from '../engine/program';
import { daysBetween, dayKey, streak } from '../engine/stats';
import { minutes } from '../engine/timeline';
import { INSTALL_URL, isStandalone } from '../install/platform';
import { useStore } from '../store/store';
import { useBlock } from './useBlock';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

const ROMAN: Record<BlockId, string> = { face: 'I', posture: 'II' };

export function BlockCard({ block, onOpen }: { block: BlockId; onOpen: () => void }) {
  const b = useBlock(block);
  const info = BLOCKS[block];
  const per = b.plan.training.perWeek;
  const done = b.today > 0;
  const Art = block === 'face' ? FaceArt : PostureArt;
  const [first, ...rest] = info.title.split('-');
  return (
    <motion.button type="button" onClick={onOpen} whileTap={{ scale: 0.985 }}
      className={`text-card relative block h-[262px] w-full overflow-hidden rounded-[34px] text-left shadow-[var(--shadow)] ${block === 'face' ? 'bg-face' : 'bg-posture'}`}>
      <Art className="absolute top-3 -right-3 h-[250px] w-auto opacity-80" />
      {/* мягкий свет сверху и виньетка снизу */}
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_15%_0%,rgba(255,255,255,0.35),transparent_70%)] dark:bg-[radial-gradient(80%_60%_at_15%_0%,rgba(255,255,255,0.08),transparent_70%)]" />
      <div className="relative flex h-full flex-col p-6">
        <div className="overline opacity-60">Блок {ROMAN[block]}</div>
        <h2 className="font-display mt-2 text-[44px] leading-[0.92]">
          {rest.length ? <>{first}-<br />{rest.join('-')}</> : info.title}
        </h2>
        <p className="mt-2.5 text-[13.5px] font-medium opacity-70">{info.tagline}</p>
        <div className="mt-auto flex items-end gap-3">
          <div className="space-y-2">
            <Chip tone="glass">Уровень {b.plan.level.id} · {b.plan.level.name}</Chip>
            <div className="flex items-center gap-2 pl-1 text-[12.5px] font-medium opacity-80">
              <span className="flex gap-1" aria-label={`${b.week} из ${per} на неделе`}>
                {Array.from({ length: per }, (_, i) => <span key={i} className={`size-1.5 rounded-full ${i < b.week ? 'bg-current' : 'bg-current opacity-25'}`} />)}
              </span>
              {done ? <span className="flex items-center gap-1"><Check size={13} strokeWidth={3} /> сегодня сделано</span> : <span>{minutes(b.timeline.total)} сегодня</span>}
            </div>
          </div>
          <span className="ml-auto grid size-12 shrink-0 place-items-center rounded-full bg-white/55 backdrop-blur-md dark:bg-white/12"><ArrowUpRight size={21} /></span>
        </div>
      </div>
    </motion.button>
  );
}

function RitualRow({ done, title, hint, onToggle, action }: { done: boolean; title: string; hint: string; onToggle?: () => void; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <button type="button" onClick={onToggle} disabled={!onToggle} aria-pressed={done} aria-label={title}
        className={`grid size-7 shrink-0 place-items-center rounded-full border transition ${done ? 'border-gold bg-gold text-on-accent' : 'border-gold/45'}`}>
        {done && <Check size={15} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] font-medium ${done ? 'text-muted line-through decoration-gold/50' : ''}`}>{title}</div>
        <div className="text-[13px] leading-snug text-muted">{hint}</div>
      </div>
      {action}
    </div>
  );
}

function Rituals({ actions }: { actions: Actions }) {
  const habits = useStore(s => s.habits[dayKey(new Date())] ?? {});
  const toggle = useStore(s => s.toggleHabit);
  const posture = useBlock('posture');
  const face = useBlock('face');
  const breaks = posture.todayOf('break');
  const breakGoal = EXTRA_PER_DAY.break!;
  const jaw = face.extras.find(x => x.kind === 'jaw');
  const jawDone = face.todayOf('jaw');
  const play = (block: BlockId, kind: 'break' | 'jaw', label: string) => (
    <button type="button" onClick={() => actions.start(block, kind)} aria-label={label}
      className="hairline grid size-10 shrink-0 place-items-center rounded-full bg-surface text-gold"><Play size={16} fill="currentColor" className="translate-x-px" /></button>
  );
  return (
    <div className="card mx-4 divide-y divide-line overflow-hidden">
      <RitualRow done={breaks >= breakGoal} title={`Минутная пауза · ${breaks} из ${breakGoal}`} hint="Каждые 30–60 минут сидения: кивки, лопатки, разгибание" action={play('posture', 'break', 'Начать минутную паузу')} />
      {jaw && <RitualRow done={jawDone >= 2} title={`${jaw.items[0].ex === 'chew' ? 'Жевание' : 'Сжатие зубов'} · ${jawDone} из 2`} hint={jaw.items[0].ex === 'chew' ? `${minutes(jaw.total)}, сторона меняется по сигналу` : '10 секунд почти в полную силу'} action={play('face', 'jaw', 'Начать занятие для челюсти')} />}
      {[...HABITS.face, ...HABITS.posture].map(h => <RitualRow key={h.id} done={!!habits[h.id]} title={h.title} hint={h.hint} onToggle={() => toggle(h.id)} />)}
    </div>
  );
}

function CheckNotice({ block, actions }: { block: BlockId; actions: Actions }) {
  const { checkPlan } = useBlock(block);
  const kind = block === 'posture' ? 'cva' : 'profile';
  const days = daysBetween(new Date(), checkPlan.next);
  const title = block === 'posture' ? 'Фото осанки' : 'Фото профиля';
  return (
    <button type="button" onClick={() => actions.check(kind)} className="card flex w-full items-center gap-3.5 px-5 py-4 text-left">
      <span className={`grid size-11 shrink-0 place-items-center rounded-full ${checkPlan.due ? 'bg-gold-grad text-on-accent' : 'bg-surface-2 text-gold'}`}><Camera size={19} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}{checkPlan.week ? ` · неделя ${checkPlan.week}` : ' · исходное'}</span>
        <span className="block text-[13px] text-muted">{checkPlan.due ? 'Пора сделать замер' : `Через ${days} ${plural(days, 'день', 'дня', 'дней')}`}</span>
      </span>
      <ArrowUpRight size={18} className="text-faint" />
    </button>
  );
}

export function Home({ actions }: { actions: Actions }) {
  const history = useStore(s => s.history);
  const hintHidden = useStore(s => s.settings.installHintHidden);
  const setSettings = useStore(s => s.setSettings);
  const now = new Date();
  const s = streak(history, now);
  const date = capitalize(now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
  const all = [...TIPS.face, ...TIPS.posture];
  const tip = all[Math.floor(now.getTime() / 86_400_000) % all.length];
  const showInstall = !hintHidden && !isStandalone();

  return (
    <div>
      <header className="flex items-start justify-between gap-3 px-6 pt-7">
        <div>
          <div className="overline text-gold">{date}</div>
          <h1 className="font-display mt-2.5 text-[46px] leading-[0.95]">{greeting(now)}</h1>
          <p className="mt-2.5 text-[15px] text-muted">{s > 0 ? `${s} ${plural(s, 'день', 'дня', 'дней')} подряд — линия держится` : 'Два ритуала: лицо и осанка'}</p>
        </div>
        <IconButton label="Настройки" onClick={actions.settings} className="hairline mt-1 bg-surface"><Settings2 size={19} /></IconButton>
      </header>

      <div className="mt-7 space-y-4 px-4">
        <BlockCard block="face" onOpen={() => actions.openBlock('face')} />
        <BlockCard block="posture" onOpen={() => actions.openBlock('posture')} />
      </div>

      <SectionTitle>Ритуалы дня</SectionTitle>
      <Rituals actions={actions} />

      <SectionTitle>Замеры</SectionTitle>
      <div className="space-y-3 px-4">
        <CheckNotice block="face" actions={actions} />
        <CheckNotice block="posture" actions={actions} />
      </div>

      <figure className="mx-6 mt-10 border-l border-gold/60 pl-5">
        <div className="overline mb-2 text-gold">Совет дня</div>
        <blockquote className="font-display text-[22px] leading-snug italic">{tip}</blockquote>
      </figure>

      {showInstall && (
        <div className="card relative mx-4 mt-8 flex items-center gap-3.5 px-5 py-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-gold"><Download size={19} /></span>
          <a href={INSTALL_URL} className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Установить на телефон</span>
            <span className="block text-[13px] text-muted">Значок на экране «Домой», работает без интернета</span>
          </a>
          <IconButton label="Скрыть" onClick={() => setSettings({ installHintHidden: true })} className="size-9 text-faint"><X size={16} /></IconButton>
        </div>
      )}
      <p className="font-display mt-10 text-center text-[15px] text-faint italic">Линия — шея и овал лица</p>
    </div>
  );
}

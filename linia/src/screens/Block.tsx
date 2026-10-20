// Экран блока: живая 3D-анатомия, занятие на сегодня, дополнительные ритуалы, путь по уровням,
// замеры, библиотека упражнений и честные ожидания.
import { AlertTriangle, ArrowLeft, Camera, Check, ChevronRight, CircleCheck, Lock, Play, Ruler, Scale, ShieldCheck, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Actions } from '../App';
import { ExerciseDemo, FigureLegend, GuideText } from '../components/Exercise';
import { Figure, useDemoMotion, viewFor } from '../components/Figure';
import { Chip, IconButton, PrimaryButton, SecondaryButton, SectionTitle, Sheet, plural } from '../components/ui';
import { EXPECT, LIFESTYLE, STOP_SIGNS } from '../engine/content';
import { EXERCISES, type BlockId, type ExerciseId } from '../engine/exercises';
import { doseText } from '../engine/format';
import { BOOST_DAYS } from '../engine/plan';
import { BLOCKS, LEVELS, SESSION_HINT, SESSION_TITLE, type Item, type Level, type SessionKind } from '../engine/program';
import { regressSignal, weekDays, type CheckKind } from '../engine/stats';
import { minutes } from '../engine/timeline';
import { neckFlagged, useStore } from '../store/store';
import { useBlock } from './useBlock';

const KIND_ICON: Record<SessionKind, string> = { core: '◆', break: '1′', stretch: '∿', walk: '↗', screen: '▭', jaw: '◠' };

function Hero({ block, first, live, onClose }: { block: BlockId; first: ExerciseId; live: boolean; onClose: () => void }) {
  const { motion: mo } = useDemoMotion(first);
  const info = BLOCKS[block];
  const e = EXERCISES[first];
  return (
    <div className={`text-card relative overflow-hidden rounded-b-[40px] pb-6 ${block === 'face' ? 'bg-face' : 'bg-posture'}`}>
      <div className="pt-safe relative z-10 flex items-center justify-between px-4 pt-3">
        <IconButton label="Назад" onClick={onClose} className="bg-white/45 backdrop-blur-md dark:bg-white/10"><ArrowLeft size={20} /></IconButton>
        <span className="eyebrow opacity-60">{block === 'face' ? 'Блок I' : 'Блок II'}</span>
        <span className="size-11" />
      </div>
      {/* 3D растворяется книзу; пока идёт занятие, сцена шапки не рисуется */}
      <div className="relative -mt-6 h-[340px] [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
        {live && <Figure motion={mo} pose={e.pose} view={viewFor(first)} xray muscles={e.muscles} autoRotate className="h-full w-full" />}
      </div>
      <div className="relative px-6">
        <h1 className="font-display text-[48px] leading-[0.95]">{info.title}</h1>
        <p className="mt-2 text-[14px] font-medium opacity-70">{info.tagline}</p>
        <p className="mt-3 max-w-[34ch] text-[15px] leading-snug opacity-85">{info.focus}</p>
      </div>
    </div>
  );
}

function ItemRow({ item, stage, index, onOpen }: { item: Item; stage: number; index: number; onOpen: () => void }) {
  const e = EXERCISES[item.ex];
  const title = item.circuit ? 'Круг Y–T–W лёжа на животе' : e.title;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3.5 py-3 text-left">
      <span className="font-display w-6 shrink-0 text-[20px] text-gold">{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-[13px] text-muted">{doseText(item, stage)}{item.effort ? ` · усилие ${item.effort}` : ''}</span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-faint" />
    </button>
  );
}

function Today({ block, actions, onExercise }: { block: BlockId; actions: Actions; onExercise: (ex: ExerciseId) => void }) {
  const b = useBlock(block);
  const flagged = useStore(s => neckFlagged(s));
  const done = b.today > 0;
  const per = b.plan.training.perWeek;
  const days = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const week = useWeek(block);
  const wd = (new Date().getDay() + 6) % 7;
  return (
    <div className="card mx-4 overflow-hidden">
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between">
          <div className="eyebrow text-gold">Сегодня</div>
          <Chip tone="gold"><Timer size={13} /> {minutes(b.timeline.total)}</Chip>
        </div>
        <h3 className="font-display mt-2 text-[30px] leading-tight">{done ? 'Занятие выполнено' : `Занятие · уровень ${b.plan.training.id}`}</h3>
        <p className="mt-1 text-[14px] text-muted">
          {b.plan.training.name} · {b.week} из {per} на этой неделе{b.plan.stage > 0 && !b.plan.level.maintenance ? ` · ступень ${b.plan.stage + 1}` : ''}
        </p>
        {b.plan.boostDay && (
          <p className="mt-3 rounded-2xl bg-gold/12 px-4 py-3 text-[14px] leading-snug">Возврат к уровню «Выносливость»: день {b.plan.boostDay} из {BOOST_DAYS}. Затем снова поддержка.</p>
        )}
        {block === 'posture' && flagged && (
          <p className="mt-3 flex gap-2.5 rounded-2xl bg-warn/10 px-4 py-3 text-[14px] leading-snug"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
            В опроснике есть отметки о шее. Начните занятия после консультации врача — в настройках можно отметить, что врач разрешил.</p>
        )}
      </div>
      <div className="mt-2 divide-y divide-line px-5">
        {b.items.map((it, i) => <ItemRow key={i} item={it} index={i} stage={b.plan.stage} onOpen={() => onExercise(it.ex)} />)}
      </div>
      <div className="px-5 pt-3 pb-5">
        <PrimaryButton onClick={() => actions.start(block, 'core')}><Play size={18} fill="currentColor" /> {done ? 'Повторить занятие' : 'Начать занятие'}</PrimaryButton>
        <div className="mt-4 flex justify-between px-1" aria-label="Неделя">
          {days.map((d, i) => {
            const mark = week[i];
            return (
              <div key={d} className="flex flex-col items-center gap-1.5">
                <span className={`grid size-8 place-items-center rounded-full text-[11px] font-semibold ${mark ? 'bg-gold-grad text-on-accent' : i === wd ? 'ring-1 ring-gold' : 'bg-surface-2 text-faint'}`}>
                  {mark ? <Check size={14} strokeWidth={3} /> : d}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function useWeek(block: BlockId) {
  const history = useStore(s => s.history);
  return useMemo(() => weekDays(history, block), [history, block]);
}

function Extras({ block, actions }: { block: BlockId; actions: Actions }) {
  const b = useBlock(block);
  if (!b.extras.length) return null;
  return (
    <>
      <SectionTitle>Ритуалы между занятиями</SectionTitle>
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {b.extras.map(x => {
          const today = b.todayOf(x.kind);
          const title = x.kind === 'jaw' ? (x.items[0].ex === 'chew' ? 'Жевание' : 'Сжатие зубов') : SESSION_TITLE[x.kind];
          const hint = x.kind === 'jaw' ? (x.items[0].ex === 'chew' ? '2 раза в день, обычная жвачка без сахара' : '10 секунд дважды в день') : SESSION_HINT[x.kind];
          return (
            <button key={x.kind} type="button" onClick={() => actions.start(block, x.kind)} className="card flex w-[200px] shrink-0 snap-start flex-col p-4 text-left">
              <div className="flex items-center justify-between">
                <span className="font-display grid size-10 place-items-center rounded-full bg-surface-2 text-[18px] text-gold">{KIND_ICON[x.kind]}</span>
                <span className="text-[12px] font-medium text-muted">{minutes(x.total)}</span>
              </div>
              <div className="mt-3 text-[15px] font-semibold">{title}</div>
              <div className="mt-1 text-[12.5px] leading-snug text-muted">{hint}</div>
              <div className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-gold">{today ? <><CircleCheck size={14} /> сегодня {today}</> : <><Play size={12} fill="currentColor" /> начать</>}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Path({ block, actions }: { block: BlockId; actions: Actions }) {
  const b = useBlock(block);
  const setLevel = useStore(s => s.setLevel);
  const checks = useStore(s => s.checks);
  const startBoost = useStore(s => s.startBoost);
  const [pick, setPick] = useState<Level | null>(null);
  const r = b.ready;
  const cur = b.plan.level;
  const regress = block === 'posture' && cur.maintenance && !b.bs.boost ? regressSignal(checks, b.bs.levelSince) : null;
  return (
    <>
      <SectionTitle>Путь</SectionTitle>
      <div className="card mx-4 p-5">
        {!r.last ? (
          <>
            <div className="text-[14px] text-muted">Следующий уровень откроется, когда выполнено всё:</div>
            <ul className="mt-3 space-y-2.5 text-[14.5px]">
              {[
                [r.streak >= r.need, `${r.need} занятия подряд «с запасом» — ${r.streak} из ${r.need}`],
                [r.days >= r.needDays, `${r.needDays} ${plural(r.needDays, 'день', 'дня', 'дней')} на уровне — прошло ${r.days}`],
                [r.checked, 'Проверка техники на этом уровне'],
                [!r.holdBack, 'Без боли и срывов техники в последних занятиях'],
              ].map(([ok, t], i) => (
                <li key={i} className="flex gap-2.5"><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${ok ? 'bg-gold text-on-accent' : 'border border-gold/45'}`}>{ok ? <Check size={12} strokeWidth={3} /> : null}</span>{t as string}</li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] leading-snug text-muted">{cur.criteria}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <SecondaryButton onClick={() => actions.tech(block)}><ShieldCheck size={16} /> Техника</SecondaryButton>
              {r.ready
                ? <PrimaryButton className="h-12" onClick={() => setLevel(block, cur.id + 1)}>Уровень {cur.id + 1}</PrimaryButton>
                : <SecondaryButton onClick={() => setPick(LEVELS[block][cur.id] ?? null)}><Lock size={15} /> Уровень {cur.id + 1}</SecondaryButton>}
            </div>
          </>
        ) : (
          <>
            <p className="text-[14.5px] leading-snug">{cur.criteria}</p>
            {regress && (
              <div className="mt-3 rounded-2xl bg-gold/12 p-4 text-[14px] leading-snug">
                {regress === 'cva' ? 'Угол шеи падает три замера подряд.' : 'Тест выносливости шеи стал хуже на 10 секунд.'} Вернитесь на 2 недели к уровню «Выносливость».
                <PrimaryButton className="mt-3 h-12" onClick={startBoost}>Начать 2 недели</PrimaryButton>
              </div>
            )}
          </>
        )}
      </div>
      <div className="mt-4 space-y-2 px-4">
        {LEVELS[block].map(l => {
          const here = l.id === cur.id;
          const past = l.id < cur.id;
          return (
            <button key={l.id} type="button" onClick={() => setPick(l)}
              className={`flex w-full items-center gap-4 rounded-[22px] border px-4 py-3.5 text-left transition ${here ? 'border-gold/70 bg-surface shadow-[var(--shadow)]' : 'border-line'}`}>
              <span className={`font-display grid size-11 shrink-0 place-items-center rounded-full text-[22px] ${here ? 'bg-gold-grad text-on-accent' : past ? 'bg-gold/15 text-gold' : 'bg-surface-2 text-faint'}`}>{past ? <Check size={18} /> : l.id}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{l.name}</span>
                <span className="block text-[13px] text-muted">{l.weeks} · {l.subtitle}</span>
              </span>
              <ChevronRight size={17} className="text-faint" />
            </button>
          );
        })}
      </div>
      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick ? `${pick.id}. ${pick.name}` : ''}>
        {pick && <LevelDetails level={pick} current={cur.id} onChoose={() => { setLevel(block, pick.id); setPick(null); }} />}
      </Sheet>
    </>
  );
}

function LevelDetails({ level, current, onChoose }: { level: Level; current: number; onChoose: () => void }) {
  const items = level.items;
  return (
    <div>
      <p className="text-[15px] text-muted">{level.weeks} · не меньше {level.minDays || '—'} {level.minDays ? plural(level.minDays, 'дня', 'дней', 'дней') : ''} · {level.perWeek} {plural(level.perWeek, 'занятие', 'занятия', 'занятий')} в неделю</p>
      <p className="mt-2 text-[15px]">{level.subtitle}.</p>
      <div className="mt-4 divide-y divide-line">
        {items.map((it, i) => (
          <div key={i} className="flex gap-3 py-2.5">
            <span className="font-display w-5 text-[18px] text-gold">{i + 1}</span>
            <div>
              <div className="text-[15px] font-medium">{it.circuit ? 'Круг Y–T–W' : EXERCISES[it.ex].title}{it.only ? <span className="text-muted"> · по желанию</span> : null}</div>
              <div className="text-[13px] text-muted">{doseText(it)}{Array.isArray(it.hold) || Array.isArray(it.reps) ? ' — растёт с каждым занятием «с запасом»' : ''}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-[14px] leading-snug"><span className="eyebrow mr-1.5 text-gold">Переход</span> {level.criteria}</p>
      {level.id !== current && (
        <div className="mt-5">
          <SecondaryButton className="w-full" onClick={onChoose}>Перейти на этот уровень</SecondaryButton>
          <p className="mt-2 text-center text-[12.5px] text-muted">Срок уровня начнётся заново. Перескакивать вперёд не стоит: поза меняется не раньше чем через 4 недели.</p>
        </div>
      )}
    </div>
  );
}

const CHECK_CARDS: Record<BlockId, { kind: CheckKind; title: string; hint: string; icon: typeof Camera }[]> = {
  posture: [
    { kind: 'cva', title: 'Угол шеи по фото', hint: 'Козелок — C7 — горизонталь, плюс угол плеча', icon: Camera },
    { kind: 'dnf', title: 'Тест выносливости шеи', hint: 'Сколько секунд голова держится на 2 см', icon: Timer },
    { kind: 'acromion', title: 'Плечи лёжа', hint: 'Расстояние от акромиона до пола', icon: Ruler },
  ],
  face: [
    { kind: 'profile', title: 'Фото профиля', hint: 'Шейно-подбородочный угол', icon: Camera },
    { kind: 'front', title: 'Фото анфас', hint: 'Ширина и симметрия нижней челюсти', icon: Camera },
    { kind: 'body', title: 'Масса и шея', hint: 'Средняя масса за неделю и окружность шеи', icon: Scale },
  ],
};

function Checks({ block, actions }: { block: BlockId; actions: Actions }) {
  const checks = useStore(s => s.checks);
  const { checkPlan } = useBlock(block);
  return (
    <>
      <SectionTitle>Замеры</SectionTitle>
      <p className="-mt-1 mb-3 px-6 text-[13.5px] leading-snug text-muted">
        {checkPlan.due ? 'Пора сделать замер. ' : ''}В начале, на 4-й, 8-й и 12-й неделе{block === 'posture' ? ', дальше раз в месяц' : ', дальше раз в 3 недели'}. Телефон уверенно видит только изменения больше 5°, поэтому важен тренд.
      </p>
      <div className="space-y-2.5 px-4">
        {CHECK_CARDS[block].map(c => {
          const own = checks.filter(x => x.kind === c.kind);
          const last = own[own.length - 1];
          const value = last ? lastValue(c.kind, last.values) : null;
          return (
            <button key={c.kind} type="button" onClick={() => actions.check(c.kind)} className="card flex w-full items-center gap-3.5 px-5 py-4 text-left">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-gold"><c.icon size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{c.title}</span>
                <span className="block text-[13px] text-muted">{c.hint}</span>
              </span>
              {value && <span className="font-display text-[22px]">{value}</span>}
              <ChevronRight size={17} className="text-faint" />
            </button>
          );
        })}
      </div>
    </>
  );
}

export function lastValue(kind: CheckKind, v: Record<string, number | undefined>): string | null {
  switch (kind) {
    case 'cva': return v.cva !== undefined ? `${v.cva.toFixed(1)}°` : null;
    case 'dnf': return v.seconds !== undefined ? `${Math.round(v.seconds)} с` : null;
    case 'profile': return v.angle !== undefined ? `${Math.round(v.angle)}°` : null;
    case 'body': return v.weight !== undefined ? `${v.weight.toFixed(1)} кг` : v.neck !== undefined ? `${v.neck} см` : null;
    case 'acromion': return v.left !== undefined || v.right !== undefined ? `${Math.round(((v.left ?? v.right!) + (v.right ?? v.left!)) / 2)} мм` : null;
    case 'front': return null;
  }
}

function Library({ block, onExercise }: { block: BlockId; onExercise: (ex: ExerciseId) => void }) {
  const all = (Object.keys(EXERCISES) as ExerciseId[]).filter(id => EXERCISES[id].block === block);
  return (
    <>
      <SectionTitle>Библиотека</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 px-4">
        {all.map(id => {
          const e = EXERCISES[id];
          return (
            <button key={id} type="button" onClick={() => onExercise(id)} className="card flex min-h-[112px] flex-col p-4 text-left">
              <span className="text-[14.5px] leading-snug font-semibold">{e.title}</span>
              <span className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-muted">{e.short}</span>
              <span className="mt-auto pt-2 text-[11px] font-semibold tracking-wide text-gold uppercase">{e.muscles.work.length ? 'работа' : 'растяжка'}{e.jaw ? ' · челюсть' : ''}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Honest({ block }: { block: BlockId }) {
  const rows = EXPECT.filter(e => e.block === block);
  return (
    <>
      <SectionTitle>Чего ждать</SectionTitle>
      <div className="space-y-2.5 px-4">
        {rows.map(r => (
          <div key={r.goal} className="card p-5">
            <div className="font-display text-[22px] leading-tight">{r.goal}</div>
            <p className="mt-2 text-[14.5px] leading-snug">{r.real}</p>
            <div className="mt-3 flex flex-wrap gap-2"><Chip tone="gold">{r.when}</Chip></div>
            <p className="mt-3 text-[13px] leading-snug text-muted"><span className="eyebrow mr-1.5 text-warn">Не будет</span>{r.not}</p>
          </div>
        ))}
      </div>
      {block === 'face' && (
        <>
          <SectionTitle>Что меняет овал сильнее упражнений</SectionTitle>
          <div className="card mx-4 divide-y divide-line">
            {LIFESTYLE.map(l => (
              <details key={l.title} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-medium">{l.title}<ChevronRight size={16} className="text-faint transition group-open:rotate-90" /></summary>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{l.text}</p>
              </details>
            ))}
          </div>
        </>
      )}
      <div className="mx-4 mt-4 rounded-[22px] bg-warn/8 p-5">
        <div className="eyebrow mb-2 text-warn">Когда остановиться</div>
        <ul className="space-y-1.5 text-[14px] leading-snug">{STOP_SIGNS[block].map(s => <li key={s}>— {s}</li>)}</ul>
      </div>
    </>
  );
}

export function ExerciseSheet({ ex, onClose }: { ex: ExerciseId | null; onClose: () => void }) {
  return (
    <Sheet open={!!ex} onClose={onClose} title={ex ? EXERCISES[ex].title : ''}>
      {ex && (
        <div>
          <p className="-mt-1 mb-4 text-[15px] text-muted">{EXERCISES[ex].short}</p>
          <ExerciseDemo ex={ex} />
          <div className="mt-2.5"><FigureLegend /></div>
          <div className="mt-6"><GuideText ex={ex} /></div>
        </div>
      )}
    </Sheet>
  );
}

export function Block({ block, actions, covered = false, onClose }: { block: BlockId; actions: Actions; covered?: boolean; onClose: () => void }) {
  const b = useBlock(block);
  const [ex, setEx] = useState<ExerciseId | null>(null);
  const first = b.items[0]?.ex ?? (block === 'face' ? 'ctar_hold' : 'nod_supine');
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md pb-16">
      <Hero block={block} first={first} live={!covered} onClose={onClose} />
      <div className="mt-5"><Today block={block} actions={actions} onExercise={setEx} /></div>
      <Extras block={block} actions={actions} />
      <Path block={block} actions={actions} />
      <Checks block={block} actions={actions} />
      <Library block={block} onExercise={setEx} />
      <Honest block={block} />
      <ExerciseSheet ex={ex} onClose={() => setEx(null)} />
    </div>
  );
}

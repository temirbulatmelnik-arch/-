// Превращает уровень программы в плоскую ленту шагов с длительностями.
// Плеер только «прокручивает» эту ленту по времени, поэтому вся логика тренировки здесь и тестируется.
import { BLOCK_INFO, KNACK_TASKS, POSITION_LABEL, blockTitle, type Block, type BlockType, type Level } from './program';

export type Phase = 'prep' | 'squeeze' | 'hold' | 'relax' | 'inhale' | 'exhale';
export type Cue = 'prep' | 'squeeze' | 'relax' | 'breath' | 'action' | 'none';

export interface Step {
  phase: Phase;
  label: string;
  hint?: string;
  /** секунды */
  duration: number;
  /** целевая сила сжатия: 0 — покой, 1 — максимум, < 0 — расширение на вдохе */
  level: number;
  /** за сколько секунд визуализация доходит до цели */
  ease: number;
  block: number;
  blockType: BlockType;
  rep?: number;
  reps?: number;
  cue: Cue;
  speak?: string;
  /** фраза посреди шага: [через сколько секунд, текст] */
  say?: [number, string];
  /** отдых перед упражнением */
  pause?: boolean;
  /** обратный отсчёт тиками в последние секунды */
  tick?: boolean;
  /** шаг — рабочее сокращение (для статистики) */
  contraction?: boolean;
}

export interface Timeline {
  steps: Step[];
  /** начало каждого шага, с */
  starts: number[];
  total: number;
  blocks: { type: BlockType; start: number; end: number }[];
  contractions: number;
  tension: number;
}

const PREP_FIRST = 7;
const PREP = 5;

function blockSteps(b: Block, block: number): Step[] {
  const base = { block, blockType: b.type };
  const out: Step[] = [];
  switch (b.type) {
    case 'breath':
    case 'release': {
      const release = b.type === 'release';
      for (let i = 1; i <= b.cycles; i++) {
        out.push({ ...base, phase: 'inhale', label: 'Вдох', hint: release ? 'Тазовое дно мягко опускается и раскрывается' : 'Медленно, животом', duration: b.inhale, level: release ? -0.32 : -0.22, ease: b.inhale, rep: i, reps: b.cycles, cue: 'breath', speak: i === 1 ? 'Вдох' : undefined });
        out.push({ ...base, phase: 'exhale', label: 'Выдох', hint: release ? 'Отпускайте полностью, без натуживания' : 'Плечи, живот и промежность отпускаются', duration: b.exhale, level: 0, ease: b.exhale, rep: i, reps: b.cycles, cue: 'none', speak: i === 1 ? 'Выдох' : undefined });
      }
      break;
    }
    case 'slow':
      for (let i = 1; i <= b.reps; i++) {
        // каждое третье удержание голос напоминает дышать: задержка дыхания и натуживание — частые ошибки
        const say: [number, string] | undefined = b.hold >= 6 && i % 3 === 1 ? [b.hold / 2, 'Дышите, не тужьтесь'] : undefined;
        out.push({ ...base, phase: 'hold', label: 'Максимум и держите', hint: 'Вверх и внутрь в полную силу. Дышите, не тужьтесь', duration: b.hold, level: 1, ease: 0.8, rep: i, reps: b.reps, cue: 'squeeze', speak: i === 1 ? 'Сожмите на максимум и держите' : 'Сжать', say, tick: b.hold >= 5, contraction: true });
        out.push({ ...base, phase: 'relax', label: 'Отпустите полностью', hint: 'Промежность возвращается на место, напряжение уходит до конца', duration: b.rest, level: 0, ease: 1.6, rep: i, reps: b.reps, cue: 'relax', speak: 'Отпустите полностью' });
      }
      break;
    case 'quick': {
      const front = b.cue === 'front';
      for (let i = 1; i <= b.reps; i++) {
        out.push({ ...base, phase: 'squeeze', label: 'Сжать!', hint: front ? 'Укоротите пенис, подтяните яички' : 'Резко, в полную силу', duration: b.on, level: 1, ease: 0.22, rep: i, reps: b.reps, cue: 'squeeze', contraction: true });
        out.push({ ...base, phase: 'relax', label: 'Отпустить', hint: 'Полностью', duration: b.off, level: 0, ease: 0.5, rep: i, reps: b.reps, cue: 'relax' });
      }
      break;
    }
    case 'lift': {
      const up = [
        { level: 0.33, label: 'Этаж 1 — треть силы', speak: 'Первый этаж' },
        { level: 0.66, label: 'Этаж 2 — сильнее', speak: 'Второй' },
        { level: 1, label: 'Этаж 3 — максимум', speak: 'Третий' },
      ];
      const down = [
        { level: 0.66, label: 'Спуск — этаж 2', speak: 'Вниз' },
        { level: 0.33, label: 'Спуск — этаж 1' },
        { level: 0, label: 'Первый этаж — отпустите' },
      ];
      for (let i = 1; i <= b.reps; i++) {
        up.forEach((u, k) => out.push({ ...base, phase: 'hold', label: u.label, hint: 'Добавляйте силу ступенькой', duration: b.floor, level: u.level, ease: 0.7, rep: i, reps: b.reps, cue: 'squeeze', speak: u.speak, contraction: k === 0 }));
        down.forEach(d => out.push({ ...base, phase: d.level ? 'hold' : 'relax', label: d.label, hint: 'Плавно, без провала', duration: Math.max(2, b.floor - 1), level: d.level, ease: 0.9, rep: i, reps: b.reps, cue: 'relax', speak: d.speak }));
        out.push({ ...base, phase: 'relax', label: 'Отпустите полностью', hint: 'Полное расслабление', duration: b.rest, level: 0, ease: 1, rep: i, reps: b.reps, cue: 'none', speak: 'Отпустите полностью' });
      }
      break;
    }
    case 'endurance':
      for (let i = 1; i <= b.reps; i++) {
        out.push({ ...base, phase: 'hold', label: 'Держите вполсилы', hint: 'Не задерживайте дыхание', duration: b.hold, level: b.intensity, ease: 1.2, rep: i, reps: b.reps, cue: 'squeeze', speak: 'Сжать вполсилы и держать', tick: true, contraction: true });
        out.push({ ...base, phase: 'relax', label: 'Отпустите полностью', hint: 'Отдых не короче удержания', duration: b.rest, level: 0, ease: 2, rep: i, reps: b.reps, cue: 'relax', speak: 'Отпустите полностью' });
      }
      break;
    case 'knack': {
      // сжатие за секунду до усилия, само усилие под сжатием, затем полное расслабление
      const reps = b.tasks.length * b.reps;
      let n = 0;
      for (const task of b.tasks) {
        const k = KNACK_TASKS[task];
        for (let i = 1; i <= b.reps; i++) {
          n++;
          out.push({ ...base, phase: 'hold', label: 'Сожмите заранее', hint: `Сначала сфинктер, потом ${k.title}`, duration: 1.5, level: 1, ease: 0.3, rep: n, reps, cue: 'squeeze', speak: 'Сжать', contraction: true });
          out.push({ ...base, phase: 'hold', label: k.action, hint: k.hint, duration: k.duration, level: 1, ease: 0.2, rep: n, reps, cue: 'action', speak: k.speak });
          out.push({ ...base, phase: 'relax', label: 'Отпустите полностью', duration: b.rest, level: 0, ease: 1.2, rep: n, reps, cue: 'relax' });
        }
      }
      break;
    }
  }
  return out;
}

/** blocksOnly — без шагов подготовки (для демонстрации упражнения по кругу) */
export function buildTimeline(level: Level, { blocksOnly = false } = {}): Timeline {
  const steps: Step[] = [];
  level.blocks.forEach((b, i) => {
    const info = BLOCK_INFO[b.type];
    const title = blockTitle(b);
    if (!blocksOnly && b.pause) steps.push({
      phase: 'relax', block: i, blockType: b.type, pause: true,
      label: 'Отдых', hint: `Отпустите полностью и восстановитесь. Дальше: ${title.toLowerCase()}`,
      duration: b.pause, level: 0, ease: 1.5, cue: 'relax', speak: 'Отдых', tick: true,
    });
    if (!blocksOnly) steps.push({
      phase: 'prep', block: i, blockType: b.type,
      label: title,
      hint: i === 0 ? `${POSITION_LABEL[level.position]}. ${info.how}` : info.how,
      duration: i === 0 ? PREP_FIRST : PREP, level: 0, ease: 1, cue: 'prep',
      speak: i === 0 ? `${title}. ${POSITION_LABEL[level.position]}` : title,
    });
    steps.push(...blockSteps(b, i));
  });

  const starts: number[] = [];
  let t = 0;
  for (const s of steps) { starts.push(t); t += s.duration; }

  const blocks = level.blocks.map((b, i) => {
    const first = steps.findIndex(s => s.block === i);
    const last = steps.length - 1 - [...steps].reverse().findIndex(s => s.block === i);
    return { type: b.type, start: starts[first], end: starts[last] + steps[last].duration };
  });

  const work = steps.filter(s => s.level > 0);
  return {
    steps, starts, total: t, blocks,
    contractions: steps.filter(s => s.contraction).length,
    tension: work.reduce((a, s) => a + s.duration, 0),
  };
}

/** Индекс шага и смещение внутри него для момента t (с начала тренировки) */
export function locate(tl: Timeline, t: number): { index: number; offset: number; done: boolean } {
  if (t >= tl.total) return { index: tl.steps.length - 1, offset: tl.steps[tl.steps.length - 1].duration, done: true };
  const time = Math.max(0, t);
  let lo = 0, hi = tl.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.starts[mid] <= time) lo = mid; else hi = mid - 1;
  }
  return { index: lo, offset: time - tl.starts[lo], done: false };
}

const smooth = (p: number) => p * p * (3 - 2 * p);

/** Текущая сила сжатия для визуализации: плавный переход от предыдущего шага к целевому */
export function levelAt(tl: Timeline, index: number, offset: number): number {
  const step = tl.steps[index];
  const from = index > 0 ? tl.steps[index - 1].level : 0;
  const p = Math.min(1, Math.max(0, offset / Math.max(0.01, step.ease)));
  return from + (step.level - from) * smooth(p);
}

/** Начало следующего блока — для кнопки «пропустить». Из паузы перед блоком — к самому блоку */
export function nextBlockStart(tl: Timeline, t: number): number {
  const { index, done } = locate(tl, t);
  if (!done && tl.steps[index].pause) return tl.starts[index + 1];
  const b = tl.blocks.find(b => b.start > t + 0.001);
  return b ? b.start : tl.total;
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? (r ? `${m} мин ${r} с` : `${m} мин`) : `${r} с`;
}

// Превращает занятие в плоскую ленту шагов с длительностями. Плеер только «прокручивает» ленту по времени,
// поэтому вся логика тренировки здесь и тестируется.
import { EXERCISES, POSE_LABEL, type Anim, type ExerciseId } from './exercises';
import { walkCues, type Item } from './program';

export type Phase = 'prep' | 'up' | 'hold' | 'down' | 'rest' | 'switch' | 'inhale' | 'exhale' | 'work';
export type Cue = 'prep' | 'go' | 'release' | 'breath' | 'switch' | 'none';
export type Side = 'l' | 'r';

export interface Step {
  phase: Phase;
  label: string;
  hint?: string;
  /** секунды */
  duration: number;
  /** куда идёт движение 3D-фигуры: 0 — исходное положение, 1 — конечное */
  amount: number;
  /** за сколько секунд фигура доходит до цели */
  ease: number;
  /** номер упражнения в занятии */
  item: number;
  ex: ExerciseId;
  anim: Anim;
  set?: number;
  sets?: number;
  rep?: number;
  reps?: number;
  side?: Side;
  cue: Cue;
  speak?: string;
  /** фразы посреди шага: [через сколько секунд, текст] */
  says?: [number, string][];
  /** обратный отсчёт тиками в последние секунды */
  tick?: boolean;
  /** шаг — рабочий повтор (для статистики) */
  counted?: boolean;
  /** удержание до потери техники: можно закончить раньше кнопкой */
  failure?: boolean;
}

export interface Timeline {
  steps: Step[];
  /** начало каждого шага, с */
  starts: number[];
  total: number;
  items: { ex: ExerciseId; start: number; end: number }[];
  reps: number;
  /** время под нагрузкой: удержания и рабочие фазы */
  work: number;
}

const COUNT = ['Раз', 'Два', 'Три', 'Четыре', 'Пять', 'Шесть', 'Семь', 'Восемь', 'Девять', 'Десять', 'Одиннадцать', 'Двенадцать', 'Тринадцать', 'Четырнадцать', 'Пятнадцать',
  'Шестнадцать', 'Семнадцать', 'Восемнадцать', 'Девятнадцать', 'Двадцать', 'Двадцать один', 'Двадцать два', 'Двадцать три', 'Двадцать четыре', 'Двадцать пять',
  'Двадцать шесть', 'Двадцать семь', 'Двадцать восемь', 'Двадцать девять', 'Тридцать'];
export const countWord = (n: number) => COUNT[n - 1] ?? String(n);

const SIDE_LABEL: Record<Side, string> = { l: 'левая сторона', r: 'правая сторона' };
const SET_REST = 30;
const PREP_FIRST = 8;
const PREP = 5;
/** смена положения тела — больше времени на подготовку */
const PREP_MOVE = 9;
const SWITCH = 5;

/** Ступень внутри уровня: значения-массивы растут с каждым занятием «с запасом» */
export const at = <T,>(v: T | T[] | undefined, stage: number): T | undefined => (Array.isArray(v) ? v[Math.min(v.length - 1, Math.max(0, stage))] : v);

/** Повторы одного упражнения на одну сторону */
function repSteps(item: Item, ex: ExerciseId, stage: number, base: Omit<Step, 'phase' | 'label' | 'duration' | 'amount' | 'ease' | 'cue'>, reps: number, sideOf: (rep: number) => Side | undefined): Step[] {
  const e = EXERCISES[ex];
  const out: Step[] = [];
  const hold = at(item.hold, stage);
  const w = e.words ?? {};
  for (let r = 1; r <= reps; r++) {
    const side = sideOf(r);
    const b = { ...base, rep: r, reps, side };
    const sideHint = item.alternate && side ? `Ладонь ${side === 'l' ? 'слева' : 'справа'}` : undefined;
    if (item.quick) {
      out.push({ ...b, phase: 'up', label: 'Нажать!', duration: 1, amount: 1, ease: 0.2, cue: 'go', counted: true });
      out.push({ ...b, phase: 'down', label: 'Отпустить', duration: 1, amount: 0, ease: 0.3, cue: 'release' });
    } else if (item.breaths) {
      out.push({ ...b, phase: 'inhale', label: 'Вдох', hint: 'Медленно, рёбра раскрываются', duration: 4, amount: 1, ease: 4, cue: 'breath', speak: r === 1 ? 'Вдох' : undefined, counted: true });
      out.push({ ...b, phase: 'exhale', label: 'Выдох', hint: 'Длинный, плечи опускаются', duration: 6, amount: 0, ease: 6, cue: 'none', speak: r === 1 ? 'Выдох' : undefined });
    } else if (item.tempo) {
      const [up, pause, down] = item.tempo;
      const top = hold ?? pause;
      out.push({ ...b, phase: 'up', label: w.up ?? 'Вверх', hint: sideHint, duration: up, amount: 1, ease: up, cue: 'go', speak: reps > 1 ? countWord(r) : w.up, counted: true });
      if (top > 0) out.push({ ...b, phase: 'hold', label: w.hold ?? 'Держите', hint: sideHint, duration: top, amount: 1, ease: 0.3, cue: 'none', tick: top >= 5, speak: top >= 5 ? w.hold ?? 'Держите' : undefined });
      out.push({ ...b, phase: 'down', label: w.down ?? 'Вниз', duration: down, amount: 0, ease: down, cue: 'release' });
      if (item.rest) out.push({ ...b, phase: 'rest', label: 'Пауза', duration: item.rest, amount: 0, ease: 0.5, cue: 'none' });
    } else if (hold) {
      const failure = !!item.failure;
      out.push({
        ...b, phase: 'hold', label: failure ? 'Держите, пока техника чистая' : w.up ?? 'Держите', hint: sideHint ?? (item.effort ? `Усилие ${item.effort}` : undefined),
        duration: hold, amount: 1, ease: Math.min(1.5, hold / 3), cue: 'go', speak: w.up ?? 'Держите', tick: hold >= 5 && !failure, counted: true, failure: failure || undefined,
        says: hold >= 20 ? [[Math.round(hold / 2), failure ? 'Подбородок прижат, дышите' : 'Дышите']] : undefined,
      });
      out.push({ ...b, phase: 'rest', label: w.down ?? 'Отпустите', hint: 'Полностью расслабьтесь', duration: Math.max(2, item.rest ?? hold), amount: 0, ease: 1.2, cue: 'release', speak: w.down ?? 'Отпустите', tick: (item.rest ?? hold) >= 10 });
    }
  }
  return out;
}

/** Растяжка, жевание, прогулка: одно длинное удержание с подсказками */
function timedSteps(item: Item, ex: ExerciseId, stage: number, base: Omit<Step, 'phase' | 'label' | 'duration' | 'amount' | 'ease' | 'cue'>, side?: Side): Step[] {
  const time = at(item.time, stage) ?? 30;
  const e = EXERCISES[ex];
  const b = { ...base, side, rep: undefined, reps: undefined };
  if (item.switchEvery) {
    // жевание: сторона меняется каждые switchEvery секунд
    const out: Step[] = [];
    const n = Math.max(1, Math.round(time / item.switchEvery));
    for (let k = 0; k < n; k++) {
      const s: Side = k % 2 ? 'r' : 'l';
      out.push({ ...b, phase: 'work', label: `Жуйте: ${s === 'l' ? 'левая' : 'правая'} сторона`, hint: 'Ритмично, в спокойном темпе', duration: time / n, amount: 1, ease: 1, side: s, cue: k ? 'switch' : 'go', speak: k ? 'Другая сторона' : 'Жуйте', tick: k === n - 1, counted: true, rep: k + 1, reps: n });
    }
    return out;
  }
  if (ex === 'walk_cue' || ex === 'screen_cue') {
    const every = ex === 'walk_cue' ? 40 : 120;
    const says: [number, string][] = [];
    for (let t = every, k = 1; t < time - 5; t += every, k++) says.push([t, ex === 'walk_cue' ? walkCues[k % walkCues.length] : 'Проверьте шею: макушка вверх, экран на уровне глаз, плечи опущены']);
    return [{ ...b, phase: 'work', label: e.title, hint: e.how, duration: time, amount: 1, ease: 1, cue: 'go', speak: ex === 'walk_cue' ? walkCues[0] : undefined, says, counted: true, tick: true }];
  }
  const says: [number, string][] | undefined = ex === 'trap_stretch' ? [[Math.round(time / 2), 'Теперь нос к подмышке']] : time >= 30 ? [[Math.round(time / 2), 'Дышите, натяжение мягкое']] : undefined;
  return [{ ...b, phase: 'hold', label: side ? `Держите: ${SIDE_LABEL[side]}` : 'Держите', hint: e.guide.feel, duration: time, amount: 1, ease: 2.5, cue: 'go', speak: 'Держите', says, tick: true, counted: true }];
}

function itemSteps(item: Item, index: number, stage: number, first: boolean, poseChanged: boolean, blocksOnly: boolean): Step[] {
  const e = EXERCISES[item.ex];
  const out: Step[] = [];
  const sets = item.sets ?? 1;
  const base = (ex: ExerciseId) => ({ item: index, ex, anim: EXERCISES[ex].anim, sets });
  if (!blocksOnly) {
    const effort = item.effort ? ` Усилие ${item.effort}.` : '';
    out.push({
      ...base(item.ex), phase: 'prep', label: item.circuit ? `Круг ${item.circuit.map(c => EXERCISES[c].title.match(/«(.)»/)?.[1] ?? '').join('–')}` : e.title,
      hint: `${first || poseChanged ? `${POSE_LABEL[e.pose]}. ` : ''}${e.how}${effort}`,
      duration: first ? PREP_FIRST : poseChanged ? PREP_MOVE : PREP, amount: 0, ease: 1, cue: 'prep',
      speak: poseChanged || first ? `${e.title}. ${POSE_LABEL[e.pose]}` : e.title,
    });
  }
  const reps = at(item.reps, stage) ?? 1;
  const timed = item.time !== undefined;
  for (let s = 1; s <= sets; s++) {
    if (item.circuit) {
      item.circuit.forEach((c, k) => {
        if (k > 0) out.push({ ...base(c), set: s, phase: 'switch', label: `Дальше: ${EXERCISES[c].title}`, hint: EXERCISES[c].how, duration: SWITCH, amount: 0, ease: 1, cue: 'switch', speak: EXERCISES[c].title.replace(/ лёжа на животе/, '') });
        out.push(...repSteps(item, c, stage, { ...base(c), set: s }, reps, () => undefined));
      });
    } else {
      const sides: (Side | undefined)[] = e.sided && !item.alternate ? ['l', 'r'] : [undefined];
      sides.forEach((side, k) => {
        if (k > 0) out.push({ ...base(item.ex), set: s, side, phase: 'switch', label: 'Другая сторона', hint: e.pose === 'side' ? 'Повернитесь на другой бок' : 'Смените сторону', duration: e.pose === 'side' ? SWITCH + 2 : SWITCH, amount: 0, ease: 1, cue: 'switch', speak: 'Другая сторона' });
        const b = { ...base(item.ex), set: s };
        if (timed) out.push(...timedSteps(item, item.ex, stage, b, side));
        else out.push(...repSteps(item, item.ex, stage, b, reps, r => (item.alternate ? (r % 2 ? 'r' : 'l') : side)));
      });
    }
    if (s < sets) out.push({
      ...base(item.circuit?.[0] ?? item.ex), set: s, phase: 'rest', label: 'Отдых', hint: `Дальше подход ${s + 1} из ${sets}`,
      duration: item.setRest ?? SET_REST, amount: 0, ease: 1.2, cue: 'release', speak: 'Отдых', tick: true,
    });
  }
  // у последнего шага удержания отдых не нужен — дальше подготовка следующего упражнения
  const last = out[out.length - 1];
  if (!blocksOnly && last?.phase === 'rest' && last.rep === last.reps && last.duration > 3 && last.set === sets) last.duration = 3;
  return out;
}

export interface BuildOptions {
  /** ступени роста внутри уровня (занятий «с запасом» на уровне) */
  stage?: number;
  /** без шагов подготовки — для демонстрации упражнения по кругу */
  blocksOnly?: boolean;
}

export function buildTimeline(items: Item[], { stage = 0, blocksOnly = false }: BuildOptions = {}): Timeline {
  const steps: Step[] = [];
  items.forEach((item, i) => {
    const pose = EXERCISES[item.ex].pose;
    const prev = i > 0 ? EXERCISES[items[i - 1].ex].pose : pose;
    steps.push(...itemSteps(item, i, stage, i === 0, pose !== prev, blocksOnly));
  });
  const starts: number[] = [];
  let t = 0;
  for (const s of steps) { starts.push(t); t += s.duration; }
  const ranges = items.map((it, i) => {
    const first = steps.findIndex(s => s.item === i);
    let last = first;
    for (let k = first; k < steps.length && steps[k].item === i; k++) last = k;
    return { ex: it.ex, start: starts[first], end: starts[last] + steps[last].duration };
  });
  return {
    steps, starts, total: t, items: ranges,
    reps: steps.filter(s => s.counted).length,
    work: steps.filter(s => s.amount > 0 && s.phase !== 'prep').reduce((a, s) => a + s.duration, 0),
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

/** Положение фигуры: плавный переход от цели предыдущего шага к цели текущего */
export function amountAt(tl: Timeline, index: number, offset: number): number {
  const step = tl.steps[index];
  const from = index > 0 ? tl.steps[index - 1].amount : 0;
  const p = Math.min(1, Math.max(0, offset / Math.max(0.01, step.ease)));
  return from + (step.amount - from) * smooth(p);
}

/** Начало следующего упражнения — для кнопки «пропустить» */
export function nextItemStart(tl: Timeline, t: number): number {
  const r = tl.items.find(b => b.start > t + 0.001);
  return r ? r.start : tl.total;
}

/** Конец текущего шага — для кнопки «Не могу держать» в удержании до отказа */
export function stepEnd(tl: Timeline, t: number): number {
  const { index } = locate(tl, t);
  return tl.starts[index] + tl.steps[index].duration;
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? (r ? `${m} мин ${r} с` : `${m} мин`) : `${r} с`;
}

export const minutes = (sec: number) => `${Math.max(1, Math.round(sec / 60))} мин`;

/** Короткая демонстрация упражнения: два повтора по кругу */
export function demoItem(ex: ExerciseId): Item {
  const e = EXERCISES[ex];
  if (ex === 'chew') return { ex, time: 8, switchEvery: 4 };
  if (ex === 'walk_cue' || ex === 'screen_cue') return { ex, time: 8 };
  if (['doorway', 'trap_stretch', 'scm_stretch'].includes(ex)) return { ex, time: 6 };
  if (ex === 'towel_breath') return { ex, breaths: 2 };
  if (ex === 'tongue_quick') return { ex, reps: 4, quick: true };
  if (e.words?.hold || ['nod_supine', 'nod_seated', 'nod_resisted', 'ctar_hold', 'tongue_tip', 'tongue_back', 'jaw_open', 'clench', 'smile_resist', 'head_lift'].includes(ex))
    return ex.startsWith('prone') || ex === 'chair_ext' ? { ex, reps: 2, tempo: [1.5, 2, 1.5] } : { ex, reps: 2, hold: 3, rest: 2, alternate: ex === 'nod_resisted' };
  return { ex, reps: 2, tempo: [1.5, 0.8, 1.5] };
}

export const demoTimeline = (ex: ExerciseId) => buildTimeline([demoItem(ex)], { blocksOnly: true });

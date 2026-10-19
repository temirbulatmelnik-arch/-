// Программа тренировок. Основа — памятки NHS и протоколы РКИ (Бё, Milios, Dorey), настройки — по отчёту
// tonus/reports/«Эффективность тренировки тазового дна у мужчин»:
// - одна основная тренировка в день (30–44 сокращения, выше порога ~24 в сутки) и 1–2 лёгкие по желанию;
// - нагрузку задаёт сила сжатия: удержания на максимум до 10 с, отдых не короче удержания, после 10 с — 12 с;
// - быстрые сокращения подходами по 10 (дольше сфинктер утомляется), второй подход — с передней подсказкой;
// - «Knack» — сжатие перед кашлем, приседом, подъёмом — отдельным упражнением с 5-го уровня;
// - «лифт» — только в лёгких тренировках: данных о его пользе нет;
// - переход на уровень не раньше 2 недель (эффекты в РКИ формируются за 3–6 месяцев), затем поддержка 2–3 раза в неделю.
// Положения только сидя и стоя. Вместо «лёжа» — твёрдый стул: сиденье даёт обратную связь,
// при правильном сжатии промежность отрывается от него вверх.

export type Position = 'sitting' | 'standing';
/** Подсказка для быстрых сокращений: «сзади» — сфинктер, «спереди» — пенис и яички */
export type QuickCue = 'back' | 'front';
export type KnackTask = 'cough' | 'squat' | 'load';

type BlockBody =
  | { type: 'breath'; cycles: number; inhale: number; exhale: number }
  | { type: 'slow'; reps: number; hold: number; rest: number }
  | { type: 'quick'; reps: number; on: number; off: number; cue: QuickCue }
  | { type: 'lift'; reps: number; floor: number; rest: number }
  | { type: 'endurance'; reps: number; hold: number; rest: number; intensity: number }
  | { type: 'knack'; tasks: KnackTask[]; reps: number; rest: number }
  | { type: 'release'; cycles: number; inhale: number; exhale: number };

/** pause — отдых перед упражнением, с: мышца полностью восстанавливается между подходами */
export type Block = BlockBody & { pause?: number };

export type BlockType = Block['type'];

export type SessionKind = 'main' | 'light' | 'relax';

export interface Level {
  id: number;
  name: string;
  subtitle: string;
  position: Position;
  /** Сколько основных тренировок на уровне, прежде чем предложить следующий */
  minSessions: number;
  /** И сколько дней не меньше: нервная адаптация занимает ~4 недели, рост мышцы — месяцы */
  minDays: number;
  /** Основная тренировка */
  blocks: Block[];
  /** Лёгкая тренировка на 2–4 минуты: быстрые, «лифт», «Knack» */
  light: Block[];
  /** Режим поддержки: 2–3 основные тренировки в неделю и ежедневный «Knack» */
  maintenance?: boolean;
}

export const POSITION_LABEL: Record<Position, string> = {
  sitting: 'Сидя на твёрдом стуле, стопы на полу',
  standing: 'Стоя, ноги на ширине плеч',
};

export const POSITION_SHORT: Record<Position, string> = {
  sitting: 'сидя',
  standing: 'стоя',
};

interface BlockInfo {
  title: string;
  short: string;
  how: string;
  color: 'calm' | 'squeeze' | 'breath';
}

export const BLOCK_INFO: Record<BlockType, BlockInfo> = {
  breath: {
    title: 'Дыхание',
    short: 'Настройка и расслабление',
    how: 'Вдох животом — тазовое дно мягко опускается. Выдох — живот и промежность отпускаются.',
    color: 'breath',
  },
  slow: {
    title: 'Медленные удержания',
    short: 'Максимальная сила',
    how: 'Сожмите на максимум кольцо вокруг заднего прохода, как будто сдерживаете газы, и подтяните его вверх и внутрь. Держите в полную силу, не ослабляя, и дышите. Потом отпустите полностью.',
    color: 'squeeze',
  },
  quick: {
    title: 'Быстрые сокращения',
    short: 'Скорость реакции',
    how: 'Максимально быстро и сильно сожмите на секунду — и сразу полностью отпустите. Каждое сжатие отдельное.',
    color: 'squeeze',
  },
  lift: {
    title: 'Лифт',
    short: 'Точный контроль силы',
    how: 'Поднимайте «лифт» по этажам: треть силы, две трети, максимум. Затем так же плавно спускайтесь до полного расслабления.',
    color: 'squeeze',
  },
  endurance: {
    title: 'Долгое удержание',
    short: 'Выносливость вполсилы',
    how: 'Сожмите вполсилы и держите долго, не задерживая дыхание. Если мышца «уплывает» — расслабьтесь раньше, это нормально.',
    color: 'squeeze',
  },
  knack: {
    title: 'Сжатие перед нагрузкой',
    short: 'Навык «Knack»',
    how: 'Сожмите сфинктер за секунду до кашля, приседа или подъёма груза и держите, пока длится усилие. Потом отпустите полностью.',
    color: 'squeeze',
  },
  release: {
    title: 'Расслабление',
    short: 'Обратный Кегель',
    how: 'На вдохе позвольте промежности мягко опуститься и раскрыться, на выдохе — просто отпускайте. Никакого натуживания.',
    color: 'calm',
  },
};

export const KNACK_TASKS: Record<KnackTask, { title: string; action: string; hint: string; speak: string; duration: number }> = {
  cough: { title: 'кашель', action: 'Кашляните', hint: 'Держите сжатие, пока кашляете', speak: 'Кашель', duration: 2 },
  squat: { title: 'присед', action: 'Присядьте и встаньте', hint: 'Сжатие держится весь присед', speak: 'Присед', duration: 4 },
  load: { title: 'подъём или прыжок', action: 'Поднимите груз или подпрыгните', hint: 'Сумка, гантель или прыжок на месте — держите до конца', speak: 'Поднимите', duration: 3 },
};

/** Название блока с учётом подсказки: два подхода быстрых сокращений различаются */
export const blockTitle = (b: Block) => (b.type === 'quick' && b.cue === 'front' ? 'Быстрые: передняя подсказка' : BLOCK_INFO[b.type].title);

const BREATH: Block = { type: 'breath', cycles: 3, inhale: 4, exhale: 6 };
const RELEASE: Block = { type: 'release', cycles: 3, inhale: 4, exhale: 6 };

/** Отдых между максимальными удержаниями и быстрыми, между подходами и перед следующим упражнением */
const PAUSE_AFTER_SLOW = 35;
const PAUSE = 30;

const slow = (reps: number, hold: number, rest: number): Block => ({ type: 'slow', reps, hold, rest });
/** Два подхода быстрых: со «задней» и с «передней» подсказкой */
const quick = (reps: number, off = 2): Block[] => [
  { type: 'quick', reps, on: 1, off, cue: 'back', pause: PAUSE_AFTER_SLOW },
  { type: 'quick', reps, on: 1, off, cue: 'front', pause: PAUSE },
];
const endurance = (reps: number, hold: number): Block => ({ type: 'endurance', reps, hold, rest: hold, intensity: 0.5, pause: PAUSE });
const knack = (tasks: KnackTask[], reps = 5, pause = 0): Block => ({ type: 'knack', tasks, reps, rest: 5, pause });
const LIFT: Block = { type: 'lift', reps: 2, floor: 3, rest: 8 };
const lightQuick = (reps: number, off = 2, cue: QuickCue = 'back', pause?: number): Block => ({ type: 'quick', reps, on: 1, off, cue, pause });

export const LEVELS: Level[] = [
  {
    id: 1, name: 'Знакомство', subtitle: 'Находим нужные мышцы', position: 'sitting', minSessions: 6, minDays: 7,
    blocks: [BREATH, slow(8, 3, 6), ...quick(5), RELEASE],
    light: [lightQuick(5), lightQuick(5, 2, 'front', 20), RELEASE],
  },
  {
    id: 2, name: 'Основа', subtitle: 'Удержания по 5 секунд', position: 'sitting', minSessions: 6, minDays: 7,
    blocks: [BREATH, slow(10, 5, 8), ...quick(6), RELEASE],
    light: [lightQuick(6), lightQuick(6, 2, 'front', 20), RELEASE],
  },
  {
    id: 3, name: 'Контроль', subtitle: 'Удержания по 6 секунд', position: 'sitting', minSessions: 10, minDays: 14,
    blocks: [BREATH, slow(10, 6, 10), ...quick(10), RELEASE],
    light: [lightQuick(10), LIFT, RELEASE],
  },
  {
    id: 4, name: 'Сила', subtitle: 'Удержания по 8 секунд', position: 'sitting', minSessions: 10, minDays: 14,
    blocks: [BREATH, slow(10, 8, 10), ...quick(10), RELEASE],
    light: [lightQuick(10), LIFT, RELEASE],
  },
  {
    id: 5, name: 'Стоя', subtitle: 'Удержания по 10 с и «Knack»', position: 'standing', minSessions: 10, minDays: 14,
    blocks: [BREATH, slow(10, 10, 12), ...quick(10), knack(['cough', 'squat'], 5, PAUSE), RELEASE],
    light: [lightQuick(10), LIFT, knack(['squat']), RELEASE],
  },
  {
    id: 6, name: 'Выносливость', subtitle: 'Долгое удержание вполсилы', position: 'standing', minSessions: 10, minDays: 14,
    blocks: [BREATH, slow(10, 10, 12), ...quick(10), endurance(1, 20), knack(['cough', 'squat']), RELEASE],
    light: [lightQuick(10), LIFT, knack(['squat']), RELEASE],
  },
  {
    id: 7, name: 'Мастер', subtitle: 'Подъём груза и прыжки', position: 'standing', minSessions: 10, minDays: 14,
    blocks: [BREATH, slow(12, 10, 12), ...quick(10, 1.5), endurance(1, 30), knack(['cough', 'load']), RELEASE],
    light: [lightQuick(10, 1.5), LIFT, knack(['load']), RELEASE],
  },
  {
    id: 8, name: 'Пик', subtitle: 'Полная нагрузка 8 недель', position: 'standing', minSessions: 40, minDays: 56,
    blocks: [BREATH, slow(12, 10, 12), ...quick(10, 1.5), endurance(2, 30), knack(['cough', 'load']), RELEASE],
    light: [lightQuick(10, 1.5), LIFT, knack(['load']), RELEASE],
  },
  {
    id: 9, name: 'Поддержка', subtitle: '2–3 тренировки в неделю', position: 'standing', minSessions: Infinity, minDays: Infinity, maintenance: true,
    blocks: [BREATH, slow(12, 10, 12), ...quick(10, 1.5), endurance(1, 30), knack(['cough', 'load']), RELEASE],
    light: [knack(['cough', 'squat', 'load'], 3), RELEASE],
  },
];

/** Короткая тренировка только на расслабление: после дискомфорта или если мышца «не отпускается» */
export const RELAX_BLOCKS: Block[] = [BREATH, { type: 'release', cycles: 8, inhale: 4, exhale: 6 }];

export const SESSION_TITLE: Record<SessionKind, string> = {
  main: 'Основная тренировка',
  light: 'Лёгкая тренировка',
  relax: 'Только расслабление',
};

const sessions = new WeakMap<Level, Partial<Record<SessionKind, Level>>>();

/** Уровень с блоками нужной тренировки: плеер и лента шагов работают с ним как с обычным уровнем.
 *  Один и тот же объект на каждый вызов: плеер перезапускает тренировку, если уровень сменился */
export function sessionLevel(level: Level, kind: SessionKind): Level {
  if (kind === 'main') return level;
  const byKind = sessions.get(level) ?? {};
  sessions.set(level, byKind);
  return (byKind[kind] ??= { ...level, blocks: kind === 'light' ? level.light : RELAX_BLOCKS });
}

/** С какого уровня начать. Спортивным людям вводные уровни обычно слишком лёгкие */
export const STARTS: { levelId: number; title: string; text: string }[] = [
  { levelId: 1, title: 'С нуля', text: 'Мало двигаюсь или впервые ищу эти мышцы. Начнём с коротких удержаний по 3 секунды.' },
  { levelId: 3, title: 'Спортивный', text: 'Регулярно тренируюсь, хорошо чувствую тело. Сразу удержания на максимум по 6 секунд.' },
  { levelId: 5, title: 'Уже тренировал', text: 'Делал упражнения Кегеля и умею сжимать сфинктер без ягодиц. Сразу стоя, по 10 секунд и сжатие перед нагрузкой.' },
];
export const DEFAULT_START = 3;
export const MAINTENANCE_ID = LEVELS[LEVELS.length - 1].id;

export const levelById = (id: number): Level => LEVELS.find(l => l.id === id) ?? LEVELS[0];

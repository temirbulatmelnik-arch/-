// Программа тренировок. Числа взяты из памяток NHS по упражнениям для анального сфинктера
// и тазового дна: медленные удержания до 10 с с отдыхом не короче удержания, до 10–12 повторов;
// быстрые сокращения по 1 с, 10–20 повторов; 3 подхода в день.
// Положения только сидя и стоя. Вместо «лёжа» — твёрдый стул: сиденье даёт обратную связь,
// при правильном сжатии задний проход отрывается от него вверх. Подробности и источники — в README.

export type Position = 'sitting' | 'standing' | 'any';

export type Block =
  | { type: 'breath'; cycles: number; inhale: number; exhale: number }
  | { type: 'slow'; reps: number; hold: number; rest: number }
  | { type: 'quick'; reps: number; on: number; off: number }
  | { type: 'lift'; reps: number; floor: number; rest: number }
  | { type: 'endurance'; reps: number; hold: number; rest: number; intensity: number }
  | { type: 'release'; cycles: number; inhale: number; exhale: number };

export type BlockType = Block['type'];

export interface Level {
  id: number;
  name: string;
  subtitle: string;
  position: Position;
  /** Сколько завершённых тренировок на уровне, прежде чем предложить следующий */
  minSessions: number;
  blocks: Block[];
}

export const POSITION_LABEL: Record<Position, string> = {
  sitting: 'Сидя на твёрдом стуле, стопы на полу',
  standing: 'Стоя, ноги на ширине плеч',
  any: 'Сидя или стоя',
};

export const POSITION_SHORT: Record<Position, string> = {
  sitting: 'сидя',
  standing: 'стоя',
  any: 'сидя или стоя',
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
    short: 'Сила и выносливость',
    how: 'Сожмите кольцо вокруг заднего прохода, как будто сдерживаете газы, и подтяните его вверх и внутрь. Держите, дышите спокойно. Потом полностью отпустите.',
    color: 'squeeze',
  },
  quick: {
    title: 'Быстрые сокращения',
    short: 'Скорость реакции',
    how: 'Быстро и сильно сожмите на секунду — и сразу полностью отпустите. Каждое сжатие отдельное.',
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
  release: {
    title: 'Расслабление',
    short: 'Обратный Кегель',
    how: 'На вдохе позвольте промежности мягко опуститься и раскрыться, на выдохе — просто отпускайте. Никакого натуживания.',
    color: 'calm',
  },
};

const BREATH: Block = { type: 'breath', cycles: 3, inhale: 4, exhale: 6 };
const RELEASE: Block = { type: 'release', cycles: 3, inhale: 4, exhale: 6 };

export const LEVELS: Level[] = [
  {
    id: 1, name: 'Знакомство', subtitle: 'Находим нужные мышцы', position: 'sitting', minSessions: 9,
    blocks: [BREATH, { type: 'slow', reps: 8, hold: 3, rest: 6 }, { type: 'quick', reps: 8, on: 1, off: 2 }, RELEASE],
  },
  {
    id: 2, name: 'Основа', subtitle: 'Удержание 5 секунд', position: 'sitting', minSessions: 12,
    blocks: [BREATH, { type: 'slow', reps: 8, hold: 5, rest: 8 }, { type: 'quick', reps: 10, on: 1, off: 2 }, RELEASE],
  },
  {
    id: 3, name: 'Контроль', subtitle: 'Первый «лифт»', position: 'sitting', minSessions: 15,
    blocks: [BREATH, { type: 'slow', reps: 10, hold: 6, rest: 8 }, { type: 'quick', reps: 10, on: 1, off: 2 }, { type: 'lift', reps: 2, floor: 3, rest: 8 }, RELEASE],
  },
  {
    id: 4, name: 'Сила', subtitle: 'Удержание 8 секунд', position: 'sitting', minSessions: 15,
    blocks: [BREATH, { type: 'slow', reps: 10, hold: 8, rest: 8 }, { type: 'quick', reps: 12, on: 1, off: 2 }, { type: 'lift', reps: 2, floor: 3, rest: 8 }, RELEASE],
  },
  {
    id: 5, name: 'Выносливость', subtitle: '10 × 10 секунд', position: 'standing', minSessions: 15,
    blocks: [BREATH, { type: 'slow', reps: 10, hold: 10, rest: 10 }, { type: 'quick', reps: 15, on: 1, off: 2 }, { type: 'lift', reps: 3, floor: 3, rest: 8 }, RELEASE],
  },
  {
    id: 6, name: 'Нагрузка', subtitle: 'Долгое удержание вполсилы', position: 'standing', minSessions: 18,
    blocks: [BREATH, { type: 'slow', reps: 10, hold: 10, rest: 10 }, { type: 'quick', reps: 20, on: 1, off: 2 }, { type: 'lift', reps: 3, floor: 3, rest: 8 }, { type: 'endurance', reps: 1, hold: 20, rest: 20, intensity: 0.5 }, RELEASE],
  },
  {
    id: 7, name: 'Мастер', subtitle: 'Полная программа', position: 'standing', minSessions: 21,
    blocks: [BREATH, { type: 'slow', reps: 12, hold: 10, rest: 10 }, { type: 'quick', reps: 20, on: 1, off: 2 }, { type: 'lift', reps: 4, floor: 3, rest: 8 }, { type: 'endurance', reps: 2, hold: 30, rest: 30, intensity: 0.5 }, RELEASE],
  },
  {
    id: 8, name: 'Поддержка', subtitle: 'Сохраняем результат', position: 'any', minSessions: Infinity,
    blocks: [BREATH, { type: 'slow', reps: 10, hold: 10, rest: 10 }, { type: 'quick', reps: 20, on: 1, off: 2 }, { type: 'lift', reps: 2, floor: 3, rest: 8 }, { type: 'endurance', reps: 1, hold: 30, rest: 30, intensity: 0.5 }, RELEASE],
  },
];

/** С какого уровня начать. Спортивным людям вводные уровни обычно слишком лёгкие */
export const STARTS: { levelId: number; title: string; text: string }[] = [
  { levelId: 1, title: 'С нуля', text: 'Мало двигаюсь или впервые ищу эти мышцы. Начнём с коротких удержаний по 3 секунды.' },
  { levelId: 3, title: 'Спортивный', text: 'Регулярно тренируюсь, хорошо чувствую тело. Сразу удержания по 6 секунд и «лифт».' },
  { levelId: 5, title: 'Уже тренировал', text: 'Делал упражнения Кегеля и умею сжимать сфинктер без ягодиц. Сразу стоя, удержания по 10 секунд.' },
];
export const DEFAULT_START = 3;

export const levelById = (id: number): Level => LEVELS.find(l => l.id === id) ?? LEVELS[0];

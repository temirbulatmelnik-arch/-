// Программа: шесть уровней блока «Осанка» и четыре уровня блока «Фейс-лифтинг» (отчёт «Осанка шеи и упражнения для лица»).
// Нагрузка растёт удержаниями, темпом и длиной рычага, а не сокращением сроков. Внутри уровня
// дозы с несколькими значениями растут ступенями: каждое занятие «с запасом» открывает следующую.
import { EXERCISES, type BlockId, type ExerciseId } from './exercises';

export interface Item {
  ex: ExerciseId;
  /** подходов (по умолчанию 1) */
  sets?: number;
  /** повторов в подходе — на каждую сторону; массив — ступени внутри уровня */
  reps?: number | number[];
  /** удержание, с; массив — ступени */
  hold?: number | number[];
  /** отдых после каждого удержания, с */
  rest?: number;
  /** отдых между подходами, с */
  setRest?: number;
  /** темп повтора: вверх, пауза, вниз (с) */
  tempo?: [number, number, number];
  /** медленных вдохов */
  breaths?: number;
  /** секунд на сторону: растяжка, жевание, прогулка; массив — ступени */
  time?: number | number[];
  /** смена стороны в жевании, с */
  switchEvery?: number;
  /** быстрые нажатия 1 с / 1 с */
  quick?: boolean;
  /** удержание до потери техники, hold — потолок */
  failure?: boolean;
  /** сторона меняется на каждом повторе */
  alternate?: boolean;
  /** круг из нескольких упражнений (Y–T–W): sets — круги, reps — повторов каждого */
  circuit?: ExerciseId[];
  /** усилие, которое называет голос и подсказка */
  effort?: string;
  /** только при чистом опроснике ВНЧС / по желанию «полнее щёки» */
  only?: 'jaw' | 'cheeks';
}

/** Виды занятий: основное, минутная пауза, растяжка в день отдыха, прогулка, шея у экрана, челюсть */
export type SessionKind = 'core' | 'break' | 'stretch' | 'walk' | 'screen' | 'jaw';

export interface Level {
  id: number;
  block: BlockId;
  name: string;
  subtitle: string;
  /** недели программы */
  weeks: string;
  minDays: number;
  /** основных занятий в неделю */
  perWeek: number;
  /** что нужно для перехода дальше */
  criteria: string;
  items: Item[];
  /** дополнительные занятия, открытые на уровне */
  extras: SessionKind[];
  maintenance?: boolean;
}

export const POSTURE: Level[] = [
  {
    id: 1, block: 'posture', name: 'Знакомство', subtitle: 'Найти глубокие мышцы шеи и лопаток', weeks: 'неделя 1', minDays: 7, perWeek: 3,
    criteria: 'Кивок без напряжения ГКС под пальцами, без подъёма головы и сжатия зубов; 3 занятия «с запасом».',
    items: [
      { ex: 'nod_supine', reps: 8, hold: 5, rest: 5, effort: '10–20 %' },
      { ex: 'er_side', sets: 2, reps: 10, tempo: [1.5, 1, 1.5] },
      { ex: 'scap_set', sets: 2, reps: 10, tempo: [1, 3, 1] },
      { ex: 'pushup_wall', sets: 2, reps: 10, tempo: [1.5, 1, 1.5] },
      { ex: 'doorway', sets: 2, time: 30 },
      { ex: 'towel_breath', breaths: 8 },
    ],
    extras: ['break', 'stretch'],
  },
  {
    id: 2, block: 'posture', name: 'Основа', subtitle: 'Удержания по 10 секунд и вся лопатка', weeks: 'недели 2–3', minDays: 14, perWeek: 3,
    criteria: '10 × 10 с кивков чисто; все упражнения для лопаток 3 × 10 легко.',
    items: [
      { ex: 'nod_supine', reps: 10, hold: 10, rest: 10, effort: '10–20 %' },
      { ex: 'prone_t', sets: 3, reps: 10, tempo: [1, 3, 1], setRest: 25 },
      { ex: 'prone_y', sets: 3, reps: 8, tempo: [1, 3, 1], setRest: 25 },
      { ex: 'flex_side', sets: 2, reps: 10, tempo: [1.5, 0.5, 1.5] },
      { ex: 'pushup_table', sets: 3, reps: 10, tempo: [1.5, 1, 1.5], setRest: 25 },
      { ex: 'doorway', sets: 2, time: 30, setRest: 10 },
    ],
    extras: ['break', 'stretch'],
  },
  {
    id: 3, block: 'posture', name: 'Сидя и стоя', subtitle: 'Кивок вертикально, круг Y–T–W, «ангел»', weeks: 'недели 4–5', minDays: 14, perWeek: 3,
    criteria: '10 × 10 с кивков сидя чисто; контроль 4-й недели: 3 фото угла шеи и тест выносливости.',
    items: [
      { ex: 'nod_seated', reps: 10, hold: 10, rest: 10, effort: '10–20 %' },
      { ex: 'nod_resisted', reps: 6, hold: 10, rest: 10, alternate: true, effort: 'мягкое' },
      { ex: 'prone_y', circuit: ['prone_y', 'prone_t', 'prone_w'], sets: 2, reps: 3, hold: [5, 7, 10], tempo: [3, 0, 3], setRest: 40 },
      { ex: 'er_side', sets: 2, reps: [12, 15], tempo: [1, 0.5, 1.5], setRest: 20 },
      { ex: 'pushup_knee', sets: 3, reps: 10, tempo: [1.5, 1, 1.5], setRest: 25 },
      { ex: 'wall_angel', sets: 2, reps: 10, tempo: [3, 0, 3] },
      { ex: 'prone_ext', sets: 2, reps: 8, tempo: [1.5, 2, 1.5], setRest: 20 },
    ],
    extras: ['break', 'stretch'],
  },
  {
    id: 4, block: 'posture', name: 'Выносливость', subtitle: 'Голова над полом, длинные удержания', weeks: 'недели 6–7', minDays: 14, perWeek: 3,
    criteria: 'Подъём головы ≥ 30 с без потери прижатого подбородка; отжимание «плюс» 3 × 10 чисто.',
    items: [
      { ex: 'head_lift', reps: 5, hold: [5, 10, 20, 30], rest: 30 },
      { ex: 'prone_y', circuit: ['prone_y', 'prone_t', 'prone_w'], sets: 2, reps: 1, hold: [20, 25, 30], tempo: [2, 0, 2], setRest: 30 },
      { ex: 'pushup_full', sets: 3, reps: [8, 10, 12], tempo: [2, 1, 1.5], setRest: 45 },
      { ex: 'wall_angel', sets: 3, reps: 10, tempo: [3, 0, 3] },
      { ex: 'prone_ext', sets: 2, reps: 8, tempo: [1.5, 2, 1.5], setRest: 20 },
      { ex: 'doorway', sets: 2, time: 30, setRest: 10 },
    ],
    extras: ['break', 'stretch', 'walk', 'screen'],
  },
  {
    id: 5, block: 'posture', name: 'Пик', subtitle: 'Максимум выносливости шеи и лопаток', weeks: 'недели 8–12', minDays: 28, perWeek: 3,
    criteria: 'Контроли на 8-й и 12-й неделе, затем поддержка.',
    items: [
      { ex: 'head_lift', sets: 3, reps: 1, hold: 60, rest: 60, failure: true },
      { ex: 'nod_resisted', reps: 10, hold: 10, rest: 10, alternate: true, effort: 'мягкое' },
      { ex: 'prone_y', circuit: ['prone_y', 'prone_t', 'prone_w'], sets: 2, reps: 1, hold: [30, 35, 40, 45], tempo: [2, 0, 2], setRest: 40 },
      { ex: 'pushup_full', sets: 3, reps: [12, 13, 15], tempo: [2, 2, 1.5], setRest: 45 },
      { ex: 'wall_angel', sets: 2, reps: 10, tempo: [3, 0, 3] },
      { ex: 'prone_ext', sets: 2, reps: 8, tempo: [1.5, 2, 1.5], setRest: 20 },
      { ex: 'doorway', sets: 2, time: 30, setRest: 10 },
    ],
    extras: ['break', 'stretch', 'walk', 'screen'],
  },
  {
    id: 6, block: 'posture', name: 'Поддержка', subtitle: '1–2 занятия в неделю и ежедневные паузы', weeks: 'после 12-й недели', minDays: 0, perWeek: 2, maintenance: true,
    criteria: 'Раз в месяц фото и тест. Если угол шеи падает три замера подряд или тест выносливости хуже на 10 с — 2 недели уровня «Выносливость».',
    items: [],
    extras: ['break', 'stretch', 'walk', 'screen'],
  },
];
// поддержка повторяет занятие «Пика»
POSTURE[5].items = POSTURE[4].items;

export const FACE: Level[] = [
  {
    id: 1, block: 'face', name: 'Знакомство', subtitle: 'Подбородок к кулаку и язык в нёбо', weeks: 'недели 1–2', minDays: 14, perWeek: 5,
    criteria: 'Без боли в челюсти и шее, ГКС не выпирает; 3 занятия «с запасом».',
    items: [
      { ex: 'ctar_hold', reps: 3, hold: 10, rest: 10, effort: '5 из 10' },
      { ex: 'ctar_reps', reps: 10, tempo: [2, 1, 2] },
      { ex: 'tongue_tip', reps: 5, hold: 5, rest: 5, effort: '50–60 %' },
    ],
    extras: [],
  },
  {
    id: 2, block: 'face', name: 'Основа', subtitle: 'Дольше удержания, сильнее язык, жевание', weeks: 'недели 3–4', minDays: 14, perWeek: 5,
    criteria: 'То же, плюс нет щелчков с болью и утренней скованности челюсти.',
    items: [
      { ex: 'ctar_hold', reps: 3, hold: 20, rest: 20, effort: '6 из 10' },
      { ex: 'ctar_reps', reps: [15, 18, 20], tempo: [2, 1, 2] },
      { ex: 'tongue_tip', reps: 10, hold: 5, rest: 5, effort: '60–70 %' },
      { ex: 'smile_resist', reps: 10, hold: 5, rest: 5, only: 'cheeks' },
    ],
    extras: ['jaw'],
  },
  {
    id: 3, block: 'face', name: 'Сила', subtitle: 'Длинные удержания, спинка языка, челюсть', weeks: 'недели 5–8', minDays: 28, perWeek: 5,
    criteria: 'Контроль на 8-й неделе: фото профиля.',
    items: [
      { ex: 'ctar_hold', reps: 3, hold: [30, 35, 40, 45], rest: 30, effort: '7 из 10' },
      { ex: 'ctar_reps', reps: [20, 25, 30], tempo: [2, 1, 2] },
      { ex: 'tongue_tip', reps: 10, hold: 10, rest: 10, effort: '≈ 80 %' },
      { ex: 'tongue_quick', reps: 10, quick: true },
      { ex: 'tongue_back', reps: 5, hold: 5, rest: 5, effort: '≈ 70 %' },
      { ex: 'jaw_open', reps: 5, hold: 10, rest: 10, only: 'jaw' },
      { ex: 'smile_resist', reps: 10, hold: 5, rest: 5, only: 'cheeks' },
    ],
    extras: ['jaw'],
  },
  {
    id: 4, block: 'face', name: 'Поддержка', subtitle: 'Дозы протокола CTAR, 3–4 дня в неделю', weeks: 'с 9-й недели', minDays: 0, perWeek: 3, maintenance: true,
    criteria: 'Фото профиля раз в 2–4 недели.',
    items: [
      { ex: 'ctar_hold', reps: 3, hold: 60, rest: 60, effort: '7 из 10' },
      { ex: 'ctar_reps', reps: 30, tempo: [2, 1, 2] },
      { ex: 'tongue_tip', reps: 10, hold: 10, rest: 10, effort: '≈ 80 %' },
      { ex: 'tongue_back', reps: 5, hold: 5, rest: 5, effort: '≈ 70 %' },
      { ex: 'smile_resist', reps: 10, hold: 5, rest: 5, only: 'cheeks' },
    ],
    extras: ['jaw'],
  },
];

export const LEVELS: Record<BlockId, Level[]> = { posture: POSTURE, face: FACE };
export const levelById = (block: BlockId, id: number) => LEVELS[block].find(l => l.id === id) ?? LEVELS[block][0];
export const maxLevel = (block: BlockId) => LEVELS[block].length;
/** Спортивному человеку можно начать со второго уровня */
export const DEFAULT_START: Record<BlockId, number> = { posture: 2, face: 2 };

export const BLOCKS: Record<BlockId, { title: string; tagline: string; focus: string; short: string }> = {
  posture: { title: 'Осанка', tagline: 'Шея · плечи · спина', focus: 'Ровная шея без дуги вперёд и раскрытые плечи', short: 'осанка' },
  face: { title: 'Фейс-лифтинг', tagline: 'Подбородок · овал · челюсть', focus: 'Плотнее мышцы под подбородком, чётче нижний овал', short: 'лицо' },
};

export const SESSION_TITLE: Record<SessionKind, string> = {
  core: 'Занятие',
  break: 'Минутная пауза',
  stretch: 'Растяжка',
  walk: 'Прогулка с осанкой',
  screen: 'Шея у экрана',
  jaw: 'Челюсть',
};

export const SESSION_HINT: Record<SessionKind, string> = {
  core: '',
  break: 'Каждые 30–60 минут сидения: 5 кивков, 5 сведений лопаток, одно разгибание',
  stretch: 'Грудь, шея и верх спины — в дни между занятиями или сразу после',
  walk: '5 минут ходьбы с голосовыми подсказками',
  screen: '10 минут работы с нейтральной шеей',
  jaw: '',
};

const WALK_CUES = ['Макушка вверх', 'Взгляд на горизонт', 'Рёбра вниз', 'Плечи широко'];

export type JawMode = 'chew' | 'clench' | 'off';

export interface SessionOptions {
  /** опросник ВНЧС чистый — можно нагружать челюсть */
  jaw: boolean;
  jawMode: JawMode;
  cheeks: boolean;
}

/** Упражнения занятия; jaw/cheeks отсекают модули по опроснику и настройкам */
export function sessionItems(level: Level, kind: SessionKind, o: SessionOptions): Item[] {
  switch (kind) {
    case 'core':
      return level.items.filter(i => (i.only === 'jaw' ? o.jaw : i.only === 'cheeks' ? o.cheeks : true) && !(EXERCISES[i.ex].jaw && !o.jaw));
    case 'break':
      return [
        { ex: 'nod_seated', reps: 5, hold: 3, rest: 2, effort: '10–20 %' },
        { ex: 'scap_sit', reps: 5, tempo: [1, 3, 1] },
        { ex: 'chair_ext', reps: 1, tempo: [2, 3, 2] },
      ];
    case 'stretch':
      // столбец «Растяжка и грудной отдел» таблицы уровней; с «Выносливости» — одна длинная растяжка проёма
      if (level.id <= 1) return [{ ex: 'doorway', sets: 2, time: 30, setRest: 10 }, { ex: 'towel_breath', breaths: 8 }];
      return [
        level.id >= 4 ? { ex: 'doorway', time: 90 } : { ex: 'doorway', sets: 3, time: 30, setRest: 10 },
        { ex: 'trap_stretch', sets: 2, time: 30, setRest: 10 },
        ...(level.id >= 3 ? [{ ex: 'scm_stretch', time: 20 } as Item] : []),
        { ex: 'chair_ext', sets: 2, reps: 8, tempo: [1.5, 2.5, 1.5], setRest: 15 },
        { ex: 'thread_needle', reps: 8, tempo: [2, 1, 2] },
        { ex: 'towel_breath', breaths: 8 },
      ];
    case 'walk':
      return [{ ex: 'walk_cue', time: 300 }];
    case 'screen':
      return [{ ex: 'screen_cue', time: 600 }];
    case 'jaw':
      if (!o.jaw || o.jawMode === 'off') return [];
      if (o.jawMode === 'clench') return [{ ex: 'clench', reps: 2, hold: 10, rest: 20, effort: 'почти в полную силу' }];
      // 2 раза по 5 минут на «Основе», до 15–20 минут в день в 2 приёма дальше
      return [{ ex: 'chew', time: level.id >= 3 ? 480 : 300, switchEvery: 45 }];
  }
}

export const walkCues = WALK_CUES;

/** Сколько раз в день делать дополнительное занятие */
export const EXTRA_PER_DAY: Partial<Record<SessionKind, number>> = { break: 6, jaw: 2 };

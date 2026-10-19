import { describe, expect, it } from 'vitest';
import { INTENSIVE_LEVEL, dayPlan } from './plan';
import { DEFAULT_START, LEVELS, MAINTENANCE_ID, STARTS, levelById, sessionLevel, type Level } from './program';
import { buildTimeline, levelAt, locate, nextBlockStart } from './timeline';
import { bestStreak, checkStatus, levelReadiness, streak, testDrop, todayCount, weekMains, type CheckRecord, type SessionRecord } from './stats';

const rec = (at: string, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id: at, at, levelId: 1, duration: 180, planned: 180, completed: true, contractions: 16, ...extra,
});

describe('программа', () => {
  const all = (l: Level) => [...l.blocks, ...l.light];

  it('отдых не короче удержания в медленных и долгих блоках', () => {
    for (const l of LEVELS) for (const b of all(l)) {
      if (b.type === 'slow' || b.type === 'endurance') expect(b.rest).toBeGreaterThanOrEqual(b.hold);
      if (b.type === 'quick') expect(b.off).toBeGreaterThanOrEqual(b.on);
    }
  });

  it('максимальные удержания не длиннее 10 с, после 10 с отдых длиннее, долгие — только вполсилы', () => {
    for (const l of LEVELS) for (const b of all(l)) {
      if (b.type === 'slow') expect(b.hold).toBeLessThanOrEqual(10);
      if (b.type === 'slow' && b.hold === 10) expect(b.rest).toBeGreaterThan(10);
      if (b.type === 'endurance') expect(b.intensity).toBeLessThanOrEqual(0.5);
    }
  });

  it('быстрые — подходами не больше 10, в основной два подхода: сзади и спереди', () => {
    for (const l of LEVELS) {
      for (const b of all(l)) if (b.type === 'quick') expect(b.reps).toBeLessThanOrEqual(10);
      const cues = l.blocks.flatMap(b => (b.type === 'quick' ? [b.cue] : []));
      expect(cues).toEqual(['back', 'front']);
    }
  });

  it('перед быстрыми после максимальных удержаний — пауза 30–60 с', () => {
    for (const l of LEVELS) {
      const i = l.blocks.findIndex(b => b.type === 'quick');
      expect(l.blocks[i - 1].type).toBe('slow');
      expect(l.blocks[i].pause).toBeGreaterThanOrEqual(30);
      expect(l.blocks[i].pause).toBeLessThanOrEqual(60);
    }
  });

  it('«лифт» только в лёгких тренировках, «Knack» в основной с 5-го уровня', () => {
    for (const l of LEVELS) {
      expect(l.blocks.some(b => b.type === 'lift')).toBe(false);
      expect(l.blocks.some(b => b.type === 'knack')).toBe(l.id >= 5);
    }
  });

  it('с 3-го уровня основная тренировка — не меньше 30 сокращений', () => {
    for (const l of LEVELS.filter(l => l.id >= 3)) expect(buildTimeline(l).contractions).toBeGreaterThanOrEqual(30);
  });

  it('на уровнях 3–7 не меньше 2 недель, на «Пике» — не меньше 8', () => {
    for (const l of LEVELS.filter(l => l.id >= 3 && l.id <= 7)) expect(l.minDays).toBeGreaterThanOrEqual(14);
    expect(levelById(8).minDays).toBeGreaterThanOrEqual(56);
    expect(levelById(MAINTENANCE_ID).maintenance).toBe(true);
  });

  it('стартовые уровни существуют и идут по возрастанию, по умолчанию — «спортивный»', () => {
    const ids = STARTS.map(s => s.levelId);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
    for (const id of ids) expect(levelById(id).id).toBe(id);
    expect(ids).toContain(DEFAULT_START);
  });

  it('основная начинается с дыхания, каждая тренировка заканчивается расслаблением', () => {
    for (const l of LEVELS) {
      expect(l.blocks[0].type).toBe('breath');
      for (const k of ['main', 'light', 'relax'] as const) {
        const bs = sessionLevel(l, k).blocks;
        expect(bs[bs.length - 1].type).toBe('release');
      }
    }
  });

  it('основная укладывается в 2–12 минут, лёгкая — в 1–5', () => {
    for (const l of LEVELS) {
      const { total } = buildTimeline(l);
      expect(total).toBeGreaterThan(120);
      expect(total).toBeLessThan(720);
      const light = buildTimeline(sessionLevel(l, 'light')).total;
      expect(light).toBeGreaterThan(60);
      expect(light).toBeLessThan(300);
    }
  });
});

describe('лента шагов', () => {
  const tl = buildTimeline(levelById(1));

  it('длительность равна сумме шагов', () => {
    expect(tl.total).toBe(tl.steps.reduce((a, s) => a + s.duration, 0));
  });

  it('считает сокращения: 8 медленных + 2 × 5 быстрых', () => {
    expect(tl.contractions).toBe(18);
  });

  it('пауза перед блоком — отдых без сокращений, входит в блок', () => {
    const pause = tl.steps.find(s => s.pause)!;
    expect(pause).toMatchObject({ level: 0, blockType: 'quick', duration: 35 });
    const i = tl.steps.indexOf(pause);
    expect(tl.steps[i + 1].phase).toBe('prep');
    expect(tl.blocks[pause.block].start).toBe(tl.starts[i]);
  });

  it('медленные: сжатие на максимум, голос напоминает дышать, в паузе — «отпустите полностью»', () => {
    const hold = buildTimeline(levelById(3)).steps.filter(s => s.blockType === 'slow' && s.phase === 'hold');
    expect(hold[0].speak).toContain('максимум');
    expect(hold[0].say?.[1]).toContain('не тужьтесь');
    expect(hold.filter(s => s.say).length).toBe(4);
    const rest = buildTimeline(levelById(3)).steps.find(s => s.blockType === 'slow' && s.phase === 'relax')!;
    expect(rest.speak).toBe('Отпустите полностью');
  });

  it('«Knack»: сжатие заранее, действие под сжатием, затем расслабление', () => {
    const k = buildTimeline(levelById(5)).steps.filter(s => s.blockType === 'knack' && s.phase !== 'prep' && !s.pause);
    expect(k.slice(0, 3).map(s => [s.level, s.cue])).toEqual([[1, 'squeeze'], [1, 'action'], [0, 'relax']]);
    expect(k.filter(s => s.contraction)).toHaveLength(10);
  });

  it('передняя подсказка в быстрых сокращениях', () => {
    const front = tl.steps.find(s => s.blockType === 'quick' && s.phase === 'squeeze' && s.block === 3)!;
    expect(front.hint).toContain('пенис');
  });

  it('находит шаг по времени', () => {
    expect(locate(tl, 0)).toEqual({ index: 0, offset: 0, done: false });
    const i = 5;
    expect(locate(tl, tl.starts[i] + 0.5)).toEqual({ index: i, offset: 0.5, done: false });
    expect(locate(tl, tl.total + 1).done).toBe(true);
  });

  it('визуализация плавно идёт от прошлого уровня к целевому', () => {
    const i = tl.steps.findIndex(s => s.blockType === 'slow' && s.phase === 'hold');
    expect(levelAt(tl, i, 0)).toBe(tl.steps[i - 1].level);
    expect(levelAt(tl, i, 10)).toBe(1);
    const mid = levelAt(tl, i, tl.steps[i].ease / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('пропуск ведёт к началу следующего блока, а из паузы — к самому блоку', () => {
    expect(nextBlockStart(tl, 0)).toBe(tl.blocks[1].start);
    expect(nextBlockStart(tl, tl.blocks[tl.blocks.length - 1].start)).toBe(tl.total);
    const i = tl.steps.findIndex(s => s.pause);
    expect(nextBlockStart(tl, tl.starts[i] + 1)).toBe(tl.starts[i + 1]);
  });

  it('в лифте сила растёт по этажам и спускается до нуля', () => {
    const lt = buildTimeline(sessionLevel(levelById(3), 'light'));
    const lift = lt.steps.filter(s => s.blockType === 'lift' && s.rep === 1 && s.phase !== 'prep').map(s => s.level);
    expect(lift).toEqual([0.33, 0.66, 1, 0.66, 0.33, 0, 0]);
  });
});

describe('статистика', () => {
  const now = new Date('2026-10-19T15:00:00');

  it('серия считается с сегодняшнего дня или со вчерашнего, лёгкие тоже идут в серию', () => {
    const h = [rec('2026-10-17T09:00:00'), rec('2026-10-18T09:00:00', { kind: 'light' })];
    expect(streak(h, now)).toBe(2);
    expect(streak([...h, rec('2026-10-19T09:00:00')], now)).toBe(3);
    expect(streak([rec('2026-10-16T09:00:00')], now)).toBe(0);
  });

  it('незавершённые тренировки не идут в зачёт', () => {
    expect(todayCount([rec('2026-10-19T09:00:00', { completed: false })], now)).toBe(0);
  });

  it('лучшая серия', () => {
    const h = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11'].map(d => rec(d + 'T10:00:00'));
    expect(bestStreak(h)).toBe(3);
  });

  it('основные за неделю — с понедельника, лёгкие не считаются', () => {
    const h = [rec('2026-10-18T09:00:00'), rec('2026-10-19T09:00:00'), rec('2026-10-19T12:00:00', { kind: 'light' })];
    expect(weekMains(h, now)).toBe(1);
  });

  describe('следующий уровень', () => {
    const check = (at: string, ok = true): CheckRecord => ({ id: at, at, technique: ok, relaxes: true });
    const sessions = (n: number, extra: Partial<SessionRecord> = {}) =>
      Array.from({ length: n }, (_, i) => rec(`2026-10-${String(i + 1).padStart(2, '0')}T10:00:00`, { levelId: 3, rating: 'easy', ...extra }));
    const opts = { since: '2026-10-01T08:00:00', checks: [check('2026-10-10T10:00:00')], now };

    it('после нужного числа тренировок, дней, трёх «с запасом» и свежей проверки техники', () => {
      expect(levelReadiness(sessions(10), 3, opts).ready).toBe(true);
    });

    it('не раньше 14 дней на уровне', () => {
      expect(levelReadiness(sessions(10), 3, { ...opts, since: '2026-10-10T08:00:00' })).toMatchObject({ ready: false, days: 9 });
    });

    it('нужен запас: «на пределе» — рано', () => {
      const h = sessions(10);
      h[9].rating = 'ok';
      expect(levelReadiness(h, 3, opts)).toMatchObject({ ready: false, reserve: false });
    });

    it('тяжёлые или с дискомфортом — подниматься рано', () => {
      const h = sessions(10);
      h[9].rating = 'hard';
      expect(levelReadiness(h, 3, opts)).toMatchObject({ ready: false, holdBack: true });
    });

    it('без проверки техники или с неудачной — рано', () => {
      expect(levelReadiness(sessions(10), 3, { ...opts, checks: [] }).ready).toBe(false);
      expect(levelReadiness(sessions(10), 3, { ...opts, checks: [check('2026-10-10T10:00:00', false)] }).ready).toBe(false);
      expect(levelReadiness(sessions(10), 3, { ...opts, checks: [check('2026-09-10T10:00:00')] }).checked).toBe(false);
    });

    it('лёгкие тренировки не идут в счёт уровня', () => {
      expect(levelReadiness(sessions(10, { kind: 'light' }), 3, opts).done).toBe(0);
    });
  });

  it('проверка техники: первая, по времени, повтор после неудачной', () => {
    expect(checkStatus([], now).due).toBe('first');
    expect(checkStatus([{ id: '1', at: '2026-10-10T10:00:00', technique: true, relaxes: true }], now).due).toBe(null);
    expect(checkStatus([{ id: '1', at: '2026-09-25T10:00:00', technique: true, relaxes: true }], now).due).toBe('time');
    expect(checkStatus([{ id: '1', at: '2026-10-16T10:00:00', technique: false, relaxes: true }], now).due).toBe('retry');
  });

  it('самотест: спад на 20 % от лучшего прежнего', () => {
    const c = (at: string, hold: number, quick: number): CheckRecord => ({ id: at, at, technique: true, relaxes: true, hold, quick });
    expect(testDrop([c('2026-08-01', 10, 30), c('2026-09-01', 9, 28)])).toBe(false);
    expect(testDrop([c('2026-08-01', 10, 30), c('2026-09-01', 7, 30)])).toBe(true);
    expect(testDrop([c('2026-08-01', 10, 30), c('2026-09-01', 7, 30)], '2026-09-10')).toBe(false);
  });
});

describe('поддержка', () => {
  const base = { levelId: MAINTENANCE_ID, levelSince: '2026-06-01T10:00:00', intensive: null, checks: [] };

  it('до 9-го уровня — обычная программа', () => {
    expect(dayPlan({ ...base, levelId: 5 }, new Date('2026-10-19T10:00:00')).mode).toBe('training');
  });

  it('через 3 месяца предлагает интенсивный блок, во время блока — уровень «Пик»', () => {
    expect(dayPlan(base, new Date('2026-07-01T10:00:00'))).toMatchObject({ mode: 'maintenance', suggest: undefined });
    expect(dayPlan(base, new Date('2026-09-15T10:00:00')).suggest).toBe('time');
    const p = dayPlan({ ...base, intensive: '2026-09-15T10:00:00' }, new Date('2026-09-20T10:00:00'));
    expect(p).toMatchObject({ mode: 'intensive', day: 6 });
    expect(p.level.id).toBe(INTENSIVE_LEVEL);
    expect(dayPlan({ ...base, intensive: '2026-09-15T10:00:00' }, new Date('2026-10-20T10:00:00'))).toMatchObject({ mode: 'maintenance', suggest: undefined });
  });
});

describe('напоминания', () => {
  it('файл календаря: событие на каждое время, ежедневно, с сигналом', async () => {
    const { buildIcs } = await import('./reminders');
    const ics = buildIcs(['08:30', '21:05'], new Date('2026-10-19T10:00:00'));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20261019T083000');
    expect(ics).toContain('DTSTART:20261019T210500');
    expect(ics.match(/RRULE:FREQ=DAILY/g)).toHaveLength(2);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
  });
});

describe('инструкции и демо', () => {
  it('у каждого упражнения есть инструкция и короткий демо-цикл, который заканчивается расслаблением', async () => {
    const { GUIDES, demoTimeline } = await import('./guides');
    const { BLOCK_INFO } = await import('./program');
    for (const type of Object.keys(BLOCK_INFO) as (keyof typeof BLOCK_INFO)[]) {
      const g = GUIDES[type];
      expect(g.steps.length).toBeGreaterThanOrEqual(3);
      expect(g.mistakes.length).toBeGreaterThanOrEqual(2);
      expect(g.breath && g.feel && g.goal && g.voice).toBeTruthy();
      const tl = demoTimeline(type);
      expect(tl.steps.every(s => s.phase !== 'prep')).toBe(true);
      expect(tl.total).toBeGreaterThan(4);
      expect(tl.total).toBeLessThan(15);
      expect(tl.steps[tl.steps.length - 1].level).toBe(0);
    }
  });
});

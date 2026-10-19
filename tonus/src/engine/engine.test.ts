import { describe, expect, it } from 'vitest';
import { LEVELS, levelById } from './program';
import { buildTimeline, levelAt, locate, nextBlockStart } from './timeline';
import { bestStreak, levelReadiness, streak, todayCount, type SessionRecord } from './stats';

const rec = (at: string, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id: at, at, levelId: 1, duration: 180, planned: 180, completed: true, contractions: 16, ...extra,
});

describe('программа', () => {
  it('отдых не короче удержания в медленных и долгих блоках', () => {
    for (const l of LEVELS) for (const b of l.blocks) {
      if (b.type === 'slow' || b.type === 'endurance') expect(b.rest).toBeGreaterThanOrEqual(b.hold);
      if (b.type === 'quick') expect(b.off).toBeGreaterThanOrEqual(b.on);
    }
  });

  it('максимальные удержания не длиннее 10 с, долгие — только вполсилы', () => {
    for (const l of LEVELS) for (const b of l.blocks) {
      if (b.type === 'slow') expect(b.hold).toBeLessThanOrEqual(10);
      if (b.type === 'endurance') expect(b.intensity).toBeLessThanOrEqual(0.5);
    }
  });

  it('каждая тренировка начинается с дыхания и заканчивается расслаблением', () => {
    for (const l of LEVELS) {
      expect(l.blocks[0].type).toBe('breath');
      expect(l.blocks[l.blocks.length - 1].type).toBe('release');
    }
  });

  it('тренировка укладывается в 2–12 минут', () => {
    for (const l of LEVELS) {
      const { total } = buildTimeline(l);
      expect(total).toBeGreaterThan(120);
      expect(total).toBeLessThan(720);
    }
  });
});

describe('лента шагов', () => {
  const tl = buildTimeline(levelById(1));

  it('длительность равна сумме шагов', () => {
    expect(tl.total).toBe(tl.steps.reduce((a, s) => a + s.duration, 0));
  });

  it('считает сокращения: 8 медленных + 8 быстрых', () => {
    expect(tl.contractions).toBe(16);
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

  it('пропуск ведёт к началу следующего блока', () => {
    expect(nextBlockStart(tl, 0)).toBe(tl.blocks[1].start);
    expect(nextBlockStart(tl, tl.blocks[tl.blocks.length - 1].start)).toBe(tl.total);
  });

  it('в лифте сила растёт по этажам и спускается до нуля', () => {
    const lt = buildTimeline(levelById(3));
    const lift = lt.steps.filter(s => s.blockType === 'lift' && s.rep === 1 && s.phase !== 'prep').map(s => s.level);
    expect(lift).toEqual([0.33, 0.66, 1, 0.66, 0.33, 0, 0]);
  });
});

describe('статистика', () => {
  const now = new Date('2026-10-19T15:00:00');

  it('серия считается с сегодняшнего дня или со вчерашнего', () => {
    const h = [rec('2026-10-17T09:00:00'), rec('2026-10-18T09:00:00')];
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

  it('следующий уровень — после нужного числа тренировок и без тяжёлых последних', () => {
    const h = Array.from({ length: 9 }, (_, i) => rec(`2026-10-0${i + 1}T10:00:00`));
    expect(levelReadiness(h, 1).ready).toBe(true);
    h[8].rating = 'hard';
    expect(levelReadiness(h, 1)).toMatchObject({ ready: false, holdBack: true });
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

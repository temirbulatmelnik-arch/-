import { describe, expect, it } from 'vitest';
import { DEFAULT_START } from '../engine/program';
import { migrate } from './store';

describe('миграция сохранённых данных', () => {
  const now = new Date('2026-10-20T10:00:00Z');

  it('с вводных уровней переводит на стартовый, остальное не трогает', () => {
    expect(migrate({ levelId: 1, history: [] }, 1, now)).toMatchObject({ levelId: DEFAULT_START, history: [] });
    expect(migrate({ levelId: 6 }, 1, now)).toMatchObject({ levelId: 6 });
    expect(migrate({ levelId: 1 }, 2, now)).toMatchObject({ levelId: 1 });
  });

  it('версия 3: дни на уровне считаются с обновления, тренировок в день не больше 3', () => {
    expect(migrate({ levelId: 3, settings: { dailyGoal: 5 } }, 2, now)).toEqual({ levelId: 3, levelSince: now.toISOString(), settings: { dailyGoal: 3 } });
    expect(migrate({ levelId: 3, levelSince: '2026-10-01T00:00:00Z' }, 3, now)).toEqual({ levelId: 3, levelSince: '2026-10-01T00:00:00Z' });
  });
});

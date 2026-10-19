import { describe, expect, it } from 'vitest';
import { DEFAULT_START } from '../engine/program';
import { migrate } from './store';

describe('миграция сохранённых данных', () => {
  it('с вводных уровней переводит на стартовый, остальное не трогает', () => {
    expect(migrate({ levelId: 1, history: [] }, 1)).toEqual({ levelId: DEFAULT_START, history: [] });
    expect(migrate({ levelId: 6 }, 1)).toEqual({ levelId: 6 });
    expect(migrate({ levelId: 1 }, 2)).toEqual({ levelId: 1 });
  });
});

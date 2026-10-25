// Воскресное пополнение карты жизни из резерва: закрытие недели, отметка в календаре и отмена не списывают дважды.
import { beforeEach, describe, expect, it } from 'vitest';
import type { CalEvent } from '../domain/types';
import { useStore } from './store';

const sunday: CalEvent = { key: 'wk:2026-11-02', date: '2026-11-01', dateMode: 'exact', kind: 'weekly', title: 'Долить карту жизни до лимита', amount: 8000 };
const s = () => useStore.getState();

describe('пополнение карты из резерва', () => {
  beforeEach(() => useStore.setState({ reserve: 100_000, reserveLog: [], marks: {}, closures: {} }));

  it('закрытие недели списывает долитое с резерва и отмечает пополнение', () => {
    s().closeWeek({ monday: '2026-10-26', limit: 8000, spent: 6000, left: 2000, transferred: 0, topUp: 6000 });
    expect(s().reserve).toBe(94_000);
    expect(s().marks['wk:2026-11-02']).toMatchObject({ done: true, amount: 6000 });
    s().reopenWeek('2026-10-26');
    expect(s().reserve).toBe(100_000);
    expect(s().marks['wk:2026-11-02']).toBeUndefined();
  });

  it('отметка в календаре тоже берёт из резерва, а закрытие недели после неё — только разницу', () => {
    s().markEvent(sunday, true, 5000);
    expect(s().reserve).toBe(95_000);
    s().closeWeek({ monday: '2026-10-26', limit: 8000, spent: 6000, left: 2000, transferred: 0, topUp: 6000 });
    expect(s().reserve).toBe(94_000);
    s().markEvent(sunday, false);
    expect(s().reserve).toBe(100_000);
    s().reopenWeek('2026-10-26');
    expect(s().reserve).toBe(100_000);
  });
});

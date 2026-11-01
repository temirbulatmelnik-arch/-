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

describe('воскресная сверка с банком', () => {
  beforeEach(() => useStore.setState({ reserve: 50_000, reserveLog: [], marks: {}, closures: {}, checkups: [], cardBalance: null, expenses: [], debts: [], bridge: null, oneOff: [] }));

  it('«Перевёл»: резерв и карта — из банка с переводом, пополнение отмечено один раз, повтор не списывает', () => {
    s().checkup({ monday: '2026-10-26', expected: { card: null, reserve: 50_000, credit: null }, actual: { card: 2000, reserve: 49_000, credit: null }, topUp: 6000, toReserve: 0 },
      { monday: '2026-10-26', limit: 8000, spent: 6000, left: 2000, transferred: 0 });
    expect(s().reserve).toBe(43_000);
    expect(s().cardBalance?.amount).toBe(8000);
    expect(s().marks['wk:2026-11-02']).toMatchObject({ done: true, amount: 6000 });
    expect(s().closures['2026-10-26']?.topUp).toBe(6000);
    expect(s().checkups).toHaveLength(1);
    // неделю закрыли ещё раз по-старому — пополнение уже отмечено, резерв не трогаем
    s().closeWeek({ monday: '2026-10-26', limit: 8000, spent: 6000, left: 2000, transferred: 0, topUp: 6000 });
    expect(s().reserve).toBe(43_000);
  });

  it('резерв пришёл из чата в воскресенье — закрытие недели пополнение второй раз не вычитает', () => {
    s().applySync({ reserve: 44_000 });
    const sundayKey = s().reserveLog.at(-1)!.date;
    const monday = (() => { const d = new Date(sundayKey); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); })();
    s().closeWeek({ monday, limit: 8000, spent: 6000, left: 2000, transferred: 0, topUp: 6000 });
    expect(s().reserve).toBe(44_000);
  });
});

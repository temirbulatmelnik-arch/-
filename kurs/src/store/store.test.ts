// Воскресное пополнение карты жизни из резерва: закрытие недели, отметка в календаре и отмена не списывают дважды.
import { beforeEach, describe, expect, it } from 'vitest';
import type { CalEvent } from '../domain/types';
import { useStore } from './store';
import { today } from '../domain/dates';

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

  it('долги кредиток — из банка: кредитка моста и остальные карты после сверки', () => {
    const debt = (id: string, balance: number) => ({ id, name: id, short: id, kind: 'card' as const, balance, startBalance: balance, rate: 0.3, dueDay: 10,
      rule: { type: 'interestPlus', plus: 1000 } as never, frozen: true, order: 1, closed: false });
    useStore.setState({ debts: [debt('a', 10_000), debt('b', 20_000), debt('m', 30_000)] });
    s().checkup({ monday: '2026-10-26', expected: { card: null, reserve: 50_000, credit: 30_000 }, actual: { card: 2000, reserve: 50_000, credit: 31_000 },
      topUp: 0, toReserve: 0, creditCard: 'm', cards: [{ id: 'a', expected: 10_000, actual: 10_000 }, { id: 'b', expected: 20_000, actual: 20_350 }] }, null);
    const by = Object.fromEntries(s().debts.map(d => [d.id, d]));
    expect([by.a.balance, by.b.balance, by.m.balance]).toEqual([10_000, 20_350, 31_000]);
    expect(by.a.updatedAt).toBeTruthy();
    expect(s().checkups.at(-1)?.cards).toHaveLength(2);
  });

  it('отметка оплаты в приложении — дата оплаты сегодня', () => {
    const pay: CalEvent = { key: 'fix:x:2026-12', date: '2026-12-20', dateMode: 'exact', kind: 'payment', title: 'Х', amount: 500 };
    s().markEvent(pay, true);
    expect(s().marks['fix:x:2026-12']).toMatchObject({ done: true, paidDate: today() });
  });

  it('платёж по кредитке: проценты — по дням с последнего обновления остатка, а не за целый месяц', () => {
    const card = { id: 'k', name: 'К', short: 'К', kind: 'card' as const, balance: 100_000, startBalance: 100_000, rate: 0.365, dueDay: 11,
      rule: { type: 'interestPlus', plus: 1000 } as never, frozen: true, order: 1, closed: false, updatedAt: '2025-10-01T09:00:00.000Z' };
    useStore.setState({ debts: [card] });
    const pay: CalEvent = { key: 'pay:k:2025-10', date: '2025-10-11', dateMode: 'exact', kind: 'payment', title: 'К', amount: 5000, debtId: 'k' };
    s().markEvent(pay, true, 5000);
    // 10 дней по 36,5% годовых со 100 000 — 1000 ₽ процентов
    expect(s().debts[0].balance).toBe(96_000);
    s().markEvent(pay, false);
    expect(s().debts[0].balance).toBe(100_000);
  });

  it('резерв пришёл из чата в воскресенье — закрытие недели пополнение второй раз не вычитает', () => {
    s().applySync({ reserve: 44_000 });
    const sundayKey = s().reserveLog.at(-1)!.date;
    const monday = (() => { const d = new Date(sundayKey); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); })();
    s().closeWeek({ monday, limit: 8000, spent: 6000, left: 2000, transferred: 0, topUp: 6000 });
    expect(s().reserve).toBe(44_000);
  });
});

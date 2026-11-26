import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyExchange, normalize, parseExchange } from '../domain/exchange';
import { addDays, today } from '../domain/dates';
import { ledger } from '../domain/ledger';

const storage = new Map<string, string>();
vi.stubGlobal('window', { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} });
const { useStore } = await import('./store');

const state = () => useStore.getState();
const balance = () => ledger(state()).card;
const expense = () => ({ date: today(), amount: 350, category: 'groceries' as const, source: 'life' as const, origin: 'manual' as const });

describe('остаток карты «Свои»', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 20, 10));
    state().startEmpty();
  });
  afterEach(() => vi.useRealTimers());

  it('учитывает покупку после старого импорта остатка из чата', () => {
    const cardBalance = { amount: 2000, date: today(), source: 'manual' as const };
    state().addExpenses([{ ...expense(), amount: 100 }]);
    state().beginImport('Остаток из чата');
    useStore.setState({ cardBalance }); // формат до записи времени импорта в cardBalance
    vi.setSystemTime(new Date(2026, 10, 20, 11));
    state().addExpenses([expense()]);
    expect(state().importData(JSON.parse(state().exportData()))).toBe(true);
    expect(state().expenses).toHaveLength(2);
    expect(balance()).toBe(1650);
  });

  it('учитывает запись в ту же миллисекунду после сохранения остатка', () => {
    state().setCardBalance({ amount: 2000, date: today(), source: 'manual' });
    state().addExpenses([expense()]);
    expect(balance()).toBe(1650);
  });

  it('сравнивает моменты сверки и покупки с разными смещениями', () => {
    state().setCardBalance({ amount: 2000, date: today(), source: 'manual', at: today() + 'T13:00:00+03:00' });
    state().addExpenses([{ ...expense(), occurredAt: today() + 'T11:00:00.000Z' }]);
    expect(balance()).toBe(1650);
  });

  it('пересчитывает остаток при изменениях расходов и уведомляет подписчиков', () => {
    state().setCardBalance({ amount: 2000, date: today(), source: 'manual' });
    const updates: (number | null)[] = [balance()];
    const unsubscribe = useStore.subscribe((next, prev) => {
      if (next.expenses !== prev.expenses) updates.push(ledger(next).card);
    });
    try {
      vi.setSystemTime(new Date(2026, 10, 20, 11));
      state().addExpenses([expense()]);
      const first = state().expenses[0].id;
      state().updateExpense(first, { amount: 500 });
      state().addExpenses([{ ...expense(), amount: 500 }]);
      const repeat = state().expenses[1].id;
      state().addExpenses([{ ...expense(), source: 'credit' }, { ...expense(), source: 'reserve' }]);
      state().updateExpense(first, { date: addDays(today(), -1) });
      state().updateExpense(first, { date: today() });
      state().removeExpense(first);
      state().removeExpense(repeat);
      expect(updates).toEqual([2000, 1650, 1500, 1000, 1000, 1500, 1000, 1500, 2000]);
    } finally {
      unsubscribe();
    }
  });

  it('новая сверка включает существующую покупку ровно один раз', () => {
    state().setCardBalance({ amount: 2000, date: today(), source: 'manual' });
    state().addExpenses([expense()]);
    const id = state().expenses[0].id;
    state().checkup({
      monday: '2026-11-16', expected: { card: 1650, reserve: 0, credit: null },
      actual: { card: 1650, reserve: 0, credit: null }, topUp: 0, toReserve: 0,
    }, null);
    expect(balance()).toBe(1650);
    state().updateExpense(id, { date: addDays(today(), 1) });
    expect(balance()).toBe(1650);
    state().addExpenses([{ ...expense(), amount: 150 }]);
    expect(balance()).toBe(1500);
  });

  it('обмен 2.6 сохраняет свои расходы и повторно не добавляет импортированные', () => {
    state().setCardBalance({ amount: 2000, date: today(), source: 'manual' });
    state().addExpenses([expense()]);
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    const file = normalize(parseExchange(JSON.stringify({
      app: 'kurs-exchange', version: 2, protocolVersion: '2.6',
      expenses: [expense(), { ...expense(), amount: 100 }],
    }))!, state());
    const apply = () => state().applySync(applyExchange(file, state(), today(), new Set(['expenses']), () => 'chat'));
    apply();
    apply();
    expect(state().expenses.map(e => e.amount)).toEqual([350, 100]);
    expect(balance()).toBe(1550);
  });

  it('остаток и расходы восстанавливаются из копии JSON и сохранённого состояния', async () => {
    state().setCardBalance({ amount: 2000, date: today(), source: 'manual' });
    state().addExpenses([expense()]);
    const backup = JSON.parse(state().exportData());
    expect(state().importData(backup)).toBe(true);
    expect(state().importData(backup)).toBe(true);
    expect(balance()).toBe(1650);
    vi.resetModules();
    const reloaded = (await import('./store')).useStore.getState();
    expect(reloaded.expenses).toHaveLength(1);
    expect(ledger(reloaded).card).toBe(1650);
  });

  it('остаток и расходы из одного файла обмена учитываются как одна сверка', () => {
    const file = normalize(parseExchange(JSON.stringify({
      app: 'kurs-exchange', version: 2, protocolVersion: '2.6',
      card: { amount: 2000, date: today() }, expenses: [expense()],
    }))!, state());
    state().applySync(applyExchange(file, state(), today(), new Set(['expenses', 'money']), () => 'chat'));
    expect(state().expenses).toHaveLength(1);
    expect(balance()).toBe(2000);
    state().addExpenses([expense()]);
    expect(balance()).toBe(1650);
  });
});

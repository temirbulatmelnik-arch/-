// Разбор текста со скриншотов банков: тексты по образцу Live Text, имена и суммы вымышленные.
import { describe, expect, it } from 'vitest';
import { bankCat, parseBankText } from './bankText';

const VTB = `Сегодня, 2 ноября - 381 ₽

Фастфуд
-240 ₽
Кафе и рестораны
العيا
Транспорт
-95 ₽
Іранспорт

Транспорт
- 46 ₽
Транспорт
Вчера, 1 ноября - 9 900 ₽
А
Иван Петрович...
Переводы людям
-5 100 ₽

Иван Петрович И
Входящие переводы
+2 000 ₽

Транспорт
Транспорт
- 46 ₽

Транспорт
Транспорт
- 95 ₽`;

const SBER = `Вчера
2 000 ₽
Иван Петрович И
Перевод по СБП
2 000 ₽
Пётр Сергеевич С.
Перевод по СБП
+2 000 ₽
Обязательный платёж по кредитной карте
Внесите платёж 12 345,67р до 30.11.26 на...
Детали задолженности
31 октября, сб
СберБанк
Погашение кредита
300,00 ₽
200,50ł
Иван Петрович И.
Перевод по СБП
+ 400 ₽
Платёж по кредиту
Сегодня до конца дня будет списан платёж...
Узнать больше
СберБанк
Погашение кредита
99,50 ₽`;

const TBANK = `22 октября
-11.111 ₽
Плата по кредитке
Услуги банка
-11 ł
Платинум
16 октября
-4 000 ₽
Иван П.
Переводы
-4 000 ₽
Платинум
Между своими счетами
Переводы
+15 000 ₽
Платинум
22 сентября
Плата по кредитке
УсЛуГи
Рассрочка на 4 000 ₽
-10 222,13 ₽
Платинум`;

describe('текст со скриншота банка', () => {
  it('категории с ошибками распознавания', () => {
    expect(bankCat('Іранспорт')).toBe('Транспорт');
    expect(bankCat('Каче и рестораны')).toBe('Кафе и рестораны');
    expect(bankCat('УсЛуГи')).toBe('Услуги банка');
    expect(bankCat('Иван Петрович И')).toBeNull();
  });

  it('ВТБ: дни, суммы дня, названия и категории, вторые поездки, неполный день', () => {
    const r = parseBankText(VTB, '2026-11-02');
    expect(r.bank).toBe('vtb');
    expect(r.ops.map(o => `${o.date} ${o.sign}${o.amount} ${o.name}/${o.cat}`)).toEqual([
      '2026-11-02 -240 Фастфуд/Кафе и рестораны', '2026-11-02 -95 Транспорт/Транспорт', '2026-11-02 -46 Транспорт/Транспорт',
      '2026-11-01 -5100 Иван Петрович/Переводы людям', '2026-11-01 +2000 Иван Петрович И/Входящие переводы',
      '2026-11-01 -46 Транспорт/Транспорт', '2026-11-01 -95 Транспорт/Транспорт',
    ]);
    expect(r.days).toEqual([{ date: '2026-11-02', total: 381, out: 381 }, { date: '2026-11-01', total: 9900, out: 5241 }]);
  });

  it('две одинаковые операции дня — номера 1 и 2', () => {
    const r = parseBankText('Сегодня, 2 ноября −190 ₽\nТранспорт\n−95 ₽\nТранспорт\nТранспорт\n−95 ₽\nТранспорт', '2026-11-02');
    expect(r.ops.map(o => o.ord)).toEqual([1, 2]);
  });

  it('Сбер: сумма дня не на месте, обязательный платёж, уведомления — не операции', () => {
    const r = parseBankText(SBER, '2026-11-02');
    expect(r.bank).toBe('sber');
    expect(r.credit).toBe(false);
    expect(r.ops.map(o => `${o.date} ${o.sign}${o.amount} ${o.name}`)).toEqual([
      '2026-11-01 2000 Иван Петрович И', '2026-11-01 +2000 Пётр Сергеевич С.', '2026-10-31 200.5 СберБанк', '2026-10-31 +400 Иван Петрович И.', '2026-10-31 99.5 СберБанк',
    ]);
    expect(r.days.map(d => [d.total, d.out])).toEqual([[2000, 2000], [300, 300]]);
    expect(r.dues).toEqual([expect.objectContaining({ amount: 12345.67, date: '2026-11-30' })]);
  });

  it('Т-Банк: кредитка, сумма из заголовка, «Рассрочка на» — кнопка', () => {
    const r = parseBankText(TBANK, '2026-11-02');
    expect(r.bank).toBe('tbank');
    expect(r.credit).toBe(true);
    expect(r.ops.map(o => `${o.date} ${o.sign}${o.amount} ${o.name}/${o.cat ?? ''}`)).toEqual([
      '2026-10-22 -11111 Плата по кредитке/Услуги банка', '2026-10-16 -4000 Иван П./Переводы', '2026-10-16 +15000 Между своими счетами/Переводы',
      '2026-09-22 -10222.13 Плата по кредитке/Услуги банка',
    ]);
    expect(r.ops[0].fromHeader).toBe(true);
  });
});

import { fromBank } from './proposals';
import type { Debt, Expense } from './types';

const debt = (p: Partial<Debt>): Debt => ({
  id: 'x', name: 'X', short: 'X', kind: 'card', balance: 100_000, startBalance: 100_000, rate: 0.5, dueDay: 16,
  rule: { type: 'fixed', amount: 1000 }, frozen: true, order: 1, closed: false, ...p,
});
const debts = [
  debt({ id: 'alfa', name: 'Альфа-Банк, кредитка', short: 'Альфа', dueDay: 2, rule: { type: 'fixed', amount: 5100 } }),
  debt({ id: 'sber-card', name: 'Сбер, кредитная карта', short: 'Сбер', dueDay: 30, rule: { type: 'fixed', amount: 11_000 } }),
  debt({ id: 'tbank', name: 'Т-Банк Платинум', short: 'Т-Банк', dueDay: 16, rule: { type: 'fixed', amount: 9000 } }),
];
const ctx = (expenses: Expense[] = [], memory: Record<string, never> | Record<string, 'self'> = {}) => ({
  cal: { debts, incomes: [], fixed: [], oneOff: [], templateFrom: '2026-10', weeklyOverrides: [], overrides: {} },
  marks: {}, expenses, reserve: 50_000, now: '2026-11-02', memory,
});
const spent = (date: string, amount: number): Expense => ({ id: `e${amount}`, date, amount, category: 'transport', source: 'life', origin: 'manual', createdAt: `${date}T10:00:00Z` });

describe('что делать с операциями со скриншота', () => {
  it('ВТБ: траты по категориям банка, внесённая вручную поездка — повтор, перевод себе закрывает платёж, неполный день', () => {
    const r = fromBank(parseBankText(VTB, '2026-11-02'), ctx([spent('2026-11-02', 95)]));
    const tx = r.items.flatMap(i => (i.type === 'tx' ? [i.tx] : []));
    expect(tx.map(t => `${t.date} ${t.amount} ${t.category}${t.duplicate ? ' повтор' : ''}`)).toEqual([
      '2026-11-02 240 fun', '2026-11-02 95 transport повтор', '2026-11-02 46 transport', '2026-11-01 46 transport', '2026-11-01 95 transport',
    ]);
    expect(tx[1].linkId).toBe('e95');
    const mark = r.items.find(i => i.type === 'mark');
    expect(mark).toMatchObject({ amount: 5100, event: { debtId: 'alfa' }, selfKey: 'person:ИВАН' });
    expect(r.items.find(i => i.type === 'person')).toMatchObject({ incoming: true, amount: 2000, choice: null });
    expect(r.warnings.some(w => w.includes('Часть 01.11 не видна') && w.replace(/\s/g, ' ').includes('4 659'))).toBe(true);
  });

  it('память: «это я» — входящий перевод не доход', () => {
    const r = fromBank(parseBankText(VTB, '2026-11-02'), ctx([], { 'person:ИВАН': 'self' }));
    expect(r.items.some(i => i.type === 'info' && i.text.includes('Перевод от себя'))).toBe(true);
  });

  it('Сбер: точный обязательный платёж кредитки, погашения — не траты', () => {
    const r = fromBank(parseBankText(SBER, '2026-11-02'), ctx());
    expect(r.items.find(i => i.type === 'due')).toMatchObject({ debt: { id: 'sber-card' }, amount: 12345.67, date: '2026-11-30' });
    expect(r.items.filter(i => i.type === 'tx')).toHaveLength(0);
  });

  it('Т-Банк: пополнение кредитки закрывает платёж, плата банку и перевод с кредитки — не траты', () => {
    const r = fromBank(parseBankText(TBANK, '2026-11-02'), ctx());
    expect(r.items.find(i => i.type === 'mark')).toMatchObject({ amount: 15000, event: { debtId: 'tbank' } });
    expect(r.items.filter(i => i.type === 'tx')).toHaveLength(0);
    expect(r.warnings.some(w => w.includes('с кредитки'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { parseScreenshot, reflowOCR, type OCRWord } from './screenshots';

const now = '2026-11-22';
const parse = (text: string) => parseScreenshot(text, now, 'image', 96);

describe('операции в банковской истории', () => {
  it('разбирает несколько дней, заголовки с итогом, две колонки и валюту на соседней строке', () => {
    const result = parse(`18:24 LTE
История
Q STORE   −2 390 P
Табак
Транспорт   −46
14 ноября   −725 Р
Винлаб
Алкоголь
−480
₽
Транспорт   −46 Р
Яндекс.Плюс   −199
Цифровой контент
13 ноября −1 515,92 ₽
Пятерочка
Супермаркеты
−1 059,92
руб.
+25
Администрация   +12 284
Зарплата
Между своими счетами   1 000 ₽
Баланс карты
78 234 ₽
Получите 10 000 ₽
Главная Платежи История Чат`);
    expect(result.rows.map(r => r.amount)).toEqual([2390, 46, 480, 46, 199, 1059.92, 12284, 1000]);
    expect(result.rows.map(r => r.date)).toEqual(['', '', '2026-11-14', '2026-11-14', '2026-11-14', '2026-11-13', '2026-11-13', '2026-11-13']);
    expect(result.rows.at(-2)?.kind).toBe('payroll');
    expect(result.rows.at(-1)?.kind).toBe('transfer');
    expect(result.rules['currency-next-line']).toBe(2);
    expect(result.rules['contextual-rubles']).toBeGreaterThanOrEqual(2);
  });

  it('различает валютные форматы и отделяет время покупки от цены', () => {
    const text = `Вчера
Покупка Магнит —1.459,30 руб
Покупка Озон −125 EUR
Покупка транспорт
07:41
−95
Баланс 42 190 ₽`;
    expect(parse(text).rows.map(r => [r.amount, r.currency, r.time])).toEqual([[1459.3, 'RUB', ''], [125, 'EUR', ''], [95, 'RUB', '07:41']]);
  });

  it('восстанавливает строки из раздельных блоков по координатам', () => {
    const word = (text: string, x0: number, x1: number, y1: number): OCRWord => ({ text, x0, x1, y0: y1 - 20, y1 });
    const data = reflowOCR([
      word('Магнит', 30, 108, 252), word('Озон', 32, 88, 334), word('−520', 260, 303, 333), word('₽', 310, 323, 333),
      word('−2', 251, 274, 254), word('390', 280, 307, 254), word('Р', 315, 325, 254),
      word('14', 28, 42, 193), word('ноября', 47, 89, 193), word('−785', 112, 138, 193),
    ]);
    expect(parse(data).rows.map(r => [r.merchant, r.amount])).toEqual([['Магнит', 2390], ['Озон', 520]]);
  });

  it('сохраняет частичный разбор и диагностирует пропуск с маскированием', () => {
    const input = `14 ноября
Магнит −200
Сумма за вторую покупку нечитабельна
ИНН 1234567890
1234 5678 9012 3456`;
    const result = parse(input);
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.rules['missing-amount']).toBeTruthy();
    expect(result.text).not.toMatch(/1234567890|1234 5678|9012 3456/);
  });
});

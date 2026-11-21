import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_BOOK } from '../domain/accounts';
import { ledger } from '../domain/ledger';
import { screenshotDuplicate, screenshotRows } from '../domain/screenshots';
import { weekSummary } from '../domain/summary';
import { recordScreenshot } from '../screens/ScreenshotImport';
import { useStore } from './store';

afterEach(() => vi.useRealTimers());
const date = '2026-11-21';
const setup = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(date + 'T17:00:00Z'));
  useStore.getState().startEmpty();
  useStore.setState({ cardBalance: { amount: 2000, at: '2026-11-20T17:00:00Z', date: '2026-11-20', source: 'manual' },
    reserve: 10000, accountBook: { ...EMPTY_BOOK, paymentRouting: 'life' } });
};
const screenshot = `21.11.2026
Пятёрочка −350,00 ₽
Возврат покупки Пятёрочка +350,00 ₽
Перевод между своими счетами на накопительный −220 ₽
Перевод из Сплита +3500 ₽
Входящий перевод от друга +300 ₽
Зарплата +50000 ₽
Покупка кредитная карта −450 ₽
Отменена покупка −210 ₽
Остаток 2 000 ₽
1234 5678 9012 3456`;

describe('операции со скриншотов', () => {
  it('различает восемь типов и исключает строку остатка', () => {
    const rows = screenshotRows(screenshot, date, 'example', 98);
    expect(rows.map(row => row.kind)).toEqual(['purchase', 'refund', 'transfer', 'loan', 'incoming', 'payroll', 'credit', 'unknown']);
    expect(rows[0]).toMatchObject({ date, amount: 350, category: 'groceries' });
    expect(rows[2]).toMatchObject({ accountId: 'life', toAccountId: 'reserve' });
    expect(JSON.stringify(rows)).not.toContain('1234 5678');
  });

  it('не дублирует скриншот, обновляет недельные деньги, а перевод и возврат учитывает отдельно', () => {
    setup();
    const [buy, back] = screenshotRows(screenshot, date, 'one', 98);
    const get = useStore.getState;
    const booking = { ...buy, originalCategory: buy.category };
    expect(recordScreenshot(booking)).toBe(true);
    expect(recordScreenshot(booking)).toBe(false);
    expect(ledger(get()).lifeAvailable).toBe(1650);
    expect(weekSummary(get().expenses, get().debts, [], date).spent).toBe(350);
    expect(screenshotDuplicate({ ...buy, fingerprint: 'new-image' }, get().expenses, get().accountBook)).toMatchObject({ exact: false });
    expect(recordScreenshot({ ...back, expenseId: get().expenses[0].id, originalCategory: back.category })).toBe(true);
    const transfer = screenshotRows(`21.11.2026\nПеревод между своими счетами с накопительного +220 ₽`, date, 'two', 98)[0];
    expect(recordScreenshot({ ...transfer, originalCategory: transfer.category })).toBe(true);
    expect(ledger(get())).toMatchObject({ reserve: 9780, card: 2220, lifeAvailable: 2000 });
    expect(get().expenses).toHaveLength(1);
  });

  it('блокирует повторный импорт исторической выдачи займа без записи в журнале', () => {
    setup();
    const [row] = screenshotRows('21.11.2026\nПеревод из Сплита +3500 ₽', date, 'historic', 98);
    useStore.setState({ accountBook: { ...EMPTY_BOOK, historicalLoans: [{ eventKey: 'old', debtId: 'split', date, amount: 3500 }] } });
    expect(screenshotDuplicate({ ...row, debtId: 'split' }, [], useStore.getState().accountBook)).toMatchObject({ exact: true });
    expect(recordScreenshot({ ...row, originalCategory: row.category, debtId: 'split' })).toBe(false);
  });

  it('использует один отпечаток банковского идентификатора для разных снимков', () => {
    setup();
    const line = '21.11.2026\nПятёрочка −350 ₽\nКарта ••3423\nOPID-abcabcabcabcabcabcabcabc';
    const first = screenshotRows(line, date, 'one', 98)[0];
    const second = screenshotRows(line, date, 'two', 98)[0];
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.memo).not.toContain('OPID');
    expect(recordScreenshot({ ...first, originalCategory: first.category })).toBe(true);
    expect(recordScreenshot({ ...second, originalCategory: second.category })).toBe(false);
  });

  it('предупреждает о валюте и скрывает реквизиты даже после ручного исправления', () => {
    setup();
    const [row] = screenshotRows('Оплата Магнит -30,00 EUR', date, 'one', 50);
    expect(row.warnings).toHaveLength(3);
    expect(recordScreenshot({ ...row, originalCategory: row.category })).toBe(false);
    expect(recordScreenshot({ ...row, date, currency: 'RUB', merchant: 'Магнит 1234 5678 9012 3456',
      originalCategory: row.category })).toBe(true);
    expect(useStore.getState().expenses[0].note).toBe('Магнит ••••');
  });
});

import { describe, expect, it } from 'vitest';
import { EMPTY_BOOK, type AccountOperation } from './accounts';
import { reconcileStatement } from './bankReconciliation';
import { parseStatementText } from './pdf';
import { fromDrafts } from './proposals';
import { parseCsv } from './statements';
import type { CalEvent, Expense } from './types';

const file = [
  'Выписка ВТБ',
  'Входящий остаток;1000,00',
  'Период;25.11.2026;26.11.2026',
  'Дата операции;Сумма операции;Описание;Счёт;ID операции',
  '26.11.2026 10:00:00;-100,25;Обед;Дебет;food',
  '26.11.2026 10:20:00;+40,00;Кэшбэк;Дебет;cashback',
  'Исходящий остаток;939,75',
].join('\n');

describe('проверка конечного остатка выписки', () => {
  it('сверяет входящий остаток и подписанные суммы в копейках', () => {
    const result = parseCsv(file, 'fixture')!;
    expect(result).toMatchObject({ bank: 'vtb', rejected: 0,
      bounds: { opening: 1000, closing: 939.75, end: '2026-11-26' } });
    expect(reconcileStatement(result.bounds, result.rows.map(row => row.income ? row.amount : -row.amount), result.rejected))
      .toMatchObject({ status: 'matched', calculatedMinor: 93975, differenceMinor: 0 });
    expect(reconcileStatement({ ...result.bounds, closing: 939.76 }, [-100.25, 40]))
      .toMatchObject({ status: 'mismatch', differenceMinor: 1 });
    expect(reconcileStatement(result.bounds, [-100.25, null]).status).toBe('incomplete');
    expect(reconcileStatement(result.bounds, [-100.25, 40], 1).status).toBe('incomplete');
  });

  it('поднимает остатки из локального PDF и требует явный знак каждой операции', () => {
    const doc = parseStatementText('Период с 25.11.2026 по 26.11.2026\nВходящий остаток 1 000,00 ₽\n26.11.2026 10:30 -15,00 ₽ Покупка\nИсходящий остаток 985,00 ₽');
    expect(doc.lines[0].occurredAt).toBe('2026-11-26T10:30:00+03:00');
    const result = reconcileStatement({ opening: doc.openingBalance, closing: doc.closingBalance, end: doc.periodEnd },
      doc.lines.map(line => line.sign == null ? null : line.sign * line.amount));
    expect(result).toMatchObject({ end: '2026-11-26', status: 'matched', closingMinor: 98500 });
  });
});

it('связывает обязательство и возврат, не повторяет перевод между счетами и оставляет заём на проверку', () => {
  const pay: CalEvent = { key: 'fix:mts:2026-11', kind: 'payment', date: '2026-11-26', dateMode: 'exact', title: 'МТС, связь', amount: 20 };
  const purchase: Expense = { id: 'one', amount: 10, source: 'life', category: 'shopping', date: '2026-11-25', createdAt: '', note: 'Sample Mart' };
  const prior: AccountOperation = { id: 'sent', type: 'transfer', accountId: 'life', toAccountId: 'reserve', origin: 'bank',
    fundingSource: 'own', amount: 400, status: 'confirmed', date: '2026-11-26' };
  const rows = parseCsv([
    'Выписка ВТБ',
    'Дата;Сумма;Описание;Счёт;ID операции',
    '26.11.2026 19:40:00;-20;МТС;Дебет;bill',
    '26.11.2026 19:40:01;+10;Возврат Sample Mart;Дебет;refund',
    '26.11.2026 19:40:02;-400;Между своими — на накопительный;Дебет;transfer',
    '26.11.2026 19:40:03;+500;Выдача займа;Дебет;lender',
  ].join('\n'), 'example')!.rows;
  const ctx = { now: pay.date, reserve: 0, expenses: [purchase], marks: {}, cal: { debts: [], incomes: [], fixed: [], oneOff: [pay],
    weeklyOverrides: [], templateFrom: '2027-01', accountBook: { ...EMPTY_BOOK, operations: [prior] } } };
  const result = fromDrafts(rows, ctx, 'Проверка');
  expect(result.items.filter(item => item.on)).toMatchObject([
    { type: 'mark', bankAt: '2026-11-26T19:40:00+03:00' },
    { type: 'posting', op: { type: 'refund', expenseId: 'one', amount: 10 } },
  ]);
  expect(result.items.filter(item => !item.on)).toMatchObject([
    { type: 'tx', tx: { skip: true } }, { type: 'income', event: null },
  ]);
});

it('учитывает дебетовую и кредитовую стороны одного собственного перевода только один раз', () => {
  const rows = parseCsv([
    'Выписка ВТБ',
    'Дата;Сумма;Описание;Счёт;ID операции',
    '26.11.2026 19:40:00;-222;Между своими на накопительный;Дебет;debit-side',
    '26.11.2026 19:40:01;+222;Между своими с карты;Накопительный счёт;credit-side',
  ].join('\n'), 'example')!.rows;
  const ctx = { now: '2026-11-26', reserve: 0, expenses: [], marks: {}, cal: { debts: [], incomes: [], fixed: [], oneOff: [],
    weeklyOverrides: [], templateFrom: '2027-01', accountBook: EMPTY_BOOK } };
  expect(fromDrafts(rows, ctx, 'Проверка').items.filter(item => item.on)).toMatchObject([
    { type: 'posting', op: { type: 'transfer', accountId: 'life', toAccountId: 'reserve', amount: 222 } },
  ]);
});

it('показывает ранее записанную проводку в предпросмотре пересекающихся выписок', () => {
  const rows = parseCsv(file, 'fixture')!.rows;
  const old = rows.find(row => row.income)!;
  const bank: AccountOperation = { id: 'known', externalId: old.fingerprint, type: 'income', origin: 'bank',
    status: 'confirmed', date: old.date, accountId: 'life', fundingSource: 'own', amount: old.amount };
  const ctx = { now: old.date, reserve: 0, expenses: [], marks: {}, cal: { debts: [], incomes: [], fixed: [], oneOff: [],
    weeklyOverrides: [], templateFrom: '2027-01', accountBook: { ...EMPTY_BOOK, operations: [bank] } } };
  const review = fromDrafts(rows, ctx, 'Проверка');
  expect(review.duplicates).toMatchObject([{ merchant: 'Кэшбэк', amount: 40 }]);
  expect(review.items).toMatchObject([{ type: 'tx', on: true, tx: { amount: 100.25 } }]);
});

it('читает проводки ВТБ из колонок счёта и проверяет остаток по дате обработки', async () => {
  const { parseStatementText } = await import('./pdf');
  const text = [
    'Период выписки 01.01.2026 - 03.01.2026',
    'Баланс на начало периода 1000.00 RUB Поступления 125.25 RUB',
    'Баланс на конец периода 1100.00 RUB Расходные операции 25.25 RUB',
    'Дата обработки Сумма операции в валюте счета/карты',
    '01.01.2026 02.01.2026 -1.00 USD 0 RUB -25.25 RUB Покупка',
    '14:01',
    '03.01.2026 03.01.2026 125.25 RUB 125.25 RUB 0 RUB Возврат средств',
    '11:25',
  ].join('\n');
  const statement = parseStatementText(text);
  expect(statement.lines.map(({ date, occurredAt, amount, sign }) => [date, occurredAt, amount, sign])).toEqual([
    ['2026-01-02', undefined, 25.25, -1], ['2026-01-03', '2026-01-03T11:25:00+03:00', 125.25, 1],
  ]);
  expect(reconcileStatement({ opening: statement.openingBalance, closing: statement.closingBalance, end: statement.periodEnd },
    statement.lines.map(row => row.amount * row.sign!), statement.rejected)).toMatchObject({ status: 'matched', differenceMinor: 0 });
});

it('распознаёт оригинальный CSV ВТБ и сохраняет одинаковые покупки и ключи между выгрузками', async () => {
  const { parseCsv } = await import('./statements');
  const header = ['Название продукта', 'Карта', 'Номер счёта/Кредитного договора', 'Дата и время операции',
    'Списание/Зачисление', 'Сумма в валюте операции', 'Валюта операции', 'Сумма в валюте счёта',
    'Валюта счёта', 'Наименование операции', 'Тип операции', 'Статус операции'].join(';');
  const purchase = 'Карта для жизни;;*0001;02.01.2026 15:32;Списание;-9,99;USD;-990,43;RUB;Покупка;Оплата товаров и услуг;Выполнено';
  const pending = purchase.replace('Выполнено', 'В обработке');
  const receipt = 'Карта для жизни;;*0001;02.01.2026 15:40;Зачисление;450,12;RUB;;;СБП;Входящий перевод СБП;Выполнено';
  const full = parseCsv([header, receipt, purchase, purchase, pending].join('\n'), 'full')!;
  const overlap = parseCsv([header, purchase, purchase].join('\n'), 'other')!;
  expect(full).toMatchObject({ bank: 'vtb', rejected: 0 });
  expect(full.rows.map(row => [row.amount, row.income])).toEqual([[450.12, true], [990.43, false], [990.43, false]]);
  expect(full.rows.slice(1).map(row => row.fingerprint)).toEqual(overlap.rows.map(row => row.fingerprint));
  expect(new Set(overlap.rows.map(row => row.fingerprint)).size).toBe(2);
});

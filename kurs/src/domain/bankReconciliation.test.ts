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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetExpenses, cents, postings } from '../../src/domain/accounts';
import { budgetWeek } from '../../src/domain/budget';
import { buildExchange, exchangeRevision } from '../../src/domain/exchange';
import { ledger } from '../../src/domain/ledger';
import { setPlanSource } from '../../src/domain/plan';
import { availableToday, dayBudget, explainDailySpending, weekSummary } from '../../src/domain/summary';
import { weekMoney } from '../../src/domain/bridge';
import { weekReport } from '../../src/domain/weekly';
import type { Expense } from '../../src/domain/types';

const backup = process.env.KURS_GOLDEN_BACKUP;
const expected = process.env.KURS_GOLDEN_EXPECTED;

it.skipIf(!backup || !expected)('воспроизводит состояние с iPhone на контрольную дату', () => {
  const state = JSON.parse(readFileSync(backup!, 'utf8'));
  const reference = JSON.parse(readFileSync(expected!, 'utf8'));
  const now = reference.date as string;
  setPlanSource(() => state.plan);
  try {
    const led = ledger({ ...state, now });
    const status = buildExchange(state, now).status!;
    const expenses = budgetExpenses(state.expenses, state.accountBook);
    const week = weekSummary(expenses, state.debts, state.weeklyOverrides, now);
    const day = dayBudget(expenses, state.debts, state.weeklyOverrides, now);
    const count = { expenses: state.expenses.length, operations: state.accountBook.operations.length, debts: state.debts.length,
      marks: Object.keys(state.marks).length, checkups: state.checkups.length };
    expect(count).toEqual(reference.counts);
    expect(exchangeRevision(state)).toBe(reference.revision);
    expect([led.card, led.reserve, status.totalCash, led.lifeAvailable, led.heldOnCard, status.totalDebt].map(n => cents(n as number)))
      .toEqual(Object.values(reference.balances));
    expect([week.limit, week.spent, week.left].map(cents)).toEqual([reference.week.limit, reference.week.spent, reference.week.left]);
    expect(['2026-11-23', '2026-11-24', '2026-11-25', now].map(date => cents(dayBudget(expenses, state.debts, state.weeklyOverrides, date).spentToday)))
      .toEqual(reference.week.daily);
    expect([day.day, availableToday(day, led.lifeAvailable)].map(cents)).toEqual([reference.today.guide, reference.today.canSpend]);
    const { base, cautious, stress, first, amount } = reference.forecasts;
    expect(status).toMatchObject({ coverage: { min: base, shortage: { date: first, amount } }, coverageScenarios: { cautious: { min: cautious }, stress: { min: stress } } });
    expect(led.reconciliation.map(item => item.kind)).toEqual(reference.review);
    expect(state.accountBook.operations.filter((op: Parameters<typeof postings>[0]) =>
      postings(op).reduce((sum, posting) => sum + posting.amount, 0) !== 0)).toHaveLength(reference.unbalanced);

    const operations = state.accountBook.operations as Parameters<typeof postings>[0][];
    const payment = operations.find(op => op.type === 'expense' && op.eventKey?.startsWith('fix:mts:') && op.expenseId);
    if (!payment || payment.type !== 'expense') throw new Error('Связанный платёж МТС отсутствует в эталоне');
    const transfer = operations.find(op => op.type === 'transfer' && op.purpose === 'prepare' &&
      op.shares?.some(share => share.key === payment.eventKey));
    expect(transfer).toBeDefined();
    expect(payment.budget?.weekly).toBe(0);
    expect(cents(payment.budget!.prepared)).toBe(cents(payment.amount));
    const outgoing = postings(transfer!).concat(postings(payment));
    expect(outgoing.filter(leg => leg.account === 'cash:life').reduce((sum, leg) => sum + leg.amount, 0)).toBe(0);
    expect(outgoing.filter(leg => leg.account === 'cash:reserve').reduce((sum, leg) => sum + leg.amount, 0)).toBe(-cents(payment.amount));
    expect(expenses.filter(e => e.id === payment.expenseId).every(e => e.weeklyAmount === 0)).toBe(true);
  } finally {
    setPlanSource(() => null);
  }
});

describe('бюджетные проекции на обезличенных данных', () => {
  const date = '2026-03-10';
  const monday = '2026-03-09';
  const expense: Expense = { id: 'one', date, amount: 11.32, source: 'life', category: 'fixed',
    createdAt: '', weeklyAmount: 2.25 };
  const entries: Expense[] = [expense, { ...expense, id: 'two', source: 'reserve', weeklyAmount: 3.04 },
    { ...expense, id: 'three', source: 'credit', weeklyAmount: 4.71 }];
  const limits = [{ from: monday, to: '2026-03-15', amount: 70 }];

  it('сводки недели и дня используют одну бюджетную сумму и отдельные источники', () => {
    expect(budgetWeek(entries, monday)).toMatchObject({ spent: 1000, life: 225, reserve: 304, credit: 471, byCategory: { fixed: 1000 } });
    const summary = weekSummary(entries, [], limits, date);
    expect(summary).toMatchObject({ spent: 10, left: 60 });
    expect(weekMoney(entries, [], limits, null, monday)).toMatchObject({ spent: summary.spent, left: summary.left });
    expect(weekReport(entries, [], limits, monday)).toMatchObject({ spent: summary.spent, left: summary.left });
    expect(dayBudget(entries, [], limits, date)).toMatchObject({ spentToday: 10, spentLife: 2.25, spentReserve: 3.04, spentCredit: 4.71 });
  });

  it('объясняет доступную сумму с точностью до копейки', () => {
    const day = dayBudget([expense], [], [{ ...limits[0], amount: 600 }], date);
    const reason = explainDailySpending(day, 31.54);
    expect(reason).toMatchObject({ value: 3154, inputs: { guide: 10000, spent: 225, weekRemaining: 59775, lifeAvailable: 3154, daysRemaining: 6 } });
    expect(availableToday(day, 31.54)).toBe(31.54);
    expect(explainDailySpending(day, null).value).toBe(0);
  });
});

it('CSV сохраняет одинаковые покупки с разными банковскими ID и узнаёт пять повторов файла', async () => {
  const { parseCsv } = await import('../../src/domain/statements');
  const { markDuplicates } = await import('../../src/domain/proposals');
  const csv = [
    'Дата;Сумма;Описание;Счёт;ID операции',
    '01.03.2026 19:20:00;-95,00;Транспорт;Дебет;one',
    '01.03.2026 19:20:00;-95,00;Транспорт;Дебет;two',
  ].join('\n');
  const rows = parseCsv(csv, 'file-hash')!.rows;
  expect(rows.map(row => row.occurredAt)).toEqual(['2026-03-01T19:20:00+03:00', '2026-03-01T19:20:00+03:00']);
  const toExpense = (row: (typeof rows)[number]): Expense => ({
    id: row.id, date: row.date, amount: row.amount, source: row.source, category: row.category, fingerprint: row.fingerprint, createdAt: '',
  });
  expect(markDuplicates(rows, [toExpense(rows[0])]).map(row => row.duplicate)).toEqual([true, false]);
  for (let i = 0; i < 5; i++) expect(markDuplicates(parseCsv(csv, 'file-hash')!.rows, rows.map(toExpense)).every(row => row.duplicate)).toBe(true);
  expect(markDuplicates(rows, [{ ...toExpense(rows[0]), fingerprint: undefined }])[0]).toMatchObject({ needsDuplicateReview: true });
});

it('одно зачисление связывается с двумя документами и сохраняет один денежный эффект', async () => {
  const { allocatePayrollReceipt, payrollReceiptParts } = await import('../../src/domain/payrollReceipts');
  const date = '2026-04-03';
  const operation = { id: 'bank-one', type: 'income', accountId: 'life', date, amount: 1430.42,
    origin: 'bank', status: 'confirmed', fundingSource: 'own' } as const;
  const parts = [{ key: 'work:allowance', amount: 1000 }, { key: 'work:leave', amount: 430.42 }];
  const docs = Object.fromEntries(parts.map(p => [p.key, { net: p.amount, payDate: date, asOf: date }]));
  const operations = allocatePayrollReceipt([operation], docs, operation.id, parts)!;
  expect(operations).toHaveLength(1);
  expect(postings(operations[0])).toEqual(postings(operation));
  expect(payrollReceiptParts(operations).get(parts[0].key)).toEqual({ receiptId: operation.id, date, amount: 1000 });
  expect(allocatePayrollReceipt(operations, docs, operation.id, parts)).toBeNull();
  expect(allocatePayrollReceipt([operation], docs, operation.id, parts.slice(1))).toBeNull();
});

it('налог пересчитывает накопленную базу на границе ставки в целых копейках', async () => {
  const { explainTax } = await import('../../src/domain/tax');
  expect(explainTax(239000000, 2000000)).toMatchObject({ value: 280000, sources: ['ru-primary-tax-2025'] });
});

it.skipIf(!backup || !expected)('репетирует перенос полной копии без записи и изменения финансовых результатов', async () => {
  const { dryRunFinanceMigration } = await import('../../src/domain/financeMigration');
  const raw = readFileSync(backup!, 'utf8');
  const state = JSON.parse(raw);
  const reference = JSON.parse(readFileSync(expected!, 'utf8'));
  setPlanSource(() => state.plan);
  try {
    const result = dryRunFinanceMigration(state, reference.date);
    expect(result).toMatchObject({ sameMoney: true, canCommit: true, duplicateIds: 0, lostOperations: 0, unbalanced: 0,
      expenses: reference.counts.expenses, operations: reference.counts.operations, debts: reference.counts.debts });
    expect(result.state.expenses).toEqual(state.expenses);
    expect(result.state.work).toEqual(state.work);
    const { packFinanceState, unpackFinanceState, stableJson } = await import('../../src/store/financeStorage');
    const { migrationProjection } = await import('../../src/domain/financeMigration');
    const archived = packFinanceState(result.state);
    const restored = unpackFinanceState<typeof result.state>(archived);
    expect(archived.length).toBeLessThan(JSON.stringify(result.state).length);
    expect(stableJson(restored)).toBe(stableJson(result.state));
    expect(migrationProjection(restored, reference.date)).toEqual(result.before);
    expect(dryRunFinanceMigration(restored, reference.date).state).toEqual(result.state);
    expect(readFileSync(backup!, 'utf8')).toBe(raw);
  } finally {
    setPlanSource(() => null);
  }
}, 20000);

it.skipIf(!backup || !expected)('переносит старые денежные отметки и движения в сохранённый журнал без повторного чтения', async () => {
  const { materializeJournal, financialJournal } = await import('../../src/domain/journal');
  const { migrationProjection } = await import('../../src/domain/financeMigration');
  const source = JSON.parse(readFileSync(backup!, 'utf8'));
  const reference = JSON.parse(readFileSync(expected!, 'utf8'));
  const date = reference.date;
  const historical = financialJournal(source).entries.filter(row => row.legacy);
  expect(historical.length).toBeGreaterThan(0);
  const current = materializeJournal(source);
  expect(current.accountBook.operations.filter((row: { legacy?: string }) => row.legacy)).toHaveLength(historical.length);
  expect(migrationProjection(current, date)).toEqual(migrationProjection(source, date));
  expect(financialJournal({ ...current, marks: {}, reserveLog: [] }).entries).toBe(current.accountBook.operations);
  expect(materializeJournal(current)).toBe(current);
  expect(exchangeRevision(current)).toBe(exchangeRevision(source));
  const out = buildExchange(current, date);
  expect(out.status?.week).toMatchObject({ spent: reference.week.spent / 100, left: reference.week.left / 100, cardLeft: reference.balances.life / 100 });
  expect(out.reserve).toBe(source.reserve);
});

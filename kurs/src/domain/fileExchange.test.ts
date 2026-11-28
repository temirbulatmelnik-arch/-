import { describe, expect, it } from 'vitest';
import { EMPTY_BOOK, budgetExpenses, type AccountOperation } from './accounts';
import { eventsBetween } from './calendar';
import { applyExchange, buildExchange, exchangeDigest, exchangeRevision, normalize, parseExchange, prepareExchange, type ExchangeFile, type ExchangeState } from './exchange';
import { PROTOCOL_VERSION } from './sync';

const now = '2026-11-27';
const at = `${now}T09:00:00.000Z`;
const salary = 'inc:salary:2026-11';
const gym = 'fix:gym:2026-11';
const oldExpense = { id: 'old-purchase', date: '2026-01-01', amount: 20.34, source: 'life', category: 'food', createdAt: at } as const;
const rate = { from: '2026-01-01', unit: 1000, positionUnits: 2, rankUnits: 1, seniority: 0, conditions: 0,
  monthlyBonus: 0.2, confidence: 'confirmed' as const };

function state(): ExchangeState {
  return {
    debts: [{ id: 'loan', kind: 'loan', name: 'Учебный долг', short: 'Долг', balance: 3900.73, rate: 0.11, startBalance: 5000,
      order: 1, frozen: true, closed: false, dueDay: 15, rule: { type: 'fixed', amount: 345.67 } }],
    incomes: [{ kind: 'other', name: 'Учебное поступление', day: 5, amount: 400.99 }],
    fixed: [{ id: 'gym', name: 'Зал', day: 8, amount: 333.33, from: '2026-01' }],
    oneOff: [{ key: 'historic', date: '2026-01-01', dateMode: 'exact', kind: 'payment', amount: 44.99, title: 'Историческая строка' }],
    templateFrom: '2026-01', overrides: {}, marks: { [gym]: { done: true, paidDate: '2026-11-08', at, amount: 333.33 } },
    weeklyOverrides: [{ from: '2026-11-23', to: '2026-11-29', amount: 7000 }],
    expenses: [{ ...oldExpense, category: 'groceries' }], closures: {}, plan: null, reserve: 15_000, savings: 0,
    cardBalance: { amount: 330.55, date: now, source: 'statement', includedExpenseIds: [oldExpense.id], at },
    checklist: [{ id: 'review', title: 'Сверить', eventKey: gym }], checks: {}, strategy: [], rules: [],
    accountBook: { ...EMPTY_BOOK, paymentRouting: 'life' }, work: { from: rate.from, rates: [rate] },
    reserveLog: [{ id: 'anchor', date: now, at, amount: 15_000, abs: true, note: 'Сверка' }],
    savingsLog: [], snapshots: [{ month: '2026-11', total: 3900.73 }],
  };
}

function reply(s: ExchangeState, changes: Partial<ExchangeFile>, id = 'test-patch'): ExchangeFile {
  const rev = exchangeRevision(s);
  return { app: 'kurs-exchange', version: 2, protocolVersion: PROTOCOL_VERSION, from: 'chat',
    baseRevision: rev, date: now, exportId: `${now}-${rev}`, patchId: id, ...changes };
}

function apply(s: ExchangeState, file: ExchangeFile): ExchangeState {
  const result = prepareExchange(file, s, now);
  expect(result.errors).toEqual([]);
  return { ...s, ...applyExchange(file, s, now, new Set(result.sections.map(row => row.id)), () => 'new-id') };
}

describe('обмен полным файлом 2.9', () => {
  it('отдаёт финансовые источники и точные значения за пределами короткой выгрузки', () => {
    const s = state();
    const full = buildExchange(s, now);
    expect(full).toMatchObject({ protocolVersion: '2.9', expensesFrom: '2026-01-01', expenses: [s.expenses[0]],
      events: s.oneOff, debts: s.debts, card: s.cardBalance, history: { calendarMarks: s.marks, reserveLog: s.reserveLog, debtSnapshots: s.snapshots } });
    expect(full.calendar?.some(e => e.key === 'fix:gym:2027-12')).toBe(true);
    expect(full.payrollRegister?.regular.length).toBeGreaterThan(0);
    expect(buildExchange(s, now, { short: true })).toMatchObject({ expenses: [], short: true });
    expect(buildExchange(s, now, { short: true }).history).toBeUndefined();
    expect(prepareExchange(full, s, now).patch).toEqual({});
  });

  it('проверяет и применяет одним патчем отпуск, ставку, НДФЛ, лимиты, платёж, расходы и чек-лист', () => {
    const s = state();
    const file = reply(s, {
      work: { rates: [{ from: '2027-01-01', ...Object.fromEntries(Object.entries(rate).filter(([key]) => key !== 'from')), unit: 1500 }],
        vacations: [{ id: 'spring', from: '2027-04-01', to: '2027-04-07', status: 'planned', dailyGross: 500.25, allowance: true }],
        deductions: { '2027-01': 100 }, payDates: { 'inc:advance:2027-02': '2027-02-22' } },
      limits: { weekly: [{ from: '2026-11-23', to: '2026-11-29', delete: true }],
        defaultWeekly: { from: '2026-11-23', amount: 8500.05 }, categories: { groceries: { baseline: 1050.47 } } },
      incomeEdits: [{ kind: 'other', amount: 420.11 }], debts: [{ id: 'loan', rule: { type: 'fixed', amount: 350.01 } }],
      calendar: [{ key: 'fix:gym:2026-12', prepareOn: '2026-12-03' }],
      expenses: [{ id: oldExpense.id, amount: 20.35 }, { id: 'new-purchase', date: now, amount: 44.55, category: 'transport' }],
      checklist: [{ id: 'review', eventKey: '', done: true }, { id: 'vacation-paper', title: 'Сверить отпускные', due: '2027-03' }],
    });
    const parsed = parseExchange('Обновление\n```json\n' + JSON.stringify(file) + '\n```')!;
    const initial = prepareExchange(file, s, now);
    expect(exchangeDigest(file, s, now, initial).some(line => line.startsWith('Неделя'))).toBe(true);
    const after = apply(s, normalize(parsed, s));
    expect(after.work?.rates.at(-1)?.unit).toBe(1500);
    expect(after.work?.vacations?.[0]).toMatchObject({ id: 'spring', dailyGross: 500.25 });
    expect(after.work?.payDates).toMatchObject({ 'inc:advance:2027-02': '2027-02-22' });
    expect(after.weeklyOverrides).toEqual([]);
    expect(after.incomes[0].amount).toBe(420.11);
    expect(after.expenses.map(e => e.amount)).toEqual([20.35, 44.55]);
    expect(after.accountBook?.expenseChanges?.[0]).toMatchObject({ before: { amount: 20.34 }, after: { amount: 20.35 } });
    expect(after.checklist[0].eventKey).toBeUndefined();
    expect(after.checks.review.done).toBe(true);
    expect(after.debts[0].balance).toBe(s.debts[0].balance);
    expect(after.marks).toEqual(s.marks);
    expect(buildExchange(after, now).status?.week).toMatchObject({ limit: 8500.05, spent: 44.55 });
    expect(eventsBetween(after, '2026-12-01', '2026-12-10').find(e => e.key === 'fix:gym:2026-12')?.prepareOn).toBe('2026-12-03');
    expect(prepareExchange(file, after, now)).toEqual({ sections: [], patch: {}, errors: [] });
  });

  it('не применяет часть патча с ошибкой или устаревшей ревизией и не подбирает событие по похожей сумме', () => {
    const s = state();
    const edits = { checklist: [{ id: 'review', done: true }] };
    for (const file of [
      reply(s, { ...edits, baseRevision: 'old' }),
      reply(s, { ...edits, calendar: [{ key: 'missing-key', date: '2026-12-08', amount: 333.33 }] }),
      reply(s, { ...edits, reserve: 100 }),
      reply(s, { ...edits, status: { reserve: 777 } }),
      reply(s, { ...edits, work: { vacations: [{ id: 'incomplete' }] } }),
      reply(s, { ...edits, expenses: [{ id: 'unknown', amount: 1 }] }),
      reply(s, { ...edits, limits: { categories: { groceries: { limit: -50 } } } }),
    ]) {
      expect(prepareExchange(file, s, now).errors.length).toBeGreaterThan(0);
      expect(prepareExchange(file, s, now).patch).toEqual({});
    }
  });

  it('оставляет оплаченную строку календаря при изменении шаблона и даёт исправить старое разовое событие по ключу', () => {
    const s = state();
    const after = apply(s, reply(s, { fixed: [{ id: 'gym', delete: true }], calendar: [{ key: 'historic', amount: 44.98 }] }));
    const past = eventsBetween(after, '2026-01-01', now);
    expect(past.find(e => e.key === gym)?.amount).toBe(333.33);
    expect(past.find(e => e.key === 'historic')?.amount).toBe(44.98);
    expect(eventsBetween(after, '2026-12-01', '2026-12-31').some(e => e.key === 'fix:gym:2026-12')).toBe(false);
    expect(after.marks[gym]).toEqual(s.marks[gym]);
  });

  it('меняет статус закрытия долга вместе со сверенным остатком, без обнуления по одному флагу', () => {
    const s = state();
    const edit = { debts: [{ id: 'loan', closed: true, closedOn: now }] };
    expect(prepareExchange(reply(s, edit), s, now).patch).toEqual({});
    const after = apply(s, reply(s, { ...edit, bankCorrection: [{ key: 'loan', oldValue: s.debts[0].balance, newValue: 0,
      date: now, reason: 'Сверка закрытия', source: 'Справка банка', revision: exchangeRevision(s) }] }));
    expect(after.debts[0]).toMatchObject({ closed: true, balance: 0, closedOn: now, bankBalance: { amount: 0, date: now } });
    expect(after.marks).toEqual(s.marks);
  });

  it('связывает одну выплату с документами, исправляет документальные удержания и классифицирует банковский расход отдельно', () => {
    const original = state();
    const special = 'inc:other:2026-11';
    const receipt: AccountOperation = { id: 'bank-receipt', type: 'income', date: now, amount: 430.32,
      accountId: 'life', status: 'confirmed', origin: 'bank', fundingSource: 'own' };
    const spend: AccountOperation = { id: 'bank-spend', type: 'expense', expenseId: oldExpense.id, date: oldExpense.date,
      amount: oldExpense.amount, accountId: 'life', status: 'confirmed', origin: 'bank', fundingSource: 'own',
      budget: { separate: 0, prepared: 0, weekly: 0, unknown: oldExpense.amount } };
    const s: ExchangeState = { ...original, work: { ...original.work!, actual: {
      [salary]: { asOf: now, net: 230.22, tax: 28, payDate: now },
    } }, accountBook: { ...EMPTY_BOOK, operations: [receipt, spend] } };
    const link = { operationId: receipt.id, reason: 'Банк и два листка',
      parts: [{ key: salary, amount: 230.22 }, { key: special, amount: 200.10 }] };
    const file = reply(s, { work: { actual: { [special]: { asOf: now, net: 200.10, payDate: now } } },
      payrollReceiptLinks: [link], payrollDocumentEdits: [{ key: salary, previous: { tax: 28 }, values: { tax: 29 },
        reason: 'Уточнение удержания', source: 'Листок' }],
      operationEdits: [{ id: spend.id, category: 'health', budgetScope: 'weekly', reason: 'Расход сверён' }],
    });
    const after = apply(s, file);
    expect(after.accountBook?.operations).toHaveLength(2);
    expect(after.accountBook?.operations[0]).toMatchObject({ amount: receipt.amount, payrollParts: link.parts });
    expect(after.work?.actual?.[salary]).toMatchObject({ tax: 29, net: 230.22 });
    expect(after.marks[special]).toMatchObject({ done: true, amount: 200.10 });
    expect(budgetExpenses(after.expenses, after.accountBook!)[0]).toMatchObject({ category: 'health', amount: oldExpense.amount, weeklyAmount: oldExpense.amount });
    expect(prepareExchange(reply(s, { ...file, payrollReceiptLinks: [{ ...link, parts: [link.parts[0]] }] }), s, now).patch).toEqual({});
    expect(prepareExchange(file, after, now).patch).toEqual({});
  });
});

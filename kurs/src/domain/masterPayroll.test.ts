import { describe, expect, it } from 'vitest';
import { EMPTY_BOOK } from './accounts';
import { annualIncome } from './annualIncome';
import { eventsBetween } from './calendar';
import { coverage } from './coverage';
import { applyExchange, buildExchange, exchangeRevision, prepareExchange, type ExchangeFile, type ExchangeState } from './exchange';
import { paymentPreparations } from './funds';
import { possibleSubscriptionDuplicate } from './paymentRoutes';
import { workPayments, type PayrollProfile } from './payroll';
import { payrollRegister } from './payrollRegister';
import type { CalEvent, Expense } from './types';

const today = '2026-11-21';
const rate = { from: '2026-02-01', unit: 2071, positionUnits: 25, rankUnits: 9, seniority: 0.15, conditions: 0.65,
  monthlyBonus: 0.5, confidence: 'confirmed' as const };
const model: PayrollProfile = { from: rate.from, rates: [rate, { ...rate, from: '2027-01-01', unit: 2167, confidence: 'estimate' }],
  accountId: 'life', cautiousUnit2027: 2157 };
const state = (work: PayrollProfile | null = model): ExchangeState => ({
  debts: [], incomes: [], fixed: [], oneOff: [], templateFrom: '2026-01', weeklyOverrides: [], overrides: {}, closures: {},
  marks: {}, plan: null, expenses: [], reserve: 25000, savings: 0, cardBalance: null, checklist: [], checks: {},
  strategy: [], rules: [], work, accountBook: EMPTY_BOOK,
});
const patch = (s: ExchangeState, fields: Partial<ExchangeFile>): ExchangeFile => ({
  app: 'kurs-exchange', version: 2, protocolVersion: '2.8', from: 'chat',
  baseRevision: exchangeRevision(s), patchId: 'fixture-1', ...fields,
});
const apply = (s: ExchangeState, f: ExchangeFile) => ({
  ...s, ...applyExchange(f, s, today, new Set(['work', 'corrections', 'accountBook', 'calendar']), () => 'test-id'),
});

describe('единый регистр и денежный год', () => {
  it('числит 72 номинальных выплаты, переносит только единственную зарплату в прошлый налоговый год', () => {
    const regular = payrollRegister(state({ ...model, payDates: { 'inc:salary:2027-01': '2027-01-11' } }), 2026, 2027, today).regular;
    expect(regular).toHaveLength(72);
    expect(new Set(regular.map(e => e.key)).size).toBe(72);
    expect(regular.find(e => e.key === 'inc:salary:2027-01')).toMatchObject({
      cashYear: 2026, nominalDate: '2027-01-10', expectedPayDate: '2026-12-30', alternatePayDate: '2027-01-11',
    });
    expect(regular.find(e => e.key === 'inc:advance:2026-01')).toMatchObject({ status: 'missing', net: null });
    expect(regular.find(e => e.key === 'inc:advance:2026-11')).toMatchObject({ gross: 50325.30, workDays: 20, firstWorkDays: 9, tax: 6542 });
    expect(regular.find(e => e.key === 'inc:salary:2026-12')).toMatchObject({ gross: 61508.70 });
    expect(regular.find(e => e.key === 'inc:bonusMonthly:2026-12')).toMatchObject({ gross: 25887.50 });
  });

  it('сбрасывает базу ФНС на январской выплате и не считает ноябрьскую базу дважды', () => {
    const work = { ...model, taxBase: { 2026: { asOf: '2026-11-20', base: 2_398_000 } } };
    const paid = workPayments(work, today, '2027-01-31');
    const first = paid.find(p => p.key === 'inc:advance:2026-11')!;
    expect(first.tax).toBe(Math.round(2000 * 0.13 + (first.gross - 2000) * 0.15));
    const december = paid.find(p => p.key === 'inc:salary:2027-01')!;
    const january = paid.find(p => p.key === 'inc:bonusMonthly:2027-01')!;
    expect(Math.abs(december.tax - december.gross * 0.15)).toBeLessThan(1);
    expect(january.tax).toBeCloseTo(january.gross * 0.13, 0);
  });

  it('разделяет расчётный листок, зачисление банка и сценарный доход', () => {
    const key = 'inc:bonusQuarter:2026-10';
    const s = state({ ...model, actual: { [key]: { asOf: today, kind: 'bonusQuarter', net: 11234, payMonth: '2026-10' } } });
    const out = annualIncome(s, 2026, today, 'base');
    expect(out.actual).toBeNull();
    expect(out.documentary).toBe(11234);
    const recorded = annualIncome({ ...s, marks: { [key]: { done: true, at: today, paidDate: '2026-10-24', amount: 11230 } } }, 2026, today, 'base');
    expect(recorded.actual).toBe(11230);
    expect(recorded.documentary).toBe(0);
  });
});

describe('патч с ревизией', () => {
  it('меняет ставку точечно, пересчитывает экспорт и отклоняет устаревший или повторный импорт', () => {
    const s = state();
    const f = patch(s, { work: { rates: [{ effectiveFrom: '2027-01-01', unit: 2249 }] }, status: { totalDebt: 937 } });
    expect(prepareExchange(f, s, today).errors).toEqual([]);
    const after = apply(s, f);
    expect(after.work?.rates[0]).toEqual(s.work!.rates[0]);
    expect(after.work?.rates[1]).toMatchObject({ unit: 2249, positionUnits: 25 });
    const exported = buildExchange(after, today);
    expect(exported.status?.totalDebt).toBe(0);
    expect(exported.payrollRegister?.regular.find(e => e.key === 'inc:bonusMonthly:2027-03')?.gross).toBe(28112.5);
    expect(prepareExchange(f, after, today).patch).toEqual({});
    expect(prepareExchange({ ...f, patchId: 'stale' }, after, today).errors.join(' ')).toContain('Ревизия');
  });

  it('отклоняет весь патч при конфликте с документом и принимает отдельное сверенное исправление', () => {
    const key = 'inc:advance:2026-11';
    const s = state({ ...model, actual: { [key]: { asOf: today, net: 4001 } } });
    const broken = patch(s, { work: { actual: { [key]: { asOf: today, net: 4100 } } }, accountBook: { accounts: [{ id: 'new', name: 'Новый счёт' }] } });
    expect(prepareExchange(broken, s, today).errors.join(' ')).toContain('конфликт');
    expect(apply(s, broken)).toEqual(s);
    const correction = { key, oldValue: 4001, newValue: 4100, reason: 'Новый листок', source: 'Сверка', revision: exchangeRevision(s) };
    const noReason = patch(s, { actualCorrection: [{ ...correction, reason: '' }] });
    expect(prepareExchange(noReason,s,today).errors.length).toBeGreaterThan(0);
    const after = apply(s, patch(s, { actualCorrection: [correction] }));
    expect(after.work?.actual?.[key]?.net).toBe(4100);
    expect(after.marks).toEqual(s.marks);
    expect(after.accountBook).toEqual(s.accountBook);
  });

  it('делает восстановление добавочным, не переносит чужие операции, допускает явное удаление назначения', () => {
    const s = { ...state(null), accountBook: { ...EMPTY_BOOK, paymentAccounts: { 'fixed-example': 'reserve' } } };
    const f = patch(s, { recovery: true, baseRevision: undefined, work: model,
      accountBook: { paymentAccounts: { 'fixed-example': 'life' } }, reserve: 1200 });
    const after = apply(s, f);
    expect(after.work?.rates).toEqual(model.rates);
    expect(after.reserve).toBe(s.reserve);
    expect(after.accountBook?.paymentAccounts['fixed-example']).toBe('reserve');
    const cleanup = patch(after, { patchId: 'cleanup', accountBook: { remove: [{ section: 'paymentAccounts', key: 'fixed-example', delete: true }] } });
    expect(apply(after, cleanup).accountBook?.paymentAccounts).toEqual({});
  });
});

describe('сроки подготовки и прогноз нехватки', () => {
  const payment: CalEvent = { key: 'fix:test:2026-11', kind: 'payment', title: 'VPN', dateMode: 'exact', date: '2026-11-28', amount: 320 };
  it('предупреждает о похожей подписке, не меняя запланированное списание и сумму', () => {
    const e: Expense = { id: 'expense', date: '2026-11-18', amount: 336, category: 'fixed', note: 'VPN test',
      createdAt: '2026-11-18T17:00:00Z', source: 'credit', origin: 'manual' };
    expect(possibleSubscriptionDuplicate(payment, [e])).toBe(e);
    expect(paymentPreparations([payment], {}, [], 5000)[0].toFund).toBeNull();
    expect(paymentPreparations([{ ...payment, date: '2027-01-01' }], {}, [], 5000)[0].remindDate).toBe('2026-12-30');
  });
  it('не добавляет просрочку из старого шаблона поверх более свежей банковской сверки', () => {
    const debt = { id: 'existing', name: 'Обязательство', short: 'Банк', kind: 'card' as const,
      balance: 12000, startBalance: 15000, closed: false, frozen: true, order: 1, dueDay: 17, rate: 0.2,
      rule: { type: 'fixed' as const, amount: 1500 },
      bankBalance: { amount: 12000, date: today } };
    const s = { ...state(null), debts: [debt] };
    expect(eventsBetween(s, '2026-10-01', '2026-12-31').some(event => event.key === 'pay:existing:2026-10')).toBe(false);
    expect(eventsBetween(s, '2026-10-01', '2026-12-31').some(event => event.key === 'pay:existing:2026-12')).toBe(true);
    const marks = { 'pay:existing:2026-10': { done: true, amount: 1500, at: '2026-10-17' } };
    expect(eventsBetween({ ...s, marks }, '2026-10-01', '2026-12-31').some(event => event.key === 'pay:existing:2026-10')).toBe(true);
  });
  it('отделяет сумму первого дефицита от максимума на общем горизонте', () => {
    const s = { ...state(null), oneOff: [{ ...payment, amount: 150, date: '2026-11-21' },
      { ...payment, key: 'next', amount: 200, date: '2026-11-22' }] };
    const input = { reserve: 100, debts: [], expenses: [], marks: {}, cal: s, cash: { life: 0, reserve: 100 } };
    const result = coverage(input, today, 'base', '2026-11-22');
    expect(result.shortage).toMatchObject({ date: today, amount: 50 });
    expect(result.maxShortfall).toBeGreaterThan(50);
    expect(result.paymentFunding?.[0].fromReserve ?? null).toBeNull();
  });
});

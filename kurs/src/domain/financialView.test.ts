import { describe, expect, it } from 'vitest';
import type { AccountOperation } from './accounts';
import { monthDays, type Coverage, type CoverageInput } from './coverage';
import { bankProvenEvents, coverageDayDetails, horizonUnverified, monthEventTotals } from './financialView';
import type { WorkPay } from './payroll';
import type { CalEvent } from './types';

const date = '2026-11-28';
const event = (key: string, amount: number, details: Partial<CalEvent> = {}): CalEvent =>
  ({ key, title: key, amount, date, kind: 'payment', ...details });

describe('Состояния финансового интерфейса', () => {
  it('различает запись и факт, просрочку, предстоящий платёж и условный доход', () => {
    const op: AccountOperation = { id: 'bank:1', status: 'confirmed', amount: 90, eventKey: 'fact', type: 'expense',
      fundingSource: 'own', origin: 'bank', accountId: 'life', date };
    const marked = { done: true, amount: 90 };
    expect(monthEventTotals([
      event('fact', 92), event('manual', 10.2), event('past', 20.05, { date: '2026-11-25' }),
      event('soon', 12.43, { date: '2026-11-30' }), event('review', 8.10, { projection: 'review' }),
      event('bonus', 32, { kind: 'income', projection: 'conditional' }),
      event('salary', 45, { kind: 'income' }),
      event('documented', 32.11, { kind: 'income', payroll: { documented: true } as WorkPay }),
      event('verified', 35.33, { kind: 'income', payroll: { bankConfirmed: true } as WorkPay }),
      event('manual-income', 10, { kind: 'income', payroll: { bankConfirmed: true } as WorkPay }),
      event('loan', 55, { kind: 'income', economicType: 'loan_disbursement' }),
    ], { fact: marked, manual: { done: true, amount: 11.9 } }, bankProvenEvents([
      op, { ...op, origin: 'manual', eventKey: 'manual' }, { ...op, id: 'bank:2', eventKey: 'verified', type: 'income' },
    ]), date))
      .toEqual({ paid: 90, recorded: 11.9, upcoming: 12.43, review: 28.15, incomeBank: 35.33, incomeRecorded: 10, incomeDocumented: 32.11, income: 45, conditional: 32 });
  });

  it('показывает обе стороны кассового дня и сохраняет временный дефицит', () => {
    const cov = {
      from: date, to: date, start: 100, byDay: { [date]: 140 },
      steps: [{ date, delta: -130.15, balance: -30.15 }, { date, delta: 170.15, balance: 140 }],
    } as Coverage;
    expect(coverageDayDetails(cov, date)).toEqual({ start: 100, end: 140, out: 130.15, income: 170.15, low: -30.15 });
    expect(coverageDayDetails(cov, '2026-11-29')).toBeNull();
  });

  it('ставит отметку листка вместо отметки оплаты в месяце до появления банковского факта', () => {
    const doc = event('work:doc', 90, { kind: 'income', payroll: { documented: true } as WorkPay });
    const cov = { from: date, to: date, start: 100, steps: [], byDay: { [date]: 100 } } as Coverage;
    const calendar = monthDays([doc], {}, cov, '2026-11', date);
    expect(calendar.find(day => day.date === date)).toMatchObject({ documented: true, paid: false });
    expect(monthDays([doc], { [doc.key]: { done: true } }, cov, '2026-11', date).find(day => day.date === date))
      .toMatchObject({ paid: true, paidTotal: 90 });
  });

  it('отличает нулевой сверенный остаток от отсутствующей сверки', () => {
    const input = { cash: { life: 0, reserve: 0 } } as CoverageInput;
    expect(horizonUnverified(input)).toBe(false);
    expect(horizonUnverified({ ...input, cash: { life: 0 } })).toBe(true);
    expect(horizonUnverified({ ...input, unresolvedCash: true })).toBe(true);
  });
});

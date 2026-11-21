import { describe, expect, it } from 'vitest';
import { EMPTY_BOOK, type PayoffTerms } from './accounts';
import { safePrepayment, type CoverageInput } from './coverage';
import { forecast } from './forecast';
import { createRepaymentPlanner, type RepaymentResult } from './prepayment';
import type { CalEvent, Debt } from './types';

const today = '2026-11-21';
const march = '2027-03-31';
const makeDebt = (id: string, kind: Debt['kind'], balance: number, amount: number, rate = 0.5): Debt =>
  ({ id, name: id, short: id, kind, balance, rate, rule: { type: 'fixed', amount }, frozen: true,
    startBalance: balance, order: 0, closed: false, dueDay: 10 });
const alfa = makeDebt('alfa-card', 'card', 79000, 8000);
const split = makeDebt('yandex-split', 'split', 200000, 15000);
const pay = (debt: Debt, date: string, amount: number): CalEvent =>
  ({ key: `pay:${debt.id}:${date.slice(0, 7)}`, date, amount, title: debt.name, dateMode: 'exact', kind: 'payment', debtId: debt.id });
const setup = (reserve: number, debts: Debt[], oneOff: CalEvent[], terms: Record<string, PayoffTerms> = {}): CoverageInput => {
  const cal = { debts, oneOff, accountBook: { ...EMPTY_BOOK, paymentRouting: 'life' as const, payoffTerms: terms }, fixed: [],
    weeklyOverrides: [{ from: '2026-01-01', to: '2033-12-31', amount: 0 }], incomes: [], templateFrom: '2033-01' };
  return { cal, marks: {}, expenses: [], reserve, debts, held: [], lifeAvailable: 0, cash: { life: 0, reserve } };
};
const closes = (row: RepaymentResult, ...ids: string[]) => row.actions.length === ids.length &&
  ids.every(id => row.actions.some(action => action.debtId === id && action.mode === 'close'));

describe('расчёт досрочного погашения', () => {
  it('закрывает обе карты только в модели, снимает платежи каждой и сохраняет исходные данные', () => {
    const a = pay(alfa, '2027-04-10', 8000);
    const b = pay(split, '2027-04-11', 15000);
    const input = setup(500000, [alfa, split], [a, b]);
    const before = structuredClone(input);
    const rows = createRepaymentPlanner(input, today).analyze(march, true);
    expect(rows.find(row => closes(row, alfa.id))?.removed.map(e => e.key)).toEqual([a.key]);
    expect(rows.find(row => closes(row, split.id))?.removed.map(e => e.key)).toEqual([b.key]);
    expect(rows.find(row => closes(row, alfa.id, split.id))?.removed.map(e => e.key)).toEqual([a.key, b.key]);
    expect(input).toEqual(before);
  });

  it('частичная досрочка Сплита оставляет ближайший обязательный платёж', () => {
    const a = pay(split, '2027-04-10', 15000);
    const rows = createRepaymentPlanner(setup(500000, [split], [a]), today).analyze(march, true);
    const partial = rows.find(row => row.actions.length === 1 && row.actions[0].mode !== 'close')!;
    expect(partial.removed).toEqual([]);
    expect(partial.horizons[0].minimum.base).toBeCloseTo(500000 - partial.amount - a.amount, 2);
  });

  it('может устранить разрыв, хотя прежняя проверка возвращает ноль', () => {
    const input = setup(50000, [alfa], [pay(alfa, '2026-12-10', 64000)], { [alfa.id]: { closeDate: today, closeAmount: 15000 } });
    expect(safePrepayment(input, today, 'reserve')).toBe(0);
    const rows = createRepaymentPlanner(input, today).analyze(today, true);
    const close = rows.find(row => closes(row, alfa.id))!;
    expect(rows[0].scenarios.cautious.shortage?.amount).toBe(14000);
    expect(close).toMatchObject({ status: 'available', amount: 15000, reserveAfter: { cautious: 35000 },
      scenarios: { cautious: { shortage: null, reserveLow: 35000 } } });
    expect(close.charts.debt.at(-1)).toBe(0);
  });

  it('показывает разрыв, если досрочка раньше ближайшего обязательства', () => {
    const due: CalEvent = { key: 'fix:rent:2026-12', title: 'Жильё', date: '2026-12-01', amount: 35000, kind: 'payment', dateMode: 'exact' };
    const input = setup(60000, [alfa], [due], { [alfa.id]: { closeDate: today, closeAmount: 30000 } });
    const rows = createRepaymentPlanner(input, today).analyze(today, true);
    expect(rows[0].scenarios.cautious.shortage).toBeNull();
    expect(rows.find(row => closes(row, alfa.id))).toMatchObject({
      status: 'unsafe', scenarios: { cautious: { shortage: { date: due.date, amount: 5000 } } },
    });
  });

  it('сравнивает 31 марта с отпускными, без них и без условных годовой и квартальной премий', () => {
    const income = (key: string, amount: number, kind: CalEvent['incomeKind']): CalEvent => ({
      key, amount, kind: 'income', incomeKind: kind, date: march, confidence: 'estimate', title: key, dateMode: 'exact',
    });
    const items = [income('inc:vacation:2027-03', 66000, 'vacation'), income('inc:bonusYear:2027-03', 70000, 'bonusYear'),
      income('inc:bonusQuarter:2027-03', 90000, 'bonusQuarter')];
    const input = setup(75000, [alfa, split], items);
    const withPay = createRepaymentPlanner(input, today).analyze(march, true);
    const noPay = createRepaymentPlanner(input, today, { withoutVacation: true }).analyze(march, true);
    expect(withPay[0].reserveAfter.base).toBe(301000);
    expect(noPay[0].reserveAfter.base).toBe(235000);
    expect(withPay[0].reserveAfter.cautious).toBe(75000);
    expect(withPay.find(row => closes(row, alfa.id, split.id))?.status).not.toBe('available');
  });

  it('считает проценты по кредиту и сравнивает оба подтверждённых режима ВТБ', () => {
    const vtb: Debt = { ...makeDebt('vtb', 'loan', 120000, 14000, 0.2), rule: { type: 'annuity', endDate: '2027-12-10', amount: 14000 } };
    const input = setup(400000, [vtb], [pay(vtb, '2026-12-10', 14000)],
      { vtb: { partialConfirmed: true, loanModes: ['term', 'payment'] } });
    const choices = createRepaymentPlanner(input, today).analyze(today);
    const byTerm = choices.find(row => row.actions[0]?.mode === 'term')!;
    const byPayment = choices.find(row => row.actions[0]?.mode === 'payment' && row.amount === byTerm.amount)!;
    expect(byTerm.savings).toBeTruthy();
    expect(byPayment).toBeTruthy();
    expect(byTerm.charts.cost).not.toEqual(byPayment.charts.cost);
  });

  it('полный календарь больше не отключает досрочную стратегию долгосрочной диаграммы', () => {
    const options = setup(500000, [alfa], [{ key: 'test:salary', date: '2027-03-11', amount: 210000,
      kind: 'income', incomeKind: 'salary', title: 'Зарплата', dateMode: 'exact' }]);
    expect(forecast({ debts: [alfa], incomes: [], reserve: 500000, from: march.slice(0, 7) + '-01', horizon: 1,
      cal: options.cal }).closeMonth[alfa.id]).toBe('2027-03');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { categorize, isNotSpending } from './categorize';
import { eventsBetween, estimatePayment, urgency } from './calendar';
import { addMonths, dayIn, monthsBetween, weekStart } from './dates';
import { forecast } from './forecast';
import { buildIcs } from './ics';
import { rub, parseAmount } from './money';
import { categoryLimit, currentPhase, DEFAULT_PLAN, setPlanSource, splitBonus, targetDebt, weeklyLimit, type PlanConfig } from './plan';
import { fromAi, fromDrafts } from './proposals';
import { cashFlow, dailyTotals } from './cashflow';
import { applyChatPlan, mergeSeed, parseChatPlan, type PlanState } from './planUpdate';
import { parseStatementText, isIncomeLine } from './pdf';
import { weekReport, weekToClose } from './weekly';
import { isWorkday, workdayOnOrBefore } from './workdays';
import { draft } from './statements';
import { parseCsv, parseText } from './statements';
import type { Debt, Expense, PlanSeed } from './types';
import { open, seal } from './vault';

const debt = (p: Partial<Debt>): Debt => ({
  id: 'x', name: 'X', short: 'X', kind: 'card', balance: 100_000, startBalance: 100_000, rate: 0.5, dueDay: 16,
  rule: { type: 'interestPlus', share: 0.02 }, frozen: true, order: 1, closed: false, ...p,
});

// вымышленный план: цифры не совпадают с настоящим (он зашифрован в public/seed.enc.json)
const DEBTS: Debt[] = [
  debt({ id: 'inst', kind: 'installment', balance: 30_000, order: 1, phase: 1, noPrepay: true, rule: { type: 'schedule', items: [{ date: '2026-11-20', amount: 15_000 }, { date: '2026-12-21', amount: 15_000 }] } }),
  debt({ id: 'alfa', balance: 80_000, rate: 0.6, order: 2, phase: 1, dueDay: 2, rule: { type: 'interestPlus', share: 0.03 } }),
  debt({ id: 'split', kind: 'split', balance: 200_000, rate: 0.58, order: 3, phase: 1, dueDay: 1, rule: { type: 'annuity', endDate: '2028-10-01', amount: 15_000 } }),
  debt({ id: 'tbank', balance: 300_000, rate: 0.5, order: 4, phase: 2, rule: { type: 'interestPlus', share: 0.017, min: 600 } }),
  debt({ id: 'sber', balance: 400_000, rate: 0.4, order: 5, phase: 3, dueDay: 'last' }),
  debt({ id: 'loan', kind: 'loan', balance: 1_000_000, rate: 0.3, order: 6, phase: 4, dueDay: 11, frozen: false, rule: { type: 'fixed', amount: 45_000 } }),
];

const phase = (id: 0 | 1 | 2 | 3 | 4, monthly: number, weekly: number, shortfall: number, from: string, to: string) => ({ id, title: `Этап ${id}`, monthly, weekly, shortfall, closes: [], premiums: '', from, to });
const PLAN: PlanConfig = {
  phases: [phase(0, 0, 0, 40_000, '2026-10', '2026-10'), phase(1, 50_000, 10_000, 30_000, '2026-11', '2027-04'), phase(2, 60_000, 12_000, 20_000, '2027-05', '2027-12'), phase(3, 70_000, 14_000, 10_000, '2028-01', '2028-04'), phase(4, 80_000, 16_000, 10_000, '2028-05', '2028-12')],
  categories: { ...DEFAULT_PLAN.categories, groceries: { limit: 10_000, baseline: 12_000 } },
  shortfallOverrides: { '2026-11': 40_000 },
  bonusMonths: [4, 7, 10, 12],
  merchantRules: [['work', ['КАНТИНА']]],
  bonusRules: {
    '2026-11': { targets: [] },
    '2026-12': { targets: ['alfa'], months: 3, full: true },
  },
};
setPlanSource(() => PLAN);

describe('деньги и даты', () => {
  it('формат рублей с неразрывными пробелами', () => {
    expect(rub(12345)).toBe('12 345 ₽');
    expect(rub(-500)).toBe('−500 ₽');
    expect(parseAmount('12 345,50')).toBe(12345.5);
    expect(parseAmount('abc')).toBeNull();
  });
  it('даты', () => {
    expect(weekStart('2026-10-22')).toBe('2026-10-19');
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(dayIn('2026-11', 'last')).toBe('2026-11-30');
    expect(dayIn('2027-02', 31)).toBe('2027-02-28');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(monthsBetween('2026-12', '2027-04')).toBe(4);
  });
});

describe('план', () => {
  it('этап переключается, когда закрыты долги этапа', () => {
    expect(currentPhase(DEBTS, '2026-11-01').id).toBe(1);
    const after = DEBTS.map(d => (d.phase === 1 ? { ...d, closed: true, balance: 0 } : d));
    expect(currentPhase(after, '2027-03-01').id).toBe(2);
    expect(weeklyLimit(after, '2027-03-01', [])).toBe(12_000);
    // лимит категории растёт вместе с бюджетом этапа: (60 000 − 6 400) / (50 000 − 6 400)
    expect(categoryLimit('groceries', currentPhase(after, '2027-03-01'))).toBe(12_300);
  });
  it('особый недельный лимит на период', () => {
    const o = [{ from: '2026-10-19', to: '2026-11-23', amount: 8000 }];
    expect(weeklyLimit(DEBTS, '2026-11-25', o)).toBe(8000); // неделя с 23.11
    expect(weeklyLimit(DEBTS, '2026-11-30', o)).toBe(10_000);
  });
  it('целевой долг — не рассрочка по графику', () => {
    expect(targetDebt(DEBTS)?.id).toBe('alfa');
  });
  it('без решения плана: резерв на 3 месяца, остальное по порядку лавины', () => {
    const s = splitBonus({ amount: 140_000, reserve: 60_000, date: '2027-01-20', debts: DEBTS, monthsOverride: 3 });
    expect(s.months).toEqual(['2027-02', '2027-03', '2027-04']);
    expect(s.keep).toBe(20_000 + 3 * 30_000);
    expect(s.allocations[0].debt.id).toBe('alfa');
    expect(s.allocations[0].amount).toBe(80_000);
    // остаток сверх Альфы — в следующий по порядку долг (Сплит), рассрочку по графику не трогаем
    expect(s.allocations[1]).toMatchObject({ amount: 140_000 + 60_000 - 110_000 - 80_000 });
    expect(s.allocations[1].debt.id).toBe('split');
    expect(s.reserveAfter).toBe(110_000);
  });
  it('решение плана на месяц: ноябрьская — вся в резерв, декабрьская — только Альфа целиком', () => {
    const nov = splitBonus({ amount: 60_000, reserve: 100_000, date: '2026-11-25', debts: DEBTS });
    expect(nov.allocations).toHaveLength(0);
    expect(nov.reserveAfter).toBe(160_000);
    const dec = splitBonus({ amount: 130_000, reserve: 60_000, date: '2026-12-21', debts: DEBTS });
    expect(dec.allocations.map(a => [a.debt.id, a.amount])).toEqual([['alfa', 80_000]]);
    expect(dec.reserveAfter).toBe(110_000); // остальное в резерв, Сплит не трогаем
    const short = splitBonus({ amount: 40_000, reserve: 30_000, date: '2026-12-21', debts: DEBTS });
    expect(short.allocations).toHaveLength(0); // на целиком не хватает — не дробим
  });
  it('премии мало — всё в резерв', () => {
    const s = splitBonus({ amount: 30_000, reserve: 10_000, date: '2027-07-21', debts: DEBTS });
    expect(s.keep).toBe(20_000 + 2 * 30_000);
    expect(s.allocations).toHaveLength(0);
    expect(s.reserveAfter).toBe(40_000);
  });
});

describe('календарь', () => {
  const cal = { debts: DEBTS, incomes: [{ kind: 'salary' as const, name: 'Зарплата', day: 10, amount: 48_648 }], fixed: [{ id: 'tel', name: 'Связь', day: 1, amount: 1000 }], oneOff: [], templateFrom: '2027-01', weeklyOverrides: [] };
  it('шаблон месяца: платежи, поступления, понедельники', () => {
    const ev = eventsBetween(cal, '2027-01-01', '2027-01-31');
    expect(ev.find(e => e.key === 'pay:loan:2027-01')?.date).toBe('2027-01-11');
    expect(ev.find(e => e.key === 'pay:sber:2027-01')?.date).toBe('2027-01-31');
    // зарплата 10.01 выпадает на каникулы и приходит 30.12 — в январе её нет
    expect(ev.find(e => e.key === 'inc:salary:2027-01')).toBeUndefined();
    expect(eventsBetween(cal, '2026-12-28', '2026-12-31').find(e => e.key === 'inc:salary:2027-01')?.date).toBe('2026-12-30');
    expect(ev.filter(e => e.kind === 'weekly')).toHaveLength(4);
    expect(ev.find(e => e.key.startsWith('pay:inst'))).toBeUndefined(); // график рассрочки кончился в декабре
  });
  it('Т-Банк: проценты + 1,7% долга', () => {
    const t = DEBTS.find(d => d.id === 'tbank')!;
    expect(estimatePayment(t, '2027-01')).toBe(Math.round(300_000 * 0.5 / 12 + 300_000 * 0.017));
  });
  it('красным — ≤ 3 дней и просрочка', () => {
    const e = { key: 'k', date: '2026-11-16', dateMode: 'until' as const, kind: 'payment' as const, title: 'Т', amount: 1 };
    expect(urgency(e, undefined, '2026-11-13')).toBe('soon');
    expect(urgency(e, undefined, '2026-11-12')).toBe('later');
    expect(urgency(e, undefined, '2026-11-17')).toBe('overdue');
    expect(urgency(e, { done: true, at: '' }, '2026-11-17')).toBe('done');
  });
});

describe('прогноз', () => {
  it('по плану долги закрываются по порядку и к 2029 году', () => {
    const f = forecast({
      debts: DEBTS, reserve: 100_000, from: '2026-11-01',
      incomes: [
        { kind: 'salary', name: '', day: 10, amount: 120_000 },
        { kind: 'bonusQuarter', name: '', day: 21, amount: 120_000, months: [4, 7, 10, 12] },
        { kind: 'vacation', name: '', day: 3, amount: 150_000, months: [4] },
      ],
    });
    expect(f.freeMonth).not.toBeNull();
    expect(f.freeMonth! <= '2029-06').toBe(true);
    expect(f.closeMonth.alfa).toBe('2026-12'); // декабрьская — Альфа целиком
    expect(f.closeMonth.alfa! <= f.closeMonth.tbank!).toBe(true);
    expect(f.closeMonth.tbank! <= f.closeMonth.loan!).toBe(true);
  });
});

describe('выписки', () => {
  it('категории по продавцу', () => {
    expect(categorize('YANDEX.GO TAXI')).toBe('taxi');
    expect(categorize('BARBERSHOP')).toBe('beauty');
    expect(categorize('BAR KRAFT')).toBe('fun');
    expect(categorize('ПЯТЁРОЧКА 1234')).toBe('groceries');
    expect(categorize('GOLD APPLE')).toBe('beauty');
    expect(categorize('Кантина бизнес-центра')).toBe('work'); // свой шаблон из плана
    expect(isNotSpending('Перевод себе на накопительный')).toBe(true);
  });
  it('CSV Т-Банка', () => {
    const csv = '"Дата операции";"Дата платежа";"Номер карты";"Статус";"Сумма операции";"Валюта операции";"Категория";"MCC";"Описание"\n'
      + '"22.10.2026 14:31:00";"22.10.2026";"*1234";"OK";"-350,00";"RUB";"Такси";"4121";"Яндекс Go"\n'
      + '"21.10.2026 09:00:00";"21.10.2026";"*1234";"OK";"-1 200,50";"RUB";"Супермаркеты";"5411";"Пятёрочка"\n'
      + '"20.10.2026 10:00:00";"20.10.2026";"*1234";"OK";"5000,00";"RUB";"Переводы";"";"Перевод себе"\n';
    const r = parseCsv(csv)!;
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ date: '2026-10-22', amount: 350, category: 'taxi', skip: false });
    expect(r.rows[1]).toMatchObject({ amount: 1200.5, category: 'groceries' });
    expect(r.rows[2].skip).toBe(true);
  });
  it('текст со скриншота (Live Text)', () => {
    const t = 'Сегодня\nЯндекс Go\nТакси\n−412 ₽\nВчера\nПятёрочка\n-1 234,56 ₽\n20 октября\nЗарплата\n+50 000 ₽';
    const r = parseText(t, '2026-10-22');
    expect(r.map(x => [x.date, x.amount])).toEqual([['2026-10-22', 412], ['2026-10-21', 1234.56], ['2026-10-20', 50000]]);
    expect(r[0].category).toBe('taxi');
    expect(r[2].skip).toBe(true);
  });
});

describe('напоминания и шифрование', () => {
  it('ics: событие на весь день и будильники за 3 дня, за день и в день', () => {
    const ics = buildIcs([{ key: 'pay:tbank:2026-11', date: '2026-11-16', dateMode: 'until', kind: 'payment', title: 'Т-Банк', amount: 20_100 }], { hideAmounts: false, remindDays: [3, 1, 0], time: '10:00' });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261116');
    expect(ics).toContain('TRIGGER:-P2DT14H0M');
    expect(ics).toContain('TRIGGER:-PT14H0M');
    expect(ics).toContain('TRIGGER:PT10H0M');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
  });
  it('шифр: открывается кодом и не открывается чужим', async () => {
    const s = await seal('{"a":1}', 'ABCD-EFGH-JKLM', 1000);
    expect(await open(s, 'abcd efgh jklm')).toBe('{"a":1}');
    expect(await open(s, 'ABCD-EFGH-JKLN')).toBeNull();
  });
  it('опубликованный план зашифрован и не содержит сумм открытым текстом', () => {
    const raw = readFileSync(new URL('../../public/seed.enc.json', import.meta.url), 'utf8');
    expect(raw).not.toMatch(/Сбер|tbank|balance|STIL/);
    expect(JSON.parse(raw).v).toBe(1);
  });
});

export type { PlanSeed };

describe('разбор ответа Claude → что обновить', () => {
  const named = DEBTS.map(d => ({ ...d, name: d.id === 'tbank' ? 'Кредитка Т-Банка' : d.id === 'loan' ? 'Кредит ВТБ' : d.id === 'sber' ? 'Кредитка Сбера' : d.name }));
  const ctx = {
    cal: { debts: named, incomes: [{ kind: 'bonusQuarter' as const, name: 'Квартальная премия', day: 21, amount: 120_000, months: [4, 7, 10] }], fixed: [], oneOff: [], templateFrom: '2026-10', weeklyOverrides: [] },
    marks: {}, expenses: [], reserve: 50_000, now: '2027-01-12',
  };
  const empty = { kind: 'other' as const, summary: '', bank: '', transactions: [], debts: [], payments: [], incomes: [], savingsBalance: 0, warnings: [] };

  it('экран кредитки: новый остаток и точный платёж вместо оценки', () => {
    const r = fromAi({ ...empty, kind: 'debt_status', debts: [{ debtId: 'tbank', balance: 290_000, minPayment: 17_500, dueDate: '2027-01-16', limit: 0 }] }, ctx);
    const d = r.items.find(i => i.type === 'debt');
    expect(d).toMatchObject({ on: true, balance: 290_000, minPayment: 17_500 });
    expect(d?.type === 'debt' && d.event?.key).toBe('pay:tbank:2027-01');
  });
  it('история: трата с кредитки, погашение кредита по подписи, перевод себе пропущен', () => {
    const r = fromAi({ ...empty, transactions: [
      { date: '2027-01-11', amount: 900, merchant: 'Кафе', category: 'fun', direction: 'expense', card: 'credit' },
      { date: '2027-01-11', amount: 45_000, merchant: 'Погашение кредита ВТБ', category: 'fun', direction: 'debt_payment', card: 'debit' },
      { date: '2027-01-11', amount: 5_000, merchant: 'Перевод себе', category: 'fun', direction: 'own_transfer', card: 'debit' },
    ] }, ctx);
    expect(r.items.filter(i => i.type === 'tx')).toHaveLength(1);
    expect(r.items.find(i => i.type === 'tx')).toMatchObject({ tx: { source: 'credit' } });
    expect(r.items.find(i => i.type === 'mark')).toMatchObject({ event: { key: 'pay:loan:2027-01' }, amount: 45_000 });
    expect(r.warnings[0]).toMatch(/кредитной/);
  });
});

describe('обязательные платежи по датам и прогноз денег', () => {
  const cal = {
    debts: [], incomes: [{ kind: 'salary' as const, name: 'Зарплата', day: 10, amount: 50_000 }], oneOff: [], templateFrom: '2026-11', weeklyOverrides: [],
    fixed: [
      { id: 'tel', name: 'Связь', day: 8, amount: 1000, from: '2026-11' },
      { id: 'gym', name: 'Спортзал', day: 12, amount: 3000, from: '2026-11' },
      { id: 'sub', name: 'Подписка', day: 22, amount: 2400, from: '2026-10' },
    ],
  };
  it('каждый в свой день и со своего месяца', () => {
    const oct = eventsBetween(cal, '2026-10-01', '2026-10-31').filter(e => e.key.startsWith('fix:'));
    expect(oct.map(e => e.key)).toEqual(['fix:sub:2026-10']);
    const nov = eventsBetween(cal, '2026-11-01', '2026-11-30').filter(e => e.key.startsWith('fix:'));
    expect(nov.map(e => [e.date, e.amount])).toEqual([['2026-11-08', 1000], ['2026-11-12', 3000], ['2026-11-22', 2400]]);
  });
  it('перенос даты вручную: событие уходит в свой новый день, даже в другой месяц', () => {
    const ev = eventsBetween({ ...cal, overrides: { 'fix:sub:2026-11': { date: '2026-12-02', amount: 2500 } } }, '2026-12-01', '2026-12-05');
    expect(ev.find(e => e.key === 'fix:sub:2026-11')).toMatchObject({ date: '2026-12-02', amount: 2500, moved: true });
  });
  it('баланс карты по дням: минимум перед зарплатой', () => {
    const paid = { 'fix:sub:2026-10': { done: true, amount: 2400, at: '' } };
    const f = cashFlow(cal, paid, { amount: 5000, date: '2026-11-01', source: 'manual' }, '2026-11-30');
    // пн 02.11 −10 000 недельного лимита, 08.11 −1 000 связь, пн 09.11 −10 000, 10.11 +50 000 зарплата
    expect(f.byDay['2026-11-02']).toBe(-5000);
    expect(f.byDay['2026-11-08']).toBe(-6000);
    expect(f.byDay['2026-11-10']).toBe(34_000);
    expect(f.min!.balance).toBe(-16_000);
    expect(f.min!.event.date).toBe('2026-11-09');
    // неоплаченная подписка прошлого месяца учитывается как платёж к оплате
    expect(cashFlow(cal, {}, { amount: 5000, date: '2026-11-01', source: 'manual' }, '2026-11-30').points[0]).toMatchObject({ overdue: true, delta: -2400 });
  });
  it('деньги по дням для календаря: карта + резерв, между событиями — как накануне', () => {
    const f = cashFlow(cal, {}, { amount: 5000, date: '2026-11-01', source: 'manual' }, '2026-11-30');
    const t = dailyTotals(f, 20_000, '2026-10-30', '2026-11-11');
    expect(t['2026-10-31']).toBeUndefined(); // до даты баланса прогноза нет
    expect(t['2026-11-01']).toBe(5000 - 2400 + 20_000); // неоплаченная подписка уже вычтена
    expect(t['2026-11-02']).toBe(-7400 + 20_000);
    expect(t['2026-11-05']).toBe(t['2026-11-02']);
    expect(t['2026-11-10']).toBe(-18_400 + 50_000 + 20_000);
    expect(Object.keys(t).at(-1)).toBe('2026-11-11');
  });
});

describe('неделя', () => {
  it('какую неделю закрывать', () => {
    expect(weekToClose('2026-10-25', {})).toBe('2026-10-19'); // вс — текущую
    expect(weekToClose('2026-10-26', {})).toBe('2026-10-19'); // пн — прошлую
    expect(weekToClose('2026-10-26', { '2026-10-19': { monday: '2026-10-19', limit: 0, spent: 0, left: 0, transferred: 0, at: '' } })).toBe('2026-10-26');
    expect(weekToClose('2026-10-22', {})).toBe('2026-10-19');
  });
  it('итог: лимит, траты по категориям, фикс и резерв не считаются', () => {
    const e = (amount: number, category: Expense['category'], source: Expense['source'] = 'life') => ({ id: String(amount), date: '2026-11-03', amount, category, source, createdAt: '' });
    const r = weekReport([e(1000, 'groceries'), e(500, 'taxi'), e(2400, 'fixed'), e(3000, 'health', 'reserve')], DEBTS, [], '2026-11-02');
    expect(r.limit).toBe(10_000);
    expect(r.spent).toBe(1500);
    expect(r.left).toBe(8500);
    expect(r.byCategory.map(c => c.id)).toEqual(['groceries', 'taxi']);
  });
});

describe('выписка PDF (текст)', () => {
  const raw = [
    'Выписка по счёту за период с 26.10.2026 по 01.11.2026',
    'Входящий остаток 12 000,00',
    '26.10.2026 12:31 Оплата Пятёрочка 1234 -1 234,56 RUB',
    '27.10.2026 08:10 YANDEX.GO -412,00',
    '28.10.2026 Заработная плата +48 000,00',
    'по реестру 15',
    '30.10.2026 Погашение кредита ВТБ -44 694,66',
    'Исходящий остаток 13 658,78',
  ].join('\n');
  it('строки, знаки, остаток и конец периода', () => {
    const st = parseStatementText(raw);
    expect(st.lines.map(l => [l.date, l.amount])).toEqual([['2026-10-26', 1234.56], ['2026-10-27', 412], ['2026-10-28', 48000], ['2026-10-30', 44694.66]]);
    expect(st.lines.map(isIncomeLine)).toEqual([false, false, true, false]);
    expect(st.closingBalance).toBe(13658.78);
    expect(st.periodEnd).toBe('2026-11-01');
  });
  it('погашение кредита в выписке отмечает платёж в календаре, а не трату', () => {
    const named = DEBTS.map(d => (d.id === 'loan' ? { ...d, name: 'Кредит ВТБ' } : d));
    const cal = { debts: named, incomes: [], fixed: [], oneOff: [], templateFrom: '2026-10', weeklyOverrides: [] };
    const st = parseStatementText(raw);
    const rows = st.lines.map(l => draft(l.date, l.amount, l.text, { income: isIncomeLine(l) }));
    const r = fromDrafts(rows, { cal, marks: {}, expenses: [], reserve: 0, now: '2026-11-01' }, '', { cardBalance: { amount: st.closingBalance!, date: st.periodEnd! } });
    expect(r.items.find(i => i.type === 'mark')).toMatchObject({ event: { key: 'pay:loan:2026-11' }, amount: 44694.66 });
    expect(r.items.filter(i => i.type === 'tx' && i.on).map(i => i.type === 'tx' && i.tx.category)).toEqual(['groceries', 'taxi']);
    expect(r.items.find(i => i.type === 'card')).toMatchObject({ balance: 13658.78, date: '2026-11-01' });
  });
});

describe('обмен с чатом и обновление плана', () => {
  const state: PlanState = {
    debts: DEBTS, incomes: [], fixed: [], oneOff: [], templateFrom: '2027-01', weeklyOverrides: [], planTrajectory: [], baselineTrajectory: [],
    plan: PLAN, marks: { a: { done: true, at: '' } }, overrides: {}, checklist: [{ id: 'x', title: 'Старое' }], strategy: [], rules: [], reserve: 100_000,
  };
  it('находит JSON в ответе чата и применяет только присланное', () => {
    const answer = 'Вот обновление:\n```json\n{"app":"kurs-plan","version":1,"checklist":[{"id":"y","title":"Новое","due":"2027-01-31"}],"debts":[{"id":"tbank","balance":280000}],"payments":[{"debtId":"sber","month":"2027-01","amount":19000,"date":"2027-01-29"}],"bonusRules":{"2027-04":{"targets":["split"]}}}\n```\nУдачи!';
    const p = parseChatPlan(answer)!;
    expect(p.app).toBe('kurs-plan');
    const patch = applyChatPlan(p, state);
    expect(patch.checklist).toEqual([{ id: 'y', title: 'Новое', due: '2027-01-31' }]);
    expect(patch.debts!.find(d => d.id === 'tbank')!.balance).toBe(280_000);
    expect(patch.debts!.find(d => d.id === 'sber')!.balance).toBe(400_000);
    expect(patch.overrides!['pay:sber:2027-01']).toEqual({ amount: 19_000, date: '2027-01-29' });
    expect(patch.plan!.bonusRules!['2026-12']).toBeTruthy(); // старые решения сохранились
    expect(patch.plan!.bonusRules!['2027-04']).toEqual({ targets: ['split'] });
    expect(patch.marks).toBeUndefined();
    expect(parseChatPlan('просто текст')).toBeNull();
  });
  it('новая редакция плана: остатки и отметки с телефона остаются', () => {
    const local = { ...state, debts: DEBTS.map(d => (d.id === 'alfa' ? { ...d, balance: 70_000 } : d)) };
    const seed = { asOf: '2026-10-22', debts: DEBTS.map(d => (d.id === 'alfa' ? { ...d, note: 'новая заметка' } : d)), incomes: [], fixed: [{ id: 'tel', name: 'Связь', day: 8, amount: 1000 }], oneOff: [], templateFrom: '2027-01', reserve: 0, plan: PLAN, weeklyOverrides: [], planTrajectory: [], baselineTrajectory: [], marks: { b: { done: true, at: '' } }, checklist: [{ id: 'z', title: 'Из аудита' }] };
    const m = mergeSeed(local, seed);
    const alfa = m.debts!.find(d => d.id === 'alfa')!;
    expect(alfa.balance).toBe(70_000);
    expect(alfa.note).toBe('новая заметка');
    expect(Object.keys(m.marks!).sort()).toEqual(['a', 'b']);
    expect(m.fixed).toHaveLength(1);
    expect(m.checklist![0].id).toBe('z');
  });
});

describe('рабочие дни', () => {
  it('выходные и праздники 2026 года', () => {
    expect(workdayOnOrBefore('2026-10-25')).toBe('2026-10-23'); // аванс в воскресенье — в пятницу
    expect(workdayOnOrBefore('2026-11-15')).toBe('2026-11-13');
    expect(workdayOnOrBefore('2026-11-04')).toBe('2026-11-03'); // День народного единства
    expect(workdayOnOrBefore('2027-01-10')).toBe('2026-12-30'); // январская зарплата — в декабре: 31.12 выходной
    expect(isWorkday('2026-10-23')).toBe(true);
    expect(isWorkday('2026-03-09')).toBe(false); // перенос с 8 марта
  });
  it('поступления в календаре сдвигаются, платежи — нет', () => {
    const cal = { debts: [], incomes: [{ kind: 'advance' as const, name: 'Аванс', day: 25, amount: 1 }], fixed: [{ id: 'f', name: 'Связь', day: 25, amount: 1 }], oneOff: [], templateFrom: '2026-10', weeklyOverrides: [] };
    const ev = eventsBetween(cal, '2026-10-20', '2026-10-31');
    expect(ev.find(e => e.key === 'inc:advance:2026-10')).toMatchObject({ date: '2026-10-23', planned: '2026-10-25' });
    expect(ev.find(e => e.key === 'fix:f:2026-10')!.date).toBe('2026-10-25');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { categorize, fixDefaultCategories, isNotSpending } from './categorize';
import { eventsBetween, estimatePayment, paidOn, urgency } from './calendar';
import { addMonths, dayIn, monthsBetween, weekStart } from './dates';
import { forecast } from './forecast';
import { buildIcs } from './ics';
import { rub, parseAmount } from './money';
import { categoryLimit, currentPhase, DEFAULT_PLAN, setPlanSource, splitBonus, targetDebt, weeklyLimit, type PlanConfig } from './plan';
import { fromAi, fromDrafts } from './proposals';
import { PROTOCOL_VERSION } from './sync';
import { accruedOnCard, cardOn, checkupPlan, heldKeys, ledger, transferPlan, type Checkup, type LedgerInput } from './ledger';
import { mergeSeed, type PlanState } from './planUpdate';
import { applyExchange, buildExchange, dropChatTwins, exchangeDigest, normalize, parseExchange, previewExchange, type ExchangeState } from './exchange';
import { parseStatementText, isIncomeLine } from './pdf';
import { weekReport, weekToClose } from './weekly';
import { dayBudget, weekSummary } from './summary';
import { bridgeState, weekMoney, weekParts, type Bridge } from './bridge';
import { bySource, spendEffect, suggestSource } from './sources';
import { quickSpends, yesterdaySet } from './quick';
import { guessCategory, parseSpoken } from './spoken';
import { isWorkday, workdayOnOrBefore } from './workdays';
import { draft } from './statements';
import { parseCsv, parseText } from './statements';
import type { CalEvent, Debt, EventMark, Expense, PlanSeed } from './types';
import { coverage, coverageHints, coverageInput, monthDays } from './coverage';
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
  it('шаблон месяца: платежи, поступления, воскресные пополнения', () => {
    const ev = eventsBetween(cal, '2027-01-01', '2027-01-31');
    expect(ev.find(e => e.key === 'pay:loan:2027-01')?.date).toBe('2027-01-11');
    expect(ev.find(e => e.key === 'pay:sber:2027-01')?.date).toBe('2027-01-31');
    // зарплата 10.01 выпадает на каникулы и приходит 30.12 — в январе её нет
    expect(ev.find(e => e.key === 'inc:salary:2027-01')).toBeUndefined();
    expect(eventsBetween(cal, '2026-12-28', '2026-12-31').find(e => e.key === 'inc:salary:2027-01')?.date).toBe('2026-12-30');
    // карту жизни доливаем в воскресенье вечером — ключ по понедельнику недели, на которую пополнение
    expect(ev.filter(e => e.kind === 'weekly').map(e => e.date)).toEqual(['2027-01-03', '2027-01-10', '2027-01-17', '2027-01-24', '2027-01-31']);
    expect(ev.find(e => e.date === '2027-01-03' && e.kind === 'weekly')!.key).toBe('wk:2027-01-04');
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
  const input = (c: typeof cal & { bridge?: Bridge | null }, marks: Record<string, EventMark>) => ({ cal: c, marks, reserve: 20_000, debts: [], expenses: [], bridge: c.bridge ?? null });
  const nov = (c: typeof cal, marks: Record<string, EventMark>) => {
    const cov = coverage(input(c, marks), '2026-11-01');
    return { cov, days: monthDays(eventsBetween(c, '2026-11-01', '2026-11-30'), marks, cov, '2026-11', '2026-11-01') };
  };

  it('остаток дня в календаре — резерв к вечеру по прогнозу покрытия: самопроверка по каждому дню', () => {
    // пополнение карты в воскресенье 01.11 уже сделано — иначе оно стоит в прогнозе сегодняшним днём (тест ниже)
    const paid = { 'fix:sub:2026-10': { done: true, amount: 2400, at: '' }, 'wk:2026-11-02': { done: true, amount: 0, at: '' } };
    const { cov, days } = nov(cal, paid);
    // самопроверка: остаток каждого дня = остаток прогноза после последнего события в этот день или раньше
    let expected = cov.start;
    for (const d of days) {
      for (const st of cov.steps) if (st.date === d.date) expected = st.balance;
      expect(d.total).toBe(expected);
    }
    const top = eventsBetween(cal, '2026-11-08', '2026-11-08').find(e => e.key === 'wk:2026-11-09')!.amount;
    expect(days[1].total).toBe(20_000); // 02.11 — событий нет
    expect(days[7]).toMatchObject({ total: 20_000 - 1000 - top, sum: -1000 - top }); // 08.11: связь и пополнение карты
    expect(days[9]).toMatchObject({ total: 20_000 - 1000 - top + 50_000, sum: 50_000 }); // 10.11: зарплата
    // прошедшие дни: прогноза назад нет
    const oct = monthDays(eventsBetween(cal, '2026-10-01', '2026-10-31'), paid, cov, '2026-10', '2026-11-01');
    expect(oct.every(d => d.total === null)).toBe(true);
    // неоплаченная подписка прошлого месяца — к оплате сегодня
    expect(nov(cal, {}).cov.steps.find(st => st.key === 'fix:sub:2026-10')).toMatchObject({ date: '2026-11-01', delta: -2400 });
  });

  it('оплаченное заранее не уменьшает ни сумму будущего дня, ни остаток; день оплаты — день отметки', () => {
    const gift = { key: 'gift', date: '2026-11-18', dateMode: 'until' as const, kind: 'payment' as const, title: 'Подарок', amount: 7500 };
    const marks = { gift: { done: true, amount: 7500, at: '2026-10-27T10:00:00.000Z' } };
    const without = nov(cal, {}).days;
    const withGift = nov({ ...cal, oneOff: [gift] }, marks).days;
    expect(withGift.map(d => d.total)).toEqual(without.map(d => d.total));
    expect(withGift[17]).toMatchObject({ sum: 0, paid: true, paidTotal: 7500 });
    expect(paidOn(gift, marks.gift)).toBe('2026-10-27');
    expect(paidOn(gift, { ...marks.gift, paidDate: '2026-10-28' })).toBe('2026-10-28');
    expect(paidOn({ date: '2026-10-20' }, { at: '2026-10-27T10:00:00.000Z' })).toBe('2026-10-20');
  });

  it('сегодняшнее и прошедшее неотмеченное — в прогнозе сегодняшним днём; отмеченное — в резерве, остатки те же', () => {
    const pay = (key: string, date: string, amount: number) => ({ key, date, dateMode: 'exact' as const, kind: 'payment' as const, title: key, amount });
    const base = { 'fix:sub:2026-10': { done: true, amount: 2400, at: '' }, 'wk:2026-11-02': { done: true, amount: 0, at: '' } };
    const run = (c: typeof cal, marks: Record<string, EventMark>, reserve: number, now: string) => {
      const cov = coverage({ cal: c, marks, reserve, debts: [], expenses: [], bridge: null }, now);
      return monthDays(eventsBetween(c, '2026-11-01', '2026-11-30'), marks, cov, '2026-11', now).filter(d => d.date >= now).map(d => d.total);
    };
    // 1. платёж на сегодня 1 000, не отмечен: сегодня и дальше на 1 000 меньше
    const without = run(cal, base, 20_000, '2026-11-05');
    const today = { ...cal, oneOff: [pay('p', '2026-11-05', 1000)] };
    expect(run(today, base, 20_000, '2026-11-05')).toEqual(without.map(t => t! - 1000));
    // 2. отметили (оплачен из резерва): резерв −1 000, событие ушло из прогноза — остатки те же
    expect(run(today, { ...base, p: { done: true, amount: 1000, paidFrom: 'reserve', at: '' } }, 19_000, '2026-11-05')).toEqual(without.map(t => t! - 1000));
    // 3. воскресенье до сверки: сегодняшнее пополнение карты в прогнозе; после отметки и сверки — те же остатки
    const top = eventsBetween(cal, '2026-11-08', '2026-11-08').find(e => e.key === 'wk:2026-11-09')!.amount;
    const sun = run(cal, base, 20_000, '2026-11-08');
    expect(sun[0]).toBe(20_000 - 1000 - top);
    expect(run(cal, { ...base, 'wk:2026-11-09': { done: true, amount: top, at: '' } }, 20_000 - top, '2026-11-08')).toEqual(sun);
    // 4. вчерашний платёж не отмечен — входит сегодняшним днём
    const cov = coverage({ cal: { ...cal, oneOff: [pay('y', '2026-11-04', 500)] }, marks: base, reserve: 20_000, debts: [], expenses: [], bridge: null }, '2026-11-05');
    expect(cov.steps.find(st => st.key === 'y')).toMatchObject({ date: '2026-11-05', delta: -500 });
  });

  it('неделя моста: из резерва уходит только воскресное пополнение fromReserve, траты с кредитки — нет', () => {
    const bridge: Bridge = { card: 'card-x', cap: 30_000, weeks: [{ monday: '2026-11-09', fromReserve: 4000, fromCredit: 4000 }] };
    const { cov, days } = nov({ ...cal, bridge } as typeof cal, { 'fix:sub:2026-10': { done: true, amount: 2400, at: '' }, 'wk:2026-11-02': { done: true, amount: 0, at: '' } });
    expect(cov.steps.find(s => s.key === 'wk:2026-11-09')!.delta).toBe(-4000);
    expect(days[7].total).toBe(20_000 - 1000 - 4000);
  });
});

describe('неделя', () => {
  it('воскресное пополнение: лимит следующей недели минус остаток на карте', () => {
    const exp = (date: string, amount: number): Expense => ({ id: date + amount, date, amount, category: 'groceries', source: 'life', createdAt: '' });
    const ov = [{ from: '2026-11-09', to: '2026-11-15', amount: 8000 }, { from: '2026-11-16', to: '2026-11-22', amount: 9000 }];
    // лимит 8 000, потрачено 2 260 → на карте 5 740, долить 2 260
    expect(weekReport([exp('2026-11-10', 2260)], DEBTS, ov, '2026-11-09')).toMatchObject({ limit: 8000, leftover: 5740, nextLimit: 9000, topUp: 9000 - 5740 });
    // ничего не осталось — долить весь лимит; перерасход не уменьшает пополнение
    expect(weekReport([exp('2026-11-10', 8000)], DEBTS, ov, '2026-11-09')).toMatchObject({ leftover: 0, topUp: 9000 });
    expect(weekReport([exp('2026-11-10', 9500)], DEBTS, ov, '2026-11-09')).toMatchObject({ left: -1500, leftover: 0, topUp: 9000 });
  });
  it('кольцо дня: лимит на сегодня, перерасход и пересчёт на завтра', () => {
    const exp = (date: string, amount: number, source: Expense['source'] = 'life'): Expense => ({ id: date + amount, date, amount, category: 'groceries', source, createdAt: '' });
    const ov = [{ from: '2026-11-09', to: '2026-11-15', amount: 8000 }, { from: '2026-11-16', to: '2026-11-22', amount: 9000 }];
    // понедельник: 8 000 на 7 дней → 1 140 на сегодня
    expect(dayBudget([exp('2026-11-09', 760)], DEBTS, ov, '2026-11-09')).toMatchObject({ day: 1140, spentToday: 760, left: 380, nextWeek: false });
    // перерасход 220 → с завтра (8 000 − 1 360) / 6 = 1 100
    expect(dayBudget([exp('2026-11-09', 1360)], DEBTS, ov, '2026-11-09')).toMatchObject({ left: -220, tomorrow: 1100 });
    // вторник: вчерашние траты уменьшают утренний остаток, траты из резерва не считаются
    expect(dayBudget([exp('2026-11-09', 1360), exp('2026-11-10', 500, 'reserve')], DEBTS, ov, '2026-11-10')).toMatchObject({ day: 1100, spentToday: 0, left: 1100 });
    // воскресенье: завтра — новая неделя со своим лимитом
    expect(dayBudget([exp('2026-11-15', 300)], DEBTS, ov, '2026-11-15')).toMatchObject({ nextWeek: true, tomorrow: 1280 });
    // неделя кончилась раньше — на сегодня ноль
    expect(dayBudget([exp('2026-11-10', 8200), exp('2026-11-12', 100)], DEBTS, ov, '2026-11-12')).toMatchObject({ day: 0, left: -100, exhausted: true, tomorrow: 0 });
  });
  it('остаток недели совпадает с картой жизни: связь с карты тоже в лимите, анализы из резерва — нет', () => {
    const exp = (date: string, amount: number, category: Expense['category'], source: Expense['source'] = 'life'): Expense => ({ id: date + amount + category, date, amount, category, source, createdAt: '' });
    const ov = [{ from: '2026-11-09', to: '2026-11-15', amount: 8000 }];
    const list = [exp('2026-11-09', 1382.96, 'groceries'), exp('2026-11-10', 893, 'transport'), exp('2026-11-10', 50, 'fixed'), exp('2026-11-10', 8737, 'health', 'reserve')];
    expect(weekSummary(list, DEBTS, ov, '2026-11-10').left).toBeCloseTo(5674.04, 2);
    expect(dayBudget(list, DEBTS, ov, '2026-11-10').spentToday).toBe(943);
  });
  it('подписи банка: «Транспорт», «Супермаркеты»; разовая правка категорий из выписок', () => {
    expect(categorize('Транспорт · Транспорт')).toBe('transport');
    expect(categorize('Іранспорт')).toBe('transport');
    expect(categorize('MAGAZIN MURINO · Супермаркеты')).toBe('groceries');
    const e = (note: string, origin: Expense['origin'], category: Expense['category'] = 'fun'): Expense => ({ id: note + origin, date: '2026-10-26', amount: 95, category, note, source: 'life', origin, createdAt: '' });
    expect(fixDefaultCategories([e('Транспорт · Транспорт', 'text'), e('Транспорт', 'manual'), e('Транспорт', 'chat'), e('Cofix', 'text'), e('Метро', 'ai', 'transport')]).map(x => x.category))
      .toEqual(['transport', 'fun', 'fun', 'fun', 'transport']);
  });
  it('какую неделю закрывать', () => {
    expect(weekToClose('2026-10-25', {})).toBe('2026-10-19'); // вс — текущую
    expect(weekToClose('2026-10-26', {})).toBe('2026-10-19'); // пн — прошлую
    expect(weekToClose('2026-10-26', { '2026-10-19': { monday: '2026-10-19', limit: 0, spent: 0, left: 0, transferred: 0, at: '' } })).toBe('2026-10-26');
    expect(weekToClose('2026-10-22', {})).toBe('2026-10-19');
  });
  it('итог: всё с карты жизни в лимите, даже обязательные; из резерва — нет', () => {
    const e = (amount: number, category: Expense['category'], source: Expense['source'] = 'life') => ({ id: String(amount), date: '2026-11-03', amount, category, source, createdAt: '' });
    const r = weekReport([e(1000, 'groceries'), e(500, 'taxi'), e(2400, 'fixed'), e(3000, 'health', 'reserve')], DEBTS, [], '2026-11-02');
    expect(r.limit).toBe(10_000);
    expect(r.spent).toBe(3900);
    expect(r.left).toBe(6100);
    expect(r.byCategory.map(c => c.id)).toEqual(['fixed', 'groceries', 'taxi']);
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

describe('новая редакция плана', () => {
  const state: PlanState = {
    debts: DEBTS, incomes: [], fixed: [], oneOff: [], templateFrom: '2027-01', weeklyOverrides: [], planTrajectory: [], baselineTrajectory: [],
    plan: PLAN, marks: { a: { done: true, at: '' } }, overrides: {}, checklist: [{ id: 'x', title: 'Старое' }], strategy: [], rules: [], reserve: 100_000,
  };
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

  it('лимит кредитки, указанный на телефоне, обновление плана не перетирает', () => {
    const local = { ...state, debts: DEBTS.map(d => (d.id === 'alfa' ? { ...d, limit: 120_000 } : d)) };
    const seed = { asOf: '2026-10-22', debts: DEBTS.map(d => (d.id === 'alfa' ? { ...d, limit: undefined } : d)), incomes: [], fixed: [], oneOff: [], templateFrom: '2027-01', reserve: 0, plan: PLAN, weeklyOverrides: [], planTrajectory: [], baselineTrajectory: [] };
    expect(mergeSeed(local, seed).debts!.find(d => d.id === 'alfa')!.limit).toBe(120_000);
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

describe('файл обмена с чатом', () => {
  const NOW = '2026-11-04';
  const base: ExchangeState = {
    debts: DEBTS, incomes: [{ kind: 'salary', name: 'Зарплата', day: 10, amount: 50_000 }],
    fixed: [{ id: 'tel', name: 'Связь', day: 8, amount: 1000 }, { id: 'gym', name: 'Спортзал', day: 12, amount: 3000 }],
    oneOff: [{ key: 'gift', date: '2026-11-16', dateMode: 'exact', kind: 'payment', title: 'Подарок', amount: 15_000 }],
    templateFrom: '2026-11', weeklyOverrides: [], overrides: {}, marks: {}, plan: PLAN,
    expenses: [
      { id: 'e1', date: '2026-11-02', amount: 450, category: 'taxi', note: 'Такси', source: 'life', createdAt: '' },
      { id: 'e2', date: '2026-11-03', amount: 600, category: 'fun', note: 'Кафе', source: 'life', createdAt: '' },
    ],
    reserve: 100_000, savings: 0, cardBalance: { amount: 5000, date: '2026-11-01', source: 'manual' },
    checklist: [{ id: 'acc', title: 'Открыть счёт' }], checks: {}, strategy: [{ title: 'Суть', text: 'Текст' }], rules: ['Правило'], closures: {},
  };
  let n = 0;
  const id = () => `new${++n}`;

  it('выгрузка и тот же файл обратно — ничего не меняется', () => {
    const file = buildExchange(base, NOW);
    expect(file.expenses!.map(e => e.id)).toEqual(['e1', 'e2']);
    expect(file.calendar!.some(e => e.key === 'fix:tel:2026-11')).toBe(true);
    expect(previewExchange(normalize(parseExchange(JSON.stringify(file))!, base), base, NOW)).toEqual([]);
  });

  it('ответ чата: лимиты, обязательные, траты, отметки, долги, резерв, чек-лист', () => {
    const answer = 'Меняем:\n```json\n' + JSON.stringify({
      app: 'kurs-exchange', version: 2, from: 'chat', summary: 'Сверка недели',
      limits: { weekly: [{ from: '2026-11-09', to: '2026-11-15', amount: 9000 }], phases: [{ id: 1, weekly: 11_000 }], categories: { groceries: { limit: 9000 } } },
      fixed: [{ id: 'tel', amount: 1100 }, { id: 'gym', delete: true }, { id: 'music', name: 'Музыка', day: 20, amount: 300 }],
      expenses: [
        { date: '2026-11-02', amount: 450, category: 'taxi', note: 'Такси' },
        { date: '2026-11-03', amount: 1234.5, category: 'groceries', note: 'Пятёрочка' },
        { id: 'e1', amount: 500 },
        { id: 'e2', delete: true },
      ],
      calendar: [{ key: 'fix:tel:2026-11', done: true, paid: 1100 }, { key: 'pay:tbank:2026-11', amount: 18_000 }],
      events: [{ key: 'gift', amount: 20_000 }, { date: '2026-11-25', title: 'Вернули долг', amount: 3000, kind: 'income' }],
      debts: [{ id: 'alfa', balance: 70_000 }],
      reserve: 95_000, savings: 2500,
      checklist: [{ id: 'acc', done: true }, { id: 'ins', title: 'Отказаться от страховки', due: '2026-11-30' }],
    }) + '\n```';
    const f = normalize(parseExchange(answer)!, base);
    const sections = previewExchange(f, base, NOW);
    expect(sections.map(s => s.id)).toEqual(['limits', 'fixed', 'debts', 'events', 'calendar', 'expenses', 'money', 'checklist']);
    expect(sections.find(s => s.id === 'expenses')!.lines[0]).toMatch(/^Уже есть/);
    const patch = applyExchange(f, base, NOW, new Set(sections.map(s => s.id)), id);
    expect(patch.weeklyOverrides).toEqual([{ from: '2026-11-09', to: '2026-11-15', amount: 9000 }]);
    expect(patch.plan!.phases.find(x => x.id === 1)!.weekly).toBe(11_000);
    expect(patch.plan!.categories.groceries.limit).toBe(9000);
    expect(patch.plan!.bonusRules).toEqual(PLAN.bonusRules);
    expect(patch.fixed!.map(x => [x.id, x.amount])).toEqual([['tel', 1100], ['music', 300]]);
    expect(patch.expenses!.map(e => [e.date, e.amount, e.category])).toEqual([['2026-11-02', 500, 'taxi'], ['2026-11-03', 1234.5, 'groceries']]);
    expect(patch.marks!['fix:tel:2026-11']).toMatchObject({ done: true, amount: 1100 });
    expect(patch.overrides!['pay:tbank:2026-11']).toEqual({ amount: 18_000 });
    expect(patch.oneOff!.find(e => e.key === 'gift')!.amount).toBe(20_000);
    expect(patch.oneOff!.some(e => e.kind === 'income' && e.amount === 3000)).toBe(true);
    expect(patch.debts!.find(d => d.id === 'alfa')!.balance).toBe(70_000);
    expect([patch.reserve, patch.savings]).toEqual([95_000, 2500]);
    expect(patch.checks!.acc.done).toBe(true);
    expect(patch.checklist!.map(c => c.id)).toEqual(['acc', 'ins']);
  });

  it('поправленное в приложении уходит в чат: дальние точные суммы и даты, отметки — и возвращается без изменений', () => {
    const s2: ExchangeState = { ...base, overrides: { 'pay:tbank:2027-03': { amount: 17_000, date: '2027-03-14' } }, marks: { 'fix:tel:2026-11': { done: true, amount: 1000, at: '' } } };
    const file = buildExchange(s2, NOW);
    expect(file.calendar!.find(e => e.key === 'pay:tbank:2027-03')).toMatchObject({ amount: 17_000, date: '2027-03-14', exact: true });
    expect(file.calendar!.find(e => e.key === 'fix:tel:2026-11')).toMatchObject({ done: true, paid: 1000 });
    expect(previewExchange(normalize(parseExchange(JSON.stringify(file))!, s2), s2, NOW)).toEqual([]);
  });

  it('отметка в календаре без key: по названию и дате', () => {
    const f = normalize(parseExchange(JSON.stringify({ app: 'kurs-exchange', version: 2, calendar: [
      { title: 'Подарок', date: '2026-11-15', done: true, paid: 15_000 },
      { title: 'Чего нет в плане', date: '2026-11-15', done: true },
    ] }))!, base);
    const sections = previewExchange(f, base, NOW);
    expect(sections[0].lines.map(l => l.replace(/\s/g, ' '))).toEqual(['Подарок 16.11: оплачено 15 000 ₽ (04.11)', 'Не нашёл в календаре: Чего нет в плане 15.11, пропускаю']);
    const patch = applyExchange(f, base, NOW, new Set(['calendar']), id);
    expect(patch.marks!.gift).toMatchObject({ done: true, amount: 15_000 });
  });

  it('дата оплаты: из чата — paidDate, без неё — день импорта; в выгрузке — paidDate', () => {
    const f = normalize(parseExchange(JSON.stringify({ app: 'kurs-exchange', version: 2, calendar: [
      { key: 'gift', done: true, paid: 15_000, paidDate: '2026-10-27' },
      { key: 'fix:tel:2026-11', done: true, paid: 1000 },
    ] }))!, base);
    const patch = applyExchange(f, base, NOW, new Set(['calendar']), id);
    expect(patch.marks!.gift).toMatchObject({ done: true, paidDate: '2026-10-27' });
    expect(patch.marks!['fix:tel:2026-11']).toMatchObject({ done: true, paidDate: NOW });
    const s2 = { ...base, marks: patch.marks! };
    const out = buildExchange(s2, NOW);
    expect(out.calendar!.find(e => e.key === 'gift')).toMatchObject({ done: true, paidDate: '2026-10-27' });
    expect(previewExchange(normalize(parseExchange(JSON.stringify(out))!, s2), s2, NOW)).toEqual([]);
  });

  it('status.coverage и остаток дня в календаре — одно и то же', () => {
    const s: ExchangeState = { ...base, reserve: 6000 };
    const out = buildExchange(s, NOW);
    const led = ledger({ checkups: [], cardBalance: s.cardBalance, reserve: s.reserve, reserveLog: [], marks: s.marks, expenses: s.expenses, oneOff: s.oneOff, debts: s.debts, bridge: null });
    const cov = coverage(coverageInput(s, led), NOW);
    const narrow = out.status!.coverage!.narrow!;
    expect(narrow.length).toBeGreaterThan(0);
    for (const n of narrow) {
      const m = n.date.slice(0, 7);
      const day = monthDays(eventsBetween(s, `${m}-01`, `${m}-31`), s.marks, cov, m, NOW).find(d => d.date === n.date)!;
      expect(Math.round(day.total!)).toBe(n.left);
    }
  });

  it('трата из чата, уже внесённая под другим названием и категорией, — повтор; две одинаковые поездки — нет', () => {
    const s0: ExchangeState = { ...base, expenses: [
      { id: 'm1', date: '2026-11-03', amount: 420, category: 'fun', note: 'VKUSNO I TOCHKA', source: 'life', createdAt: '' },
      { id: 'm2', date: '2026-11-03', amount: 95, category: 'taxi', source: 'life', createdAt: '' },
    ] };
    const f = normalize(parseExchange(JSON.stringify({ app: 'kurs-exchange', version: 2, expenses: [
      { date: '2026-11-03', amount: 420, category: 'work', note: 'Фастфуд, обед' },
      { date: '2026-11-03', amount: 95, category: 'transport', note: 'Метро' },
      { date: '2026-11-03', amount: 95, category: 'transport', note: 'Метро' },
    ] }))!, s0);
    const lines = previewExchange(f, s0, NOW).find(x => x.id === 'expenses')!.lines;
    expect(lines.filter(l => l.startsWith('Уже есть'))).toHaveLength(2);
    const patch = applyExchange(f, s0, NOW, new Set(['expenses' as const]), id);
    expect(patch.expenses!.filter(e => e.date === '2026-11-03').map(e => e.amount).sort()).toEqual([420, 95, 95].sort());
    // только повторы — нового ничего
    const same = normalize(parseExchange(JSON.stringify({ app: 'kurs-exchange', version: 2, expenses: [{ date: '2026-11-03', amount: 420, category: 'work', note: 'Обед' }] }))!, s0);
    expect(previewExchange(same, s0, NOW)).toEqual([]);
  });
  it('разовая чистка: копии, которые добавил файл из чата, уходят; одинаковые траты из одного файла остаются', () => {
    const e = (id: string, amount: number, origin: 'manual' | 'chat' | 'ai', createdAt: string, date = '2026-10-27'): Expense =>
      ({ id, date, amount, category: 'transport', source: 'life', origin, createdAt });
    const { expenses, removed } = dropChatTwins([
      e('a', 420, 'manual', '2026-10-27T09:00'), e('b', 95, 'ai', '2026-10-27T09:00'),
      e('c', 420, 'chat', '2026-10-27T12:00'), e('d', 95, 'chat', '2026-10-27T12:00'),
      // вторая поездка из того же файла чата — настоящая
      e('f', 95, 'chat', '2026-10-27T12:00'),
      // одинаковые ручные траты — решение человека, не трогаем
      e('g', 300, 'manual', '2026-10-26T10:00', '2026-10-26'), e('h', 300, 'manual', '2026-10-26T11:00', '2026-10-26'),
    ]);
    expect(removed.map(x => x.id).sort()).toEqual(['c', 'd']);
    expect(expenses.map(x => x.id)).toEqual(['a', 'b', 'f', 'g', 'h']);
  });
  it('применяется только выбранное', () => {
    const f = normalize(parseExchange(JSON.stringify({ app: 'kurs-exchange', version: 2, reserve: 1, expenses: [{ id: 'e2', delete: true }] }))!, base);
    const patch = applyExchange(f, base, NOW, new Set(['expenses']), id);
    expect(patch.reserve).toBeUndefined();
    expect(patch.expenses!.map(e => e.id)).toEqual(['e1']);
  });

  it('прежний формат «kurs-plan» тоже понимается', () => {
    const p = parseExchange('```json\n{"app":"kurs-plan","version":1,"checklist":[{"id":"y","title":"Новое"}],"payments":[{"debtId":"sber","month":"2026-11","amount":19000}],"bonusRules":{"2027-04":{"targets":["split"]}}}\n```')!;
    expect(p.kind).toBe('v1');
    const patch = applyExchange(normalize(p, base), base, NOW, new Set(['limits', 'calendar', 'checklist']), id);
    expect(patch.checklist).toEqual([{ id: 'y', title: 'Новое' }]);
    expect(patch.overrides!['pay:sber:2026-11']).toEqual({ amount: 19_000 });
    expect(patch.plan!.bonusRules!['2026-12']).toBeTruthy();
    expect(patch.plan!.bonusRules!['2027-04']).toEqual({ targets: ['split'] });
    expect(parseExchange('просто текст')).toBeNull();
  });
});

describe('мост на кредитке', () => {
  const ov = [{ from: '2026-10-26', to: '2026-11-01', amount: 8400 }, { from: '2026-11-02', to: '2026-11-29', amount: 8000 }];
  const bridge: Bridge = { card: 'sber-card', cap: 7782, repayBy: '2027-02-18', weeks: [
    { monday: '2026-11-02', fromReserve: 0, fromCredit: 582 }, { monday: '2026-11-09', fromReserve: 4000, fromCredit: 4000 }, { monday: '2026-11-16', fromReserve: 4800, fromCredit: 3200 },
  ] };
  const exp = (id: string, date: string, amount: number, source: Expense['source'] = 'life', category: Expense['category'] = 'fun'): Expense => ({ id, date, amount, category, source, createdAt: '' });
  const base: ExchangeState = {
    debts: DEBTS, incomes: [], fixed: [], oneOff: [], templateFrom: '2026-10', weeklyOverrides: ov, overrides: {}, marks: {}, plan: PLAN,
    expenses: [exp('a', '2026-10-31', 17930)], reserve: 65750, savings: 0, cardBalance: null,
    checklist: [], checks: {}, strategy: [], rules: [], closures: {}, bridge: null,
  };

  it('перерасход уходит в минус; неделя моста: на карте по учёту, остальное с кредитки; итог — весь лимит', () => {
    expect(weekMoney(base.expenses, DEBTS, ov, bridge, '2026-10-26').left).toBe(-9530);
    const w = weekMoney(base.expenses, DEBTS, ov, bridge, '2026-11-02');
    expect(w).toMatchObject({ limit: 8000, cardBudget: 7418, creditCap: 582, left: 8000 });
    // траты с кредитки — в лимите недели, карта не трогается
    const w2 = weekMoney([...base.expenses, exp('c', '2026-11-04', 7418), exp('d', '2026-11-05', 300, 'credit')], DEBTS, ov, bridge, '2026-11-02');
    expect(w2).toMatchObject({ cardLeft: 0, creditLeft: 282, left: 282, spentCredit: 300 });
    expect(dayBudget([exp('d', '2026-11-05', 300, 'credit')], DEBTS, ov, '2026-11-05').spentToday).toBe(300);
    // остаток карты прошлой недели уменьшает кредит следующей, а не пополнение
    expect(weekMoney([...base.expenses, exp('e', '2026-11-03', 7118)], DEBTS, ov, bridge, '2026-11-09')).toMatchObject({ creditCap: 3700, cardBudget: 4300 });
    expect(weekReport(base.expenses, DEBTS, ov, '2026-11-02', bridge).topUp).toBe(4000);
    // в календаре воскресное пополнение — по плану моста
    const cal = { ...base, bridge };
    expect(eventsBetween(cal, '2026-11-08', '2026-11-08').find(e => e.kind === 'weekly')!.amount).toBe(4000);
    expect(eventsBetween(cal, '2026-11-01', '2026-11-01').find(e => e.kind === 'weekly')!.amount).toBe(0);
    expect(bridgeState([exp('d', '2026-11-05', 300, 'credit'), exp('x', '2026-10-20', 999, 'credit')], bridge)).toMatchObject({ used: 300, left: 7482 });
  });

  it('обмен: мост целиком, вторая поездка с dup, выгрузка с фактом и обратно без изменений, закрытие', () => {
    const file = normalize(parseExchange(JSON.stringify({ app: 'kurs-exchange', version: 2, bridge, expenses: [
      { date: '2026-10-31', amount: 17930, note: 'то же' },
      { date: '2026-11-02', amount: 95, category: 'transport', note: 'Метро' },
      { date: '2026-11-02', amount: 95, category: 'transport', note: 'Метро, 2-я', dup: true },
      { date: '2026-11-03', amount: 200, category: 'fun', source: 'credit' },
    ] }))!, base);
    const sections = previewExchange(file, base, '2026-11-03');
    expect(sections.map(x => x.id)).toEqual(['bridge', 'expenses']);
    const after = { ...base, ...applyExchange(file, base, '2026-11-03', new Set(sections.map(x => x.id)), () => 'n' + Math.random()) };
    expect(after.bridge!.weeks).toHaveLength(3);
    expect(after.expenses.filter(e => e.amount === 95)).toHaveLength(2);
    const out = buildExchange(after, '2026-11-03');
    expect(out.bridge).toMatchObject({ cap: 7782, used: 200, left: 7582 });
    expect((out.status as { week: Record<string, number> }).week).toMatchObject({ limit: 8000, spentLife: 190, spentCredit: 200, cardLeft: null, creditLeft: 382, left: 7610 });
    expect(previewExchange(normalize(parseExchange(JSON.stringify(out))!, after), after, '2026-11-03')).toEqual([]);
    const closed = applyExchange(normalize(parseExchange(JSON.stringify({ app: 'kurs-exchange', version: 2, bridge: { closed: true } }))!, after), after, '2026-11-03', new Set(['bridge' as const]), () => 'z');
    expect(closed.bridge!.closed).toBe(true);
  });

  it('откуда деньги: что предложить и что будет после записи траты', () => {
    // прошлые недели потрачены целиком — остатка на карте нет; неделя 09.11: лимит 8 000, мост до 4 000, на карте 4 000
    const past = [exp('p1', '2026-10-27', 8400), exp('p2', '2026-11-03', 8000)];
    const st = (more: Expense[] = []) => ({ expenses: [...past, ...more], debts: DEBTS, weeklyOverrides: ov, bridge });
    const at = { date: '2026-11-11', now: '2026-11-11', reserve: 50_000 };
    const eff = (...a: Parameters<typeof spendEffect>) => { const e = spendEffect(...a); return { tone: e.tone, text: e.text.replace(/\s/g, ' ') }; };
    // пока на карте есть недельные деньги — свои; карта пуста, мост есть — кредитка моста; мост выбран — снова свои
    expect(suggestSource(st(), '2026-11-11')).toBe('life');
    expect(suggestSource(st([exp('a', '2026-11-10', 4000)]), '2026-11-11')).toBe('credit');
    expect(suggestSource(st([exp('a', '2026-11-10', 4000), exp('b', '2026-11-10', 4000, 'credit')]), '2026-11-11')).toBe('life');
    // без моста кредитку не предлагаем никогда
    expect(suggestSource({ ...st([exp('a', '2026-11-10', 9000)]), bridge: null }, '2026-11-11')).toBe('life');
    // свои: в пределах нормы дня; сверх нормы дня; сверх лимита недели
    expect(eff(st(), { ...at, amount: 500, source: 'life' })).toEqual({ tone: 'ok', text: 'На сегодня останется 1 100 ₽' });
    expect(eff(st(), { ...at, amount: 3000, source: 'life' })).toEqual({ tone: 'warn', text: 'Сегодня сверх нормы на 1 400 ₽, на неделю останется 5 000 ₽' });
    expect(eff(st(), { ...at, amount: 9000, source: 'life' })).toEqual({ tone: 'neg', text: 'Сверх лимита недели на 1 000 ₽' });
    // в долг: по мосту — сколько станет из общего лимита; сверх плана недели; сверх лимита — новый долг; без моста — нарушение
    expect(eff(st(), { ...at, amount: 1500, source: 'credit' })).toEqual({ tone: 'loan', text: 'В долг по мосту: станет 1 500 ₽ из 7 782 ₽' });
    expect(eff(st(), { ...at, amount: 4500, source: 'credit' })).toEqual({ tone: 'warn', text: 'В долг сверх плана моста на неделю на 500 ₽' });
    expect(eff(st(), { ...at, amount: 8500, source: 'credit' })).toEqual({ tone: 'neg', text: 'Сверх лимита недели на 500 ₽ — это уже новый долг' });
    expect(eff({ ...st(), bridge: null }, { ...at, amount: 100, source: 'credit' }).tone).toBe('neg');
    // резерв: остаток резерва, в лимит не входит; правка траты не считает её прежнюю сумму
    expect(eff(st(), { ...at, amount: 1000, source: 'reserve' })).toEqual({ tone: 'rsv', text: 'Из резерва: останется 49 000 ₽. В лимит недели не входит' });
    expect(spendEffect(st([exp('e', '2026-11-11', 700)]), { ...at, amount: 700, source: 'life', skipId: 'e' })).toEqual(spendEffect(st(), { ...at, amount: 700, source: 'life' }));
    expect(bySource([exp('a', '2026-11-10', 100), exp('b', '2026-11-10', 40, 'credit'), exp('c', '2026-11-10', 7, 'reserve')])).toEqual({ life: 100, credit: 40, reserve: 7 });
  });

  it('быстрые траты: частое — одной кнопкой; «как вчера» — вчерашний набор', () => {
    const e = (id: string, date: string, amount: number, note: string, category: Expense['category'] = 'transport', source: Expense['source'] = 'life'): Expense => ({ id, date, amount, category, note, source, createdAt: '' });
    const list = [e('1', '2026-11-03', 95, 'Метро'), e('2', '2026-11-04', 95, 'метро'), e('3', '2026-11-05', 95, 'Метро '), e('4', '2026-11-04', 340, 'Обед', 'work'), e('5', '2026-11-05', 340, 'Обед', 'work'),
      e('6', '2026-11-05', 900, 'Разовое', 'fun'), e('7', '2026-11-04', 500, 'Аптека', 'health', 'reserve'), e('8', '2026-11-05', 500, 'Аптека', 'health', 'reserve'), e('9', '2026-09-01', 46, 'Старое'), e('10', '2026-09-02', 46, 'Старое')];
    expect(quickSpends(list, '2026-11-06').map(q => [q.note, q.amount, q.count])).toEqual([['Метро', 95, 3], ['Обед', 340, 2]]);
    expect(yesterdaySet(list, '2026-11-06').map(x => x.id)).toEqual(['3', '5', '6']);
    expect(yesterdaySet(list, '2026-11-08')).toEqual([]);
  });

  it('строка «Неделя»: свои + в долг по мосту + сверх лимита = потрачено; перерасход сначала на кредитку', () => {
    const m = (spentLife: number, spentCredit: number) => ({ ...weekMoney([], DEBTS, ov, null, '2026-11-02'), spentLife, spentCredit, spent: spentLife + spentCredit });
    expect(weekParts(m(7000, 5000))).toEqual({ own: 7000, loan: 1000, over: 4000, scale: 12_000 });
    expect(weekParts(m(4000, 1000))).toEqual({ own: 4000, loan: 1000, over: 0, scale: 8000 });
    // кредитки мало, чтобы покрыть перерасход: остальное сверх лимита — со своей карты
    expect(weekParts(m(9500, 500))).toEqual({ own: 8000, loan: 0, over: 2000, scale: 10_000 });
  });

  it('неделя ушла в минус: кольцо 0 без второго «минуса»; cardLeft — карта по учёту; status.today; проценты моста', () => {
    // пятница: до сегодня 5 800 (с кредитки 800), сегодня 3 000 (с кредитки 2 400) — неделя −800
    const expenses = [exp('l1', '2026-11-03', 5000), exp('c1', '2026-11-04', 800, 'credit'), exp('l2', '2026-11-06', 600), exp('c2', '2026-11-06', 2400, 'credit')];
    const fri = dayBudget(expenses, DEBTS, ov, '2026-11-06');
    expect(fri).toMatchObject({ day: 730, spentToday: 3000, weekLeft: -800, mode: 'week', canSpend: 0, overDay: 0, spentLife: 600, spentCredit: 2400 });
    // вторник: сверх нормы дня, но неделя в плюсе — кольцо 0 и «сверх нормы на 400»
    const tue = dayBudget([exp('a', '2026-11-02', 2000), exp('b', '2026-11-03', 900)], DEBTS, ov, '2026-11-03');
    expect(tue).toMatchObject({ day: 1000, mode: 'ok', canSpend: 100 });
    expect(dayBudget([exp('a', '2026-11-02', 2000), exp('b', '2026-11-03', 1400)], DEBTS, ov, '2026-11-03')).toMatchObject({ mode: 'day', overDay: 400, canSpend: 0, weekLeft: 4600 });
    // сверка в понедельник: на карте 6 500, долили 500 — дальше карта по учёту, а не «лимит минус траты»
    const sber: Debt = { ...DEBTS[1], id: 'sber-card', kind: 'card', balance: 300_000, rate: 0.365, updatedAt: '2026-11-02T10:00:00.000' };
    const checkup: Checkup = {
      id: 'k', at: '2026-11-02T10:00:00.000', date: '2026-11-02', monday: '2026-10-26', expected: { card: 6500, reserve: 60_000, credit: 300_000 },
      actual: { card: 6500, reserve: 60_000, credit: 300_000 }, topUp: 500, toReserve: 0, after: { card: 7000, reserve: 59_500 },
    };
    const st: ExchangeState = {
      ...base, debts: [...DEBTS.filter(d => d.id !== 'sber-card'), sber], bridge, expenses, checkups: [checkup],
      closures: { '2026-10-26': { monday: '2026-10-26', limit: 8400, spent: 17_930, left: -9530, transferred: 0 } },
    };
    const out = buildExchange(st, '2026-11-06');
    const status = out.status as { week: Record<string, number>; today: Record<string, unknown>; ledger: Record<string, number> };
    expect(status.week).toMatchObject({ left: -800, cardLeft: 1400 });
    expect(status.today).toEqual({ date: '2026-11-06', allowance: 730, spent: 3000, spentLife: 600, spentCredit: 2400, canSpend: 0 });
    // долг моста: сверка + траты с кредитки + проценты по дням (4 дня × 36,5% годовых от 300 000 = 1 200)
    expect(status.ledger).toMatchObject({ card: 1400, credit: 304_400, creditInterest: 1200 });
    // прошедшая неделя со сверкой — карта из сверки (до перевода)
    expect((out.weeks as { monday: string; cardLeft: number }[]).find(w => w.monday === '2026-10-26')!.cardLeft).toBe(6500);
  });
});

describe('покрытие обязательных платежей', () => {
  const ev = (key: string, date: string, title: string, amount: number, kind: 'payment' | 'income' = 'payment'): CalEvent =>
    ({ key, date, dateMode: 'exact', kind, title, amount });
  // пополнения карты обнулены — проверяем только платежи и поступления
  const cal = (oneOff: CalEvent[]) => ({ debts: [], incomes: [], fixed: [], oneOff, templateFrom: '2027-06', weeklyOverrides: [{ from: '2026-10-26', to: '2027-12-31', amount: 0 }] });
  const base = { marks: {}, debts: [] as Debt[], expenses: [] as Expense[] };

  it('минимум, узкие места, месяцы, перенос пополнения закрывает нехватку', () => {
    const oneOff = [ev('one:a', '2026-11-10', 'Зарплата', 20000, 'income'), ev('pay:loan:2026-11', '2026-11-11', 'Кредит', 25000), ev('one:gift', '2026-11-16', 'Подарок', 4000)];
    const input = { ...base, cal: cal(oneOff), reserve: 6000 };
    const c = coverage(input, '2026-11-01');
    expect(c.min).toMatchObject({ date: '2026-11-16', balance: -3000 });
    expect(c.shortage).toMatchObject({ date: '2026-11-16', amount: 3000 });
    expect(c.narrow.map(s => s.date)).toEqual(['2026-11-11', '2026-11-16']);
    expect(c.months[0]).toMatchObject({ month: '2026-11', payments: 29000, incomes: 20000, net: -9000 });
    const hints = coverageHints(input, '2026-11-01', c);
    expect(hints.some(h => h.text.includes('Подарок') && h.closes)).toBe(true);
  });

  it('мост: погашение с процентами в срок и рост минималки кредитки', () => {
    const sber = { ...DEBTS[0], id: 'sber-card', rate: 0.388 };
    const bridge: Bridge = { card: 'sber-card', cap: 7782, repayBy: '2027-02-18', weeks: [{ monday: '2026-11-02', fromReserve: 0, fromCredit: 3000 }] };
    const oneOff = [ev('pay:sber-card:2026-11', '2026-11-30', 'Сбер', 18000)];
    oneOff[0].debtId = 'sber-card';
    const c = coverage({ ...base, debts: [sber], bridge, cal: cal(oneOff), reserve: 50000 }, '2026-11-01');
    const sberStep = c.steps.find(s => s.key === 'pay:sber-card:2026-11')!;
    expect(sberStep.delta).toBe(-(18000 + Math.round(3000 * (0.02 + 0.388 / 12))));
    const repay = c.steps.find(s => s.kind === 'bridge')!;
    expect(repay.date).toBe('2027-02-18');
    expect(-repay.delta).toBeGreaterThan(3000);
  });
});

describe('обмен: короткая выгрузка и сводка', () => {
  it('короткая выгрузка без шаблонов и стратегии, с версией протокола и покрытием; сводка по-человечески', () => {
    const s: ExchangeState = {
      debts: DEBTS, incomes: [{ kind: 'salary', name: 'Зарплата', day: 10, amount: 50_000 }], fixed: [], oneOff: [], templateFrom: '2026-11',
      weeklyOverrides: [], overrides: {}, marks: {}, plan: PLAN, expenses: [{ id: 'old', date: '2026-10-01', amount: 100, category: 'fun', source: 'life', createdAt: '' }],
      reserve: 50_000, savings: 0, cardBalance: null, checklist: [], checks: {}, strategy: [{ title: 'Суть', text: 'т' }], rules: ['п'], closures: {},
    };
    const short = buildExchange(s, '2026-11-05', { short: true });
    expect(short).toMatchObject({ protocolVersion: PROTOCOL_VERSION, short: true });
    expect(short.incomes).toBeUndefined();
    expect(short.strategy).toBeUndefined();
    expect(short.expenses).toEqual([]);
    expect((short.status as { coverage: { to: string } }).coverage.to >= '2027-04-04').toBe(true);
    const f = normalize(parseExchange('Вот блок:\n```json\n' + JSON.stringify({ app: 'kurs-exchange', version: 2, from: 'chat', reserve: 60_000,
      expenses: [{ date: '2026-11-05', amount: 300, category: 'fun' }, { date: '2026-11-05', amount: 200, category: 'taxi' }] }) + '\n```\nПроверь.')!, s);
    expect(exchangeDigest(f, s, '2026-11-05').map(l => l.replace(/\s/g, ' '))).toEqual(['Траты: +2 (500 ₽)', 'Резерв: 50 000 ₽ → 60 000 ₽']);
  });
});

describe('учёт по счетам для воскресной сверки', () => {
  const base = {
    checkups: [] as Checkup[], reserve: 40_000, reserveLog: [{ id: 'r', date: '2026-11-01', at: '2026-11-01T18:00:00.000Z', abs: true, amount: 0, note: 'Сверка с банком' }],
    marks: {} as Record<string, EventMark>, expenses: [] as Expense[], oneOff: [], debts: [] as Debt[], bridge: null,
    cardBalance: { amount: 3000, date: '2026-11-01', source: 'manual' as const, at: '2026-11-01T18:00:00.000Z' },
  };
  const spend = (date: string, amount: number, source: Expense['source'] = 'life'): Expense => ({ id: date + amount, date, amount, category: 'groceries', source, origin: 'manual', createdAt: `${date}T12:00:00.000Z` });

  it('карта на вечер воскресенья: вперёд от точки отсчёта и назад от неё, без пополнения к следующей неделе', () => {
    const s = {
      ...base, cardBalance: { amount: 4000, date: '2026-11-04', at: '2026-11-04T12:00:00.000Z' },
      marks: { 'wk:2026-11-02': { done: true, amount: 3000, at: '2026-11-01T19:00:00.000Z' } } as Record<string, EventMark>,
      expenses: [spend('2026-10-31', 500), spend('2026-11-03', 200)],
    };
    // назад от остатка 04.11: трата 03.11 возвращается (+200), пополнение к неделе 02.11 — уже после вечера 01.11 (−3000)
    expect(cardOn(s, '2026-11-01')).toBe(1200);
    // вперёд от остатка — то же, что учёт на этот день
    expect(cardOn({ ...s, expenses: [...s.expenses, spend('2026-11-05', 300)] }, '2026-11-05')).toBe(3700);
    expect(cardOn({ ...s, cardBalance: null }, '2026-11-01')).toBeNull();
  });

  it('карта: + пополнение и зарплата, − траты и платежи с карты; резерв: − платежи из резерва', () => {
    const l = ledger({
      ...base,
      marks: {
        'wk:2026-11-09': { done: true, amount: 8000, at: '2026-11-08T19:00:00.000Z' },
        'inc:salary:2026-11': { done: true, amount: 50_000, at: '2026-11-10T09:00:00.000Z' },
        'pay:vtb:2026-11': { done: true, amount: 20_000, at: '2026-11-11T09:00:00.000Z', paidFrom: 'reserve' },
        'pay:split:2026-11': { done: true, amount: 5000, at: '2026-11-11T09:00:00.000Z', paidFrom: 'card' },
        'inc:salary:2026-10': { done: true, amount: 50_000, at: '2026-10-10T09:00:00.000Z' },
      },
      expenses: [spend('2026-11-03', 1200), spend('2026-10-30', 999), spend('2026-11-04', 700, 'reserve')],
    });
    expect(l.card).toBe(3000 + 8000 + 50_000 - 5000 - 1200);
    expect(l.incomeOnCard).toBe(50_000);
    expect(l.reserve).toBe(40_000 - 20_000 - 700);
  });

  it('кредитки: первой — кредитка моста, затем открытые по порядку; долг по учёту — остаток плюс покупки после обновления', () => {
    const card = (id: string, order: number, balance: number, extra: Partial<Debt> = {}): Debt => ({
      id, name: `Кредитка ${id}`, short: id, kind: 'card', balance, startBalance: balance, rate: 0.3, dueDay: 10,
      rule: { type: 'interestPlus', plus: 1000 } as Debt['rule'], frozen: true, order, closed: false, updatedAt: '2026-11-01T10:00:00.000Z', ...extra,
    });
    const bridge = { card: 'c3', cap: 30_000, weeks: [{ monday: '2026-11-02', fromReserve: 5000, fromCredit: 3000 }] } as unknown as LedgerInput['bridge'];
    const l = ledger({
      ...base, bridge, now: '2026-11-01',
      debts: [card('c1', 1, 10_000), card('c2', 2, 20_000), card('c3', 5, 30_000, { limit: 100_000 }), card('c4', 3, 0, { closed: true }),
        { ...card('loan', 0, 50_000), kind: 'loan' }],
      expenses: [
        { ...spend('2026-11-03', 500, 'credit'), creditCard: 'c2' },
        spend('2026-11-04', 700, 'credit'), // без карты — с кредитки моста
        { ...spend('2026-10-30', 900, 'credit'), creditCard: 'c1' }, // до обновления остатка — уже в нём
      ],
    });
    expect(l.cards.map(c => c.debt.id)).toEqual(['c3', 'c1', 'c2']);
    expect(l.cards.map(c => c.expected)).toEqual([30_700, 10_000, 20_500]);
    expect(l.cards[0].bridge).toBe(true);
    expect(l.credit).toBe(30_700);
  });

  it('кредитка: проценты набегают по дням с последнего обновления остатка — как у банка', () => {
    const d: Debt = { id: 'k', name: 'Кредитка', short: 'К', kind: 'card', balance: 100_000, startBalance: 100_000, rate: 0.365, dueDay: 10,
      rule: { type: 'interestPlus', plus: 1000 } as Debt['rule'], frozen: true, order: 1, closed: false, updatedAt: '2026-11-01T10:00:00.000Z' };
    expect(accruedOnCard(d, '2026-11-11')).toBe(1000);
    expect(accruedOnCard(d, '2026-10-20')).toBe(0);
    expect(accruedOnCard({ ...d, kind: 'loan' }, '2026-11-11')).toBe(0);
    expect(ledger({ ...base, debts: [d], now: '2026-11-11' }).cards[0]).toMatchObject({ expected: 101_000, accrued: 1000 });
  });

  it('перевод: без моста — лимит минус остаток недели, поступления с карты — в резерв', () => {
    const p = checkupPlan({ expenses: [], debts: [], overrides: [{ from: '2026-11-02', to: '2026-11-08', amount: 8000 }], bridge: null, marks: {}, monday: '2026-10-26', leftover: 1500, incomeOnCard: 50_000 });
    expect(p.topUp).toBe(6500);
    expect(p.toReserve).toBe(50_000);
    expect(p.net).toBe(6500 - 50_000);
  });

  it('пополнение уже отмечено — повторно не предлагается', () => {
    const p = checkupPlan({ expenses: [], debts: [], overrides: [], bridge: null, marks: { 'wk:2026-11-02': { done: true, amount: 7000, at: 'x' } }, monday: '2026-10-26', leftover: 0, incomeOnCard: 0 });
    expect(p.topUp).toBe(0);
    expect(p.toppedBefore).toBe(7000);
  });
});

describe('перевод из резерва на карту под платёж', () => {
  const pay = (key: string, date: string, amount: number): CalEvent => ({ key, date, title: key, amount, kind: 'payment' } as CalEvent);
  const events = [pay('pay:a:2026-11', '2026-11-11', 40_000), pay('fix:b:2026-11', '2026-11-11', 2000), pay('pay:c:2026-11', '2026-11-13', 9000)];
  const NOW = '2026-11-10';
  const ask = (o: Partial<Parameters<typeof transferPlan>[0]> = {}) => transferPlan({ events, marks: {}, log: [], incomeOnCard: 0, now: NOW, hour: 19, ...o });

  it('шаг появляется накануне с 18:00 и в день платежа; сумма — все платежи этого дня', () => {
    expect(ask({ hour: 17 })).toBeNull();
    expect(ask()).toMatchObject({ keys: ['pay:a:2026-11', 'fix:b:2026-11'], total: 42_000, onCard: 0, amount: 42_000, when: 'tomorrow' });
    expect(ask({ now: '2026-11-11', hour: 8 })).toMatchObject({ amount: 42_000, when: 'today' });
    // послезавтрашний платёж ещё не зовёт; прошедший неотмеченный — тоже: его отмечают, а не переводят под него
    expect(ask({ now: '2026-11-12', hour: 12 })).toBeNull();
    expect(ask({ now: '2026-11-12', hour: 18 })).toMatchObject({ keys: ['pay:c:2026-11'], when: 'tomorrow' });
  });

  it('поступления на карте идут в счёт платежа; отмеченное и уже переведённое не предлагается', () => {
    expect(ask({ incomeOnCard: 30_000 })).toMatchObject({ total: 42_000, onCard: 30_000, amount: 12_000 });
    expect(ask({ incomeOnCard: 90_000 })).toMatchObject({ onCard: 42_000, amount: 0 });
    expect(ask({ marks: { 'pay:a:2026-11': { done: true, amount: 40_000, at: 'x' } } })).toMatchObject({ keys: ['fix:b:2026-11'], amount: 2000 });
    const log = [{ id: 't', date: NOW, at: '2026-11-10T19:00:00.000Z', amount: -42_000, note: 'под платёж', card: 42_000, forKeys: ['pay:a:2026-11', 'fix:b:2026-11'] }];
    expect(ask({ log })).toBeNull();
    expect([...heldKeys(log, {})]).toEqual(['pay:a:2026-11', 'fix:b:2026-11']);
    expect([...heldKeys(log, { 'pay:a:2026-11': { done: true, at: 'x' } })]).toEqual(['fix:b:2026-11']);
  });

  const check = (date: string, at: string, card: number, reserve: number): Checkup => ({ monday: '2026-11-02', date, at, expected: { card: null, reserve, credit: null }, actual: { card, reserve }, topUp: 0, toReserve: 0, after: { card, reserve } });
  const base: LedgerInput = { checkups: [check('2026-11-08', '2026-11-08T18:00:00.000Z', 5000, 60_000)], cardBalance: null, reserve: 60_000, reserveLog: [], marks: {}, expenses: [], oneOff: [], debts: [], bridge: null, now: '2026-11-11' };
  const move = (amount: number, forKeys: string[], at = '2026-11-10T19:00:00.000Z') => ({ id: `t${at}`, date: at.slice(0, 10), at, amount: -amount, note: 'под платёж', ...(amount ? { card: amount } : {}), forKeys });
  const pool = (s: LedgerInput) => { const l = ledger(s); return l.reserve + l.incomeOnCard + l.heldOnCard; };

  it('перевод сразу уменьшает резерв, деньги ждут на карте; платёж с карты резерв второй раз не трогает', () => {
    const moved = { ...base, reserve: 20_000, reserveLog: [move(40_000, ['pay:a:2026-11'])] };
    expect(ledger(moved)).toMatchObject({ reserve: 20_000, card: 45_000, heldOnCard: 40_000, incomeOnCard: 0 });
    // для прогноза денег столько же, сколько до перевода: платёж ещё впереди
    expect(pool(moved)).toBe(pool(base));
    const paid = { ...moved, marks: { 'pay:a:2026-11': { done: true, amount: 40_000, at: '2026-11-11T09:00:00.000Z', paidFrom: 'card' as const } } };
    expect(ledger(paid)).toMatchObject({ reserve: 20_000, card: 5000, heldOnCard: 0, incomeOnCard: 0 });
    expect(pool(paid)).toBe(pool(base) - 40_000);
  });

  it('на карте лежала зарплата — перевели меньше платежа: остальное платёж берёт из неё', () => {
    const salary = { 'inc:salary:2026-11': { done: true, amount: 25_000, at: '2026-11-10T09:00:00.000Z' } };
    const moved = { ...base, reserve: 45_000, marks: salary, reserveLog: [move(15_000, ['pay:a:2026-11'])] };
    expect(ledger(moved)).toMatchObject({ reserve: 45_000, card: 45_000, heldOnCard: 15_000, incomeOnCard: 25_000 });
    const paid = { ...moved, marks: { ...salary, 'pay:a:2026-11': { done: true, amount: 40_000, at: '2026-11-11T09:00:00.000Z', paidFrom: 'card' as const } } };
    expect(ledger(paid)).toMatchObject({ reserve: 45_000, card: 5000, heldOnCard: 0, incomeOnCard: 0 });
    // перевод не понадобился вовсе: запись с нулём помечает платёж «с карты»
    const zero = { ...base, marks: { 'inc:salary:2026-11': { done: true, amount: 50_000, at: '2026-11-10T09:00:00.000Z' } }, reserveLog: [move(0, ['pay:a:2026-11'])] };
    expect(ledger(zero)).toMatchObject({ reserve: 60_000, heldOnCard: 0, incomeOnCard: 50_000 });
    expect(ledger({ ...zero, marks: { ...zero.marks, 'pay:a:2026-11': { done: true, amount: 40_000, at: '2026-11-11T09:00:00.000Z', paidFrom: 'card' as const } } })).toMatchObject({ reserve: 60_000, incomeOnCard: 10_000 });
  });

  it('сверка между переводом и платежом: деньги под платёж не предлагается вернуть в резерв', () => {
    const s = { ...base, reserve: 20_000, checkups: [check('2026-11-10', '2026-11-10T21:00:00.000Z', 45_000, 20_000)], reserveLog: [move(40_000, ['pay:a:2026-11'])] };
    expect(ledger(s)).toMatchObject({ reserve: 20_000, card: 45_000, heldOnCard: 40_000, incomeOnCard: 0 });
    const paid = { ...s, marks: { 'pay:a:2026-11': { done: true, amount: 40_000, at: '2026-11-11T09:00:00.000Z', paidFrom: 'card' as const } } };
    expect(ledger(paid)).toMatchObject({ reserve: 20_000, card: 5000, heldOnCard: 0, incomeOnCard: 0 });
  });
});

describe('трата одной фразой', () => {
  it('сумма цифрами: с рублями, с пробелом в тысячах, с копейками', () => {
    expect(parseSpoken('обед 340')).toEqual({ amount: 340, words: 'обед' });
    expect(parseSpoken('Метро 95 рублей')).toEqual({ amount: 95, words: 'Метро' });
    expect(parseSpoken('продукты 1 500')).toEqual({ amount: 1500, words: 'продукты' });
    expect(parseSpoken('аптека 412,50 ₽')).toEqual({ amount: 412.5, words: 'аптека' });
    expect(parseSpoken('340р кофе')).toEqual({ amount: 340, words: 'кофе' });
  });

  it('сумма словами — как её отдаёт диктовка', () => {
    expect(parseSpoken('обед триста сорок')).toEqual({ amount: 340, words: 'обед' });
    expect(parseSpoken('такси тысяча двести')).toEqual({ amount: 1200, words: 'такси' });
    expect(parseSpoken('Продукты две тысячи пятьсот рублей.')).toEqual({ amount: 2500, words: 'Продукты' });
    expect(parseSpoken('подарок полторы тысячи')).toEqual({ amount: 1500, words: 'подарок' });
    expect(parseSpoken('кофе 2 тысячи')).toEqual({ amount: 2000, words: 'кофе' });
  });

  it('чисел несколько — сумма последняя; числа нет — фраза остаётся примечанием', () => {
    expect(parseSpoken('2 кофе 300')).toEqual({ amount: 300, words: '2 кофе' });
    expect(parseSpoken('кофе с собой')).toEqual({ amount: null, words: 'кофе с собой' });
    expect(parseSpoken('')).toEqual({ amount: null, words: '' });
  });

  it('категория: сначала по своим прошлым тратам, потом по словарю', () => {
    expect(guessCategory('обед', [])).toBe('work');
    expect(guessCategory('Метро', [])).toBe('transport');
    expect(guessCategory('в аптеку', [])).toBe('health');
    expect(guessCategory('что-то', [])).toBeNull();
    const mine = [{ note: 'Кофе', category: 'fun' as const }, { note: 'кофе', category: 'fun' as const }, { note: 'кофе', category: 'work' as const }];
    expect(guessCategory('кофе', mine)).toBe('fun');
  });
});

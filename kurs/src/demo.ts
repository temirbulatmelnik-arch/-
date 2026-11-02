// Демо для показа нового вида: вымышленный план и траты относительно сегодняшней даты — без кода и без личных данных.
// Собирается с VITE_DEMO=1 (и VITE_NO_SW=1): так макет открывается где угодно, ничего не скачивая.
import { addDays, monthKey, today, weekStart } from './domain/dates';
import type { Debt, Expense, PlanSeed } from './domain/types';
import { useStore } from './store/store';

const d = (p: Partial<Debt> & Pick<Debt, 'id' | 'name' | 'short' | 'kind' | 'balance' | 'rule' | 'order'>): Debt => ({
  startBalance: p.balance * 1.08, rate: 0.35, dueDay: 15, frozen: p.kind === 'card', closed: false, ...p,
});

export function startDemo() {
  const s = useStore.getState();
  if (s.ready) return;
  const now = today();
  const month = monthKey(now);
  const mon = weekStart(now);
  const debts: Debt[] = [
    d({ id: 'loan-old', name: 'Микрозайм', short: 'Микрозайм', kind: 'micro', balance: 0, startBalance: 24_000, rule: { type: 'fixed', amount: 0 }, order: 0, closed: true, closedOn: addDays(now, -12) }),
    d({ id: 'inst', name: 'Рассрочка на телефон', short: 'Рассрочка', kind: 'installment', balance: 28_400, rate: 0, order: 1, phase: 1, noPrepay: true, dueDay: 20,
      rule: { type: 'schedule', items: [{ date: `${month}-20`, amount: 14_200 }, { date: addDays(`${month}-20`, 30), amount: 14_200 }] } }),
    d({ id: 'alfa', name: 'Кредитная карта Альфа', short: 'Альфа', kind: 'card', balance: 74_300, rate: 0.6, order: 2, phase: 1, dueDay: 3, limit: 90_000, rule: { type: 'interestPlus', share: 0.03 }, targetClose: addDays(`${month}-01`, 40).slice(0, 7) }),
    d({ id: 'split', name: 'Яндекс Сплит', short: 'Сплит', kind: 'split', balance: 162_000, rate: 0.52, order: 3, phase: 2, dueDay: 1, frozen: true, rule: { type: 'annuity', endDate: `${Number(month.slice(0, 4)) + 1}-10-01`, amount: 13_800 } }),
    d({ id: 'tb', name: 'Кредитная карта Т-Банка', short: 'Т-Банк', kind: 'card', balance: 286_000, rate: 0.48, order: 4, phase: 2, dueDay: 16, limit: 300_000, rule: { type: 'interestPlus', share: 0.017, min: 600 } }),
    d({ id: 'sber', name: 'Кредитная карта Сбера', short: 'Сбер', kind: 'card', balance: 312_000, rate: 0.4, order: 5, phase: 3, dueDay: 28, limit: 330_000, rule: { type: 'interestPlus', share: 0.03 } }),
    d({ id: 'vtb', name: 'Кредит ВТБ', short: 'Кредит ВТБ', kind: 'loan', balance: 870_000, rate: 0.29, order: 6, phase: 4, dueDay: 11, frozen: false, rule: { type: 'annuity', endDate: `${Number(month.slice(0, 4)) + 2}-10-11`, amount: 39_500 } }),
  ];
  const total = debts.reduce((t, x) => t + x.balance, 0);
  const seed: PlanSeed = {
    rev: 1, asOf: addDays(now, -21), templateFrom: month, reserve: 58_000,
    debts,
    incomes: [
      { kind: 'salary', name: 'Зарплата', day: 10, amount: 46_000 },
      { kind: 'advance', name: 'Аванс', day: 25, amount: 46_000 },
      { kind: 'bonusMonthly', name: 'Премия за прошлый месяц', day: 15, amount: 21_000 },
      { kind: 'bonusYear', name: 'Годовая премия', day: 18, amount: 120_000, months: [12] },
    ],
    fixed: [
      { id: 'mts', name: 'Связь', day: 8, amount: 900 },
      { id: 'gym', name: 'Спортзал', day: 12, amount: 2900 },
      { id: 'claude', name: 'Claude, подписка', day: 22, amount: 2200 },
    ],
    oneOff: [{ key: 'one:gift', date: addDays(now, 9), dateMode: 'until', kind: 'payment', title: 'Подарок на день рождения', amount: 6000 }],
    plan: {
      phases: [
        { id: 1, title: 'Самые дорогие', monthly: 46_000, weekly: 9000, shortfall: 12_000, closes: ['Рассрочка', 'Альфа'], premiums: 'Сверх резерва — в Альфу, пока не закроется', from: addDays(month + '-01', -40).slice(0, 7), to: addDays(month + '-01', 70).slice(0, 7) },
        { id: 2, title: 'Сплит и Т-Банк', monthly: 52_000, weekly: 10_500, shortfall: 6000, closes: ['Сплит', 'Т-Банк'], premiums: 'Премии — в Т-Банк', from: addDays(month + '-01', 75).slice(0, 7), to: addDays(month + '-01', 400).slice(0, 7) },
        { id: 3, title: 'Сбер', monthly: 56_000, weekly: 11_500, shortfall: 0, closes: ['Сбер'], premiums: 'Премии — в Сбер', from: addDays(month + '-01', 405).slice(0, 7), to: addDays(month + '-01', 700).slice(0, 7) },
        { id: 4, title: 'Свобода', monthly: 60_000, weekly: 12_500, shortfall: 0, closes: ['Кредит ВТБ'], premiums: 'Досрочно в кредит', from: addDays(month + '-01', 705).slice(0, 7), to: addDays(month + '-01', 1200).slice(0, 7) },
      ],
      categories: {
        groceries: { limit: 15_000, baseline: 19_000 }, work: { limit: 6000, baseline: 12_000 }, taxi: { limit: 1500, baseline: 9000 },
        transport: { limit: 4500, baseline: 4000 }, health: { limit: 4000, baseline: 5000 }, shopping: { limit: 3000, baseline: 15_000 },
        beauty: { limit: 1500, baseline: 5000 }, tobacco: { limit: 1500, baseline: 4000 }, fun: { limit: 5000, baseline: 26_000 }, fixed: { limit: 6000, baseline: 9000 },
      },
      bonusMonths: [12],
    },
    weeklyOverrides: [],
    planTrajectory: Array.from({ length: 40 }, (_, i) => [addDays(`${month}-01`, Math.round((i - 1) * 30.4)).slice(0, 7), Math.max(0, Math.round(total * 1.04 - i * total / 34))] as [string, number]),
    baselineTrajectory: Array.from({ length: 40 }, (_, i) => [addDays(`${month}-01`, Math.round((i - 1) * 30.4)).slice(0, 7), Math.round(total * 1.04 - i * total / 90)] as [string, number]),
    checklist: [
      { id: 'c1', title: 'Отключить автоплатёж с кредитки Т-Банка', due: addDays(now, 3) },
      { id: 'c2', title: 'Попросить закрыть счёт микрозайма', note: 'Справку о закрытии сохранить в «Файлы»', due: addDays(now, -2) },
      { id: 'c3', title: 'Перевести подписку на дебетовую карту', done: true },
    ],
    strategy: [{ title: 'Почему такой порядок', text: 'Сначала самые дорогие долги: каждый рубль в них экономит больше процентов.\n\n- Рассрочка без процентов — по графику\n- Альфа под 60% — премией, как только хватит\n- Дальше Сплит и Т-Банк, потом Сбер' }],
  };
  s.loadSeed(seed);
  // траты этой и прошлой недели — чтобы экраны были живыми
  const spends: [number, number, Expense['category'], string][] = [
    [-9, 1840, 'groceries', 'Пятёрочка'], [-8, 420, 'work', 'Столовая'], [-8, 95, 'transport', 'Метро'], [-7, 2600, 'fun', 'Кафе с друзьями'],
    [-6, 640, 'groceries', 'ВкусВилл'], [-5, 95, 'transport', 'Метро'], [-5, 1290, 'health', 'Аптека'], [-4, 380, 'work', 'Кофе'],
    [-3, 2150, 'groceries', 'Лента'], [-2, 499, 'shopping', 'Озон'], [-1, 95, 'transport', 'Метро'], [-1, 760, 'fun', 'Шаверма'],
  ];
  const expenses = spends.map(([k, amount, category, note], i) => {
    const date = addDays(now, k);
    return { id: `demo${i}`, date, amount, category, note, source: 'life' as const, origin: 'manual' as const, createdAt: `${date}T12:00:00.000Z` };
  }).filter(e => e.date <= now);
  // сегодня — пара трат, чтобы кольцо дня было не полным
  expenses.push({ id: 'demo-t1', date: now, amount: 95, category: 'transport', note: 'Метро', source: 'life', origin: 'manual', createdAt: `${now}T08:10:00.000Z` });
  expenses.push({ id: 'demo-t2', date: now, amount: 340, category: 'work', note: 'Обед', source: 'life', origin: 'manual', createdAt: `${now}T13:20:00.000Z` });
  useStore.setState({
    expenses,
    cardBalance: { amount: 6200, date: now, source: 'manual', at: `${now}T07:00:00.000Z` },
    bridge: { card: 'sber', cap: 8000, repayBy: addDays(now, 75), repayNote: 'годовой премией', weeks: [
      { monday: mon, fromReserve: 5000, fromCredit: 4000 }, { monday: addDays(mon, 7), fromReserve: 5500, fromCredit: 3500 },
    ] },
  });
}

// Ответ разбора (Claude, CSV или текст) → список предложений «что обновить в приложении».
// Человек смотрит список, снимает лишние галочки и нажимает «Применить».
import type { AiResult } from './ai';
import { eventsBetween, type CalendarInput } from './calendar';
import { bankCat, isPerson, normName, type BankOp, type BankParse } from './bankText';
import { categorize, fingerprint } from './categorize';
import { addDays, daysBetween, ddmm } from './dates';
import { rub } from './money';
import { draft, type DraftTx } from './statements';
import type { CalEvent, CategoryId, Debt, EventMark, Expense, MemoryRule, Source } from './types';

export type Proposal =
  | { id: string; type: 'tx'; on: boolean; tx: DraftTx }
  | { id: string; type: 'debt'; on: boolean; debt: Debt; balance: number; minPayment: number; dueDate: string; event: CalEvent | null }
  /** selfKey — перевод на своё имя закрыл платёж: запомнить, что это я */
  | { id: string; type: 'mark'; on: boolean; event: CalEvent; amount: number; selfKey?: string }
  | { id: string; type: 'income'; on: boolean; event: CalEvent | null; amount: number; date: string; bonus: boolean }
  | { id: string; type: 'reserve'; on: boolean; balance: number }
  | { id: string; type: 'card'; on: boolean; balance: number; date: string };

export interface Review {
  summary: string;
  warnings: string[];
  items: Proposal[];
}

const BONUS = ['bonusQuarter', 'bonusYear', 'vacation', 'thirteenth'];

interface Ctx {
  cal: CalendarInput;
  marks: Record<string, EventMark>;
  expenses: Expense[];
  reserve: number;
  now: string;
}

/** Ближайшее неотмеченное событие того же долга или вида дохода в пределах ±12 дней */
function matchEvent(ctx: Ctx, date: string, pred: (e: CalEvent) => boolean): CalEvent | null {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ctx.now;
  const list = eventsBetween(ctx.cal, addDays(d, -20), addDays(d, 12)).filter(e => pred(e) && !ctx.marks[e.key]?.done);
  return list.sort((a, b) => Math.abs(daysBetween(a.date, d)) - Math.abs(daysBetween(b.date, d)))[0] ?? null;
}

export function markDuplicates(txs: DraftTx[], expenses: Expense[]): DraftTx[] {
  const known = new Set(expenses.map(e => e.fingerprint ?? fingerprint(e.date, e.amount, e.note ?? '')));
  // совпадение даты и суммы при другом написании продавца — тоже вероятный дубль
  const loose = new Set(expenses.map(e => `${e.date}|${Math.round(e.amount * 100)}`));
  return txs.map(t => ({ ...t, duplicate: known.has(t.fingerprint) || loose.has(`${t.date}|${Math.round(t.amount * 100)}`) }));
}

let n = 0;
const pid = () => `p${n++}`;

/** Платёж по долгу или обязательный платёж в выписке → отметка «оплачено» в календаре */
function paymentMarks(txs: DraftTx[], ctx: Ctx, items: Proposal[]) {
  for (const t of txs) {
    if (t.income) continue;
    const upper = t.merchant.toUpperCase();
    let ev: CalEvent | null = null;
    const debtId = /ПОГАШ|ПЛАТ[ЕЁ]Ж ПО|КРЕДИТ|ВНЕСЕНИ|ЗАДОЛЖ|СПЛИТ|РАССРОЧ/.test(upper) ? guessDebt(t.merchant, ctx.cal.debts) : '';
    if (debtId) ev = matchEvent(ctx, t.date, e => e.kind === 'payment' && e.debtId === debtId);
    if (!ev && t.category === 'fixed') {
      // подписка или связь: по названию или по сумме (±2%)
      ev = matchEvent(ctx, t.date, e => e.key.startsWith('fix:') && (upper.includes(e.title.toUpperCase()) || Math.abs(e.amount - t.amount) <= e.amount * 0.02));
    }
    if (ev && !items.some(i => i.type === 'mark' && i.event.key === ev!.key)) items.push({ id: pid(), type: 'mark', on: true, event: ev, amount: t.amount });
  }
}

export function fromDrafts(txs: DraftTx[], ctx: Ctx, summary: string, extra: { cardBalance?: { amount: number; date: string } } = {}): Review {
  const items: Proposal[] = markDuplicates(txs, ctx.expenses)
    .filter(t => !t.income)
    .map(tx => ({ id: pid(), type: 'tx', on: !tx.skip && !tx.duplicate, tx }));
  paymentMarks(txs, ctx, items);
  if (extra.cardBalance) items.push({ id: pid(), type: 'card', on: true, balance: extra.cardBalance.amount, date: extra.cardBalance.date });
  const incomes = txs.filter(t => t.income);
  for (const t of incomes) {
    // вид поступления по подписи: «Зарплата» не должна закрыть ожидаемый «Аванс»
    const m = t.merchant.toUpperCase();
    const kind = /АВАНС/.test(m) ? 'advance' : /ЗАРПЛАТ|ЗАРАБОТН/.test(m) ? 'salary' : /ОТПУСК/.test(m) ? 'vacation' : /ПРЕМИ/.test(m) ? 'bonus' : null;
    const ev = matchEvent(ctx, t.date, e => e.kind === 'income' && (!kind || (kind === 'bonus' ? /^bonus/.test(e.incomeKind ?? '') : e.incomeKind === kind)));
    items.push({ id: pid(), type: 'income', on: !!ev, event: ev, amount: t.amount, date: t.date, bonus: !!ev?.incomeKind && BONUS.includes(ev.incomeKind) });
  }
  return { summary, warnings: [], items };
}

export function fromAi(r: AiResult, ctx: Ctx): Review {
  const items: Proposal[] = [];
  const byId = new Map(ctx.cal.debts.map(d => [d.id, d]));
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ctx.now;

  const expenseTx = r.transactions.filter(t => t.direction === 'expense' && t.amount > 0);
  const drafts = markDuplicates(expenseTx.map(t => draft(valid(t.date), t.amount, t.merchant, { category: t.category, source: t.card === 'credit' ? 'credit' : 'life' })), ctx.expenses);
  for (const tx of drafts) items.push({ id: pid(), type: 'tx', on: !tx.duplicate, tx });

  for (const d of r.debts) {
    const debt = byId.get(d.debtId);
    if (!debt || !(d.balance > 0)) continue;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(d.dueDate) ? d.dueDate : '';
    // платёж, к которому относится обязательный платёж с экрана банка: ближайший неоплаченный этого долга
    const event = d.minPayment > 0 ? matchEvent(ctx, due || ctx.now, e => e.kind === 'payment' && e.debtId === debt.id && !e.key.endsWith(':close')) : null;
    items.push({ id: pid(), type: 'debt', on: Math.abs(d.balance - debt.balance) >= 1 || !!event, debt, balance: d.balance, minPayment: d.minPayment, dueDate: due, event });
  }

  // платежи: из чеков и из истории операций (погашения)
  const pays: { debtId: string; amount: number; date: string; merchant?: string }[] = [...r.payments, ...r.transactions.filter(t => t.direction === 'debt_payment').map(t => ({ debtId: '', amount: t.amount, date: t.date, merchant: t.merchant }))];
  for (const p of pays) {
    const debtId = p.debtId || guessDebt(p.merchant ?? '', ctx.cal.debts);
    if (!debtId) continue;
    const ev = matchEvent(ctx, valid(p.date), e => e.kind === 'payment' && e.debtId === debtId);
    if (ev && !items.some(i => i.type === 'mark' && i.event.key === ev.key)) items.push({ id: pid(), type: 'mark', on: true, event: ev, amount: p.amount });
  }

  const incomes = [...r.incomes, ...r.transactions.filter(t => t.direction === 'income').map(t => ({ kind: 'other' as const, amount: t.amount, date: t.date }))];
  for (const inc of incomes) {
    if (items.some(i => i.type === 'income' && i.amount === inc.amount && i.date === valid(inc.date))) continue;
    const ev = matchEvent(ctx, valid(inc.date), e => e.kind === 'income' && (inc.kind === 'other' || e.incomeKind === inc.kind));
    items.push({ id: pid(), type: 'income', on: !!ev, event: ev, amount: inc.amount, date: valid(inc.date), bonus: BONUS.includes(inc.kind) || (!!ev?.incomeKind && BONUS.includes(ev.incomeKind)) });
  }

  if (r.savingsBalance > 0) items.push({ id: pid(), type: 'reserve', on: Math.abs(r.savingsBalance - ctx.reserve) >= 1, balance: r.savingsBalance });
  if (r.accountBalance) items.push({ id: pid(), type: 'card', on: true, balance: r.accountBalance, date: valid(r.balanceDate) });
  // подписки и связь, оплаченные в выписке, отмечаются в календаре
  paymentMarks(drafts.filter(t => t.category === 'fixed'), ctx, items);

  const warnings = [...r.warnings];
  if (expenseTx.some(t => t.card === 'credit')) warnings.unshift('Есть траты с кредитной карты — это нарушение плана.');
  return { summary: r.summary, warnings, items };
}

/** Долг по подписи операции: «Погашение Т-Банк» → долг, в названии которого есть тот же банк */
const BANKS = [['Т-БАНК', 'ТИНЬК', 'TINKOFF', 'T-BANK'], ['СБЕР', 'SBER'], ['АЛЬФА', 'ALFA'], ['СПЛИТ', 'SPLIT', 'ЯНДЕКС'], ['ВТБ', 'VTB'], ['ОЗОН', 'OZON'], ['ГАЗПРОМ'], ['РАЙФФ', 'RAIFF'], ['ПОЧТА'], ['МТС'], ['СОВКОМ', 'ХАЛВА'], ['РАССРОЧ']];

function guessDebt(text: string, debts: Debt[]): string {
  const s = text.toUpperCase();
  const open = debts.filter(d => !d.closed);
  for (const group of BANKS) {
    if (!group.some(k => s.includes(k))) continue;
    const hits = open.filter(d => group.some(k => d.name.toUpperCase().includes(k)));
    // кредит и кредитка одного банка: «кредит» в подписи выбирает кредит
    const pick = hits.length > 1 ? hits.find(d => (d.kind === 'loan') === /КРЕДИТ(?!Н)/.test(s)) ?? hits[0] : hits[0];
    if (pick) return pick.id;
  }
  return '';
}

/* ---------- Текст со скриншота банка (ВТБ, Сбер, Т-Банк) ---------- */

export type BankProposal =
  /** перевод человеку: себе (не трата) или трата — решает человек */
  | { id: string; type: 'person'; on: boolean; name: string; key: string; amount: number; date: string; incoming: boolean; choice: 'self' | 'spend' | 'other' | null; category: CategoryId; fingerprint: string }
  /** между своими счетами: резерв ↔ карта; пополнение по воскресеньям закрывает отметку wk: */
  | { id: string; type: 'transfer'; on: boolean; amount: number; date: string; dir: 'toCard' | 'toReserve'; event: CalEvent | null }
  /** возврат гасит трату */
  | { id: string; type: 'refund'; on: boolean; amount: number; date: string; name: string; expense: Expense }
  /** проценты на накопительный — в резерв */
  | { id: string; type: 'interest'; on: boolean; amount: number; date: string }
  /** точный обязательный платёж с экрана банка */
  | { id: string; type: 'due'; on: boolean; debt: Debt; event: CalEvent; amount: number; date: string }
  /** не трата и ничего менять не нужно — показать, почему */
  | { id: string; type: 'info'; on: false; text: string; amount: number; date: string };

export type AnyProposal = Proposal | BankProposal;

export interface BankCtx extends Ctx {
  memory: Record<string, MemoryRule>;
}

/** Категория банка → категория плана (правила протокола) */
const SPEND: Record<string, CategoryId> = {
  'Транспорт': 'transport', 'Супермаркеты': 'groceries', 'Кафе и рестораны': 'fun', 'Фастфуд': 'fun', 'Алкоголь': 'fun', 'Табак': 'tobacco',
  'Аптеки': 'health', 'Медицина': 'health', 'Красота': 'beauty', 'Такси': 'taxi', 'Маркетплейсы': 'shopping', 'Дом и ремонт': 'shopping',
  'Украшения и бижутерия': 'shopping', 'Одежда': 'shopping', 'Одежда и обувь': 'shopping', 'Турагентства': 'fun', 'Развлечения': 'fun',
  'Цифровой контент': 'fixed', 'Связь': 'fixed', 'Животные': 'shopping', 'Образование': 'fun', 'Спорт': 'fixed', 'Прочие расходы': 'fun',
  'Наличные': 'fun', 'Отели': 'fun', 'Авиабилеты': 'fun', 'Ж/д билеты': 'transport', 'Топливо': 'transport', 'Автоуслуги': 'transport',
};
const TO_PERSON = new Set(['Переводы людям', 'Перевод по СБП', 'Переводы', 'Входящие переводы']);
const DEBT_PAY = new Set(['Погашение кредита', 'Списание кредита', 'Платежи и переводы']);
const REFUND = new Set(['Возврат средств', 'Другие зачисления', 'Кэшбэк']);
const INTEREST = new Set(['Выплата процентов', 'Вклады и накопления']);
const SALARY = new Set(['Поступление заработной платы', 'Зарплата']);

/** Платёж в календаре на ту же сумму (±1 ₽) в пределах ±days дней: неоплаченный — отметить, оплаченный — уже учтён */
function samePayment(ctx: Ctx, date: string, amount: number, days: number, pred: (e: CalEvent) => boolean = () => true): { event: CalEvent; done: boolean } | null {
  const list = eventsBetween(ctx.cal, addDays(date, -days), addDays(date, days)).filter(e => e.kind === 'payment' && pred(e));
  const near = (e: CalEvent) => Math.abs(daysBetween(e.date, date));
  const open = list.filter(e => !ctx.marks[e.key]?.done && Math.abs(e.amount - amount) <= 1).sort((a, b) => near(a) - near(b))[0];
  if (open) return { event: open, done: false };
  const done = list.filter(e => ctx.marks[e.key]?.done && Math.abs((ctx.marks[e.key].amount ?? e.amount) - amount) <= 1)[0];
  return done ? { event: done, done: true } : null;
}

/** Траты, которые уже есть: тот же отпечаток или та же дата и сумма (каждая внесённая закрывает одну строку скриншота) */
function dedupe(txs: DraftTx[], expenses: Expense[]): DraftTx[] {
  const pool = new Map<string, Expense[]>();
  for (const e of expenses) {
    const k = `${e.date}|${Math.round(e.amount * 100)}`;
    pool.set(k, [...(pool.get(k) ?? []), e]);
  }
  const take = (k: string, pick: (e: Expense) => boolean) => {
    const list = pool.get(k) ?? [];
    const i = list.findIndex(pick);
    return i < 0 ? null : list.splice(i, 1)[0];
  };
  const out = txs.map(t => ({ ...t }));
  // сначала точные отпечатки, потом свободные по дате и сумме — так вторая поездка не «съедает» первую
  for (const t of out) if (take(`${t.date}|${Math.round(t.amount * 100)}`, e => e.fingerprint === t.fingerprint)) t.duplicate = true;
  for (const t of out) {
    if (t.duplicate) continue;
    const e = take(`${t.date}|${Math.round(t.amount * 100)}`, x => !x.fingerprint?.includes('#')) ?? null;
    if (e) { t.duplicate = true; if (!e.fingerprint?.includes('#')) t.linkId = e.id; }
  }
  return out;
}

export function fromBank(p: BankParse, ctx: BankCtx): { summary: string; warnings: string[]; items: AnyProposal[] } {
  const items: AnyProposal[] = [];
  const warnings: string[] = [];
  const debts = ctx.cal.debts;
  const bankWord = p.bank === 'tbank' ? 'Т-БАНК' : p.bank === 'sber' ? 'СБЕР' : p.bank === 'vtb' ? 'ВТБ' : '';
  const creditId = p.credit && bankWord ? guessDebt(`${bankWord} КРЕДИТНАЯ КАРТА`, debts.filter(d => d.kind === 'card')) : '';
  const source: Source = creditId ? 'credit' : 'life';
  const info = (text: string, o: BankOp) => items.push({ id: pid(), type: 'info', on: false, text, amount: o.amount, date: o.date });
  const spends: DraftTx[] = [];

  for (const o of p.ops) {
    const cat = o.cat ?? bankCat(o.name) ?? '';
    const key = normName(o.name);
    const mem = ctx.memory[key];
    const fp = `${fingerprint(o.date, o.amount, o.name)}#${o.ord}`;
    const incoming = o.sign === '+';
    const person = isPerson(o.name);

    if (mem === 'skip') { info(`${o.name}: пропуск по памяти`, o); continue; }

    if (cat === 'Между своими счетами' || /между своими/i.test(o.name)) {
      if (creditId) {
        const debt = debts.find(d => d.id === creditId)!;
        if (incoming) {
          const ev = matchEvent(ctx, o.date, e => e.kind === 'payment' && e.debtId === creditId);
          if (ev && Math.abs(daysBetween(ev.date, o.date)) <= 10) items.push({ id: pid(), type: 'mark', on: true, event: ev, amount: o.amount });
          else info(`Пополнение ${debt.short} — погашение, отметка в календаре уже есть или не нашлась`, o);
        } else info(`С ${debt.short} между счетами — это долг, а не трата`, o);
        continue;
      }
      const dir = o.sign === '-' ? 'toReserve' : 'toCard';
      const wk = dir === 'toCard' ? eventsBetween(ctx.cal, addDays(o.date, -2), addDays(o.date, 1)).find(e => e.kind === 'weekly' && !ctx.marks[e.key]?.done) ?? null : null;
      items.push({ id: pid(), type: 'transfer', on: true, amount: o.amount, date: o.date, dir, event: wk });
      continue;
    }

    if (TO_PERSON.has(cat) || person) {
      if (incoming) {
        if (mem === 'self') { info(`Перевод от себя (${o.name}) — не доход`, o); continue; }
        items.push({ id: pid(), type: 'person', on: false, name: o.name, key, amount: o.amount, date: o.date, incoming: true, choice: null, category: 'fun', fingerprint: fp });
        continue;
      }
      if (creditId) { warnings.push(`${ddmm(o.date)}: перевод ${rub(o.amount)} с кредитки — это новый долг, а не трата.`); info(`Перевод с кредитки ${o.name}`, o); continue; }
      const pay = samePayment(ctx, o.date, o.amount, 3);
      if (pay && !pay.done) { items.push({ id: pid(), type: 'mark', on: true, event: pay.event, amount: o.amount, selfKey: key }); continue; }
      if (pay?.done) { info(`${pay.event.title}: уже отмечено, перевод себе — не трата`, o); continue; }
      if (mem === 'self') { info(`Перевод себе (${o.name}) — не трата`, o); continue; }
      const choice = mem ? 'spend' : null;
      items.push({ id: pid(), type: 'person', on: !!choice, name: o.name, key, amount: o.amount, date: o.date, incoming: false, choice, category: mem ?? 'fun', fingerprint: fp });
      continue;
    }

    if (cat === 'Услуги банка') { info(`${o.name}: плата банку по кредитке — видна в долге, не трата из недельных денег`, o); continue; }
    if (DEBT_PAY.has(cat) || /погашени|списание кредита/i.test(o.name)) {
      if (cat === 'Платежи и переводы' && !/яндекс|сплит|кредит/i.test(o.name)) { /* обычный платёж — дальше как трата */ } else {
        const debtId = guessDebt(`${o.name} ${bankWord} ${cat}`, debts);
        const pay = debtId ? samePayment(ctx, o.date, o.amount, 7, e => e.debtId === debtId) ?? (() => {
          const ev = matchEvent(ctx, o.date, e => e.kind === 'payment' && e.debtId === debtId);
          return ev && Math.abs(daysBetween(ev.date, o.date)) <= 7 ? { event: ev, done: false } : null;
        })() : null;
        if (pay && !pay.done) items.push({ id: pid(), type: 'mark', on: true, event: pay.event, amount: o.amount });
        else info(`${o.name}: погашение${pay?.done ? ', уже отмечено' : ''} — не трата`, o);
        continue;
      }
    }
    if (INTEREST.has(cat) && incoming) { items.push({ id: pid(), type: 'interest', on: true, amount: o.amount, date: o.date }); continue; }
    if (SALARY.has(cat) || (incoming && /зарплат|заработн|аванс/i.test(o.name))) {
      const ev = matchEvent(ctx, o.date, e => e.kind === 'income');
      items.push({ id: pid(), type: 'income', on: !!ev, event: ev, amount: o.amount, date: o.date, bonus: !!ev?.incomeKind && BONUS.includes(ev.incomeKind) });
      continue;
    }
    if (REFUND.has(cat) || (incoming && (SPEND[cat] || !cat))) {
      const exp = ctx.expenses.filter(e => e.date <= o.date && e.date >= addDays(o.date, -7) && (Math.abs(e.amount - o.amount) <= 1 || normName(e.note ?? '') === key))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (exp) items.push({ id: pid(), type: 'refund', on: true, amount: o.amount, date: o.date, name: o.name, expense: exp });
      else info(`${o.name}: +${rub(o.amount)} — возврат или зачисление, трату под него не нашёл`, o);
      continue;
    }
    if (incoming) { info(`${o.name}: +${rub(o.amount)}`, o); continue; }

    // подписки и связь: сначала обязательные платежи календаря
    if (cat === 'Цифровой контент' || cat === 'Связь') {
      const fix = samePayment(ctx, o.date, o.amount, 5, e => e.key.startsWith('fix:'));
      if (fix && !fix.done) { items.push({ id: pid(), type: 'mark', on: true, event: fix.event, amount: o.amount }); continue; }
      if (fix?.done) { info(`${fix.event.title}: уже отмечено`, o); continue; }
    }
    const suggested: CategoryId = (mem && mem !== 'self' ? mem : null) ?? SPEND[cat] ?? categorize(o.name) ?? 'fun';
    spends.push({ ...draft(o.date, o.amount, o.name, { category: suggested, source }), fingerprint: fp, skip: false, suggested, nameKey: key, ...(o.fromHeader ? { fromHeader: true } : {}), ...(creditId ? { creditCard: creditId } : {}) });
  }

  const txs = dedupe(spends, ctx.expenses);
  items.unshift(...txs.map(tx => ({ id: pid(), type: 'tx' as const, on: !tx.duplicate, tx })));

  for (const d of p.dues) {
    const debtId = guessDebt(`${bankWord} ${/кредитн/i.test(d.text) || p.bank === 'sber' ? 'КРЕДИТНАЯ КАРТА' : ''}`, debts);
    const debt = debts.find(x => x.id === debtId);
    const ev = debt ? matchEvent({ ...ctx, marks: {} }, d.date, e => e.kind === 'payment' && e.debtId === debt.id && !e.key.endsWith(':close')) : null;
    if (debt && ev) items.push({ id: pid(), type: 'due', on: Math.abs(ev.amount - d.amount) >= 1 || ev.date !== d.date, debt, event: ev, amount: d.amount, date: d.date });
  }
  if (p.balances.card != null) items.push({ id: pid(), type: 'card', on: true, balance: p.balances.card, date: ctx.now });
  if (p.balances.reserve != null) items.push({ id: pid(), type: 'reserve', on: Math.abs(p.balances.reserve - ctx.reserve) >= 1, balance: p.balances.reserve });

  // полнота: сумма списаний дня против заголовка
  for (const d of p.days) {
    if (d.total == null) continue;
    if (d.total - d.out > 1) warnings.push(`Часть ${ddmm(d.date)} не видна: не хватает ${rub(d.total - d.out)} — пришлите ещё скриншот этого дня.`);
    else if (d.out - d.total > 1) warnings.push(`${ddmm(d.date)}: операций на ${rub(d.out)}, а в заголовке дня ${rub(d.total)} — проверьте суммы.`);
  }
  for (const t of txs) if (t.fromHeader) warnings.push(`${ddmm(t.date)} «${t.merchant}»: сумма взята из заголовка дня — проверьте копейки.`);

  const newTx = txs.filter(t => !t.duplicate);
  const marks = items.filter(i => i.type === 'mark').length;
  const transfers = items.filter(i => i.type === 'transfer' || i.type === 'person' || (i.type === 'info' && /перевод/i.test(i.text))).length;
  const parts = [`траты: ${newTx.length} на ${rub(newTx.reduce((s, t) => s + t.amount, 0))}`, marks ? `отметок платежей: ${marks}` : '', transfers ? `переводов: ${transfers}` : '',
    txs.length - newTx.length ? `повторов пропущено: ${txs.length - newTx.length}` : ''].filter(Boolean);
  const bankName = { vtb: 'ВТБ', sber: 'Сбер', tbank: 'Т-Банк', unknown: 'банк' }[p.bank];
  const summary = `${bankName}${creditId ? `, кредитка ${debts.find(d => d.id === creditId)?.short ?? ''}` : ''}: ${parts.join(', ')}.`;
  return { summary: summary.charAt(0).toUpperCase() + summary.slice(1), warnings, items };
}

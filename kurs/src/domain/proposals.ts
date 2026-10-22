// Ответ разбора (Claude, CSV или текст) → список предложений «что обновить в приложении».
// Человек смотрит список, снимает лишние галочки и нажимает «Применить».
import type { AiResult } from './ai';
import { eventsBetween, type CalendarInput } from './calendar';
import { fingerprint } from './categorize';
import { addDays, daysBetween } from './dates';
import { draft, type DraftTx } from './statements';
import type { CalEvent, Debt, EventMark, Expense } from './types';

export type Proposal =
  | { id: string; type: 'tx'; on: boolean; tx: DraftTx }
  | { id: string; type: 'debt'; on: boolean; debt: Debt; balance: number; minPayment: number; dueDate: string; event: CalEvent | null }
  | { id: string; type: 'mark'; on: boolean; event: CalEvent; amount: number }
  | { id: string; type: 'income'; on: boolean; event: CalEvent | null; amount: number; date: string; bonus: boolean }
  | { id: string; type: 'reserve'; on: boolean; balance: number };

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

export function fromDrafts(txs: DraftTx[], ctx: Ctx, summary: string): Review {
  const items: Proposal[] = markDuplicates(txs, ctx.expenses)
    .filter(t => !t.income)
    .map(tx => ({ id: pid(), type: 'tx', on: !tx.skip && !tx.duplicate, tx }));
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

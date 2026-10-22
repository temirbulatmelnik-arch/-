// Календарь платежей и поступлений: разовые события из плана + ежемесячный шаблон + понедельники.
import { addDays, dayIn, monthKey, weekStart } from './dates';
import type { CalEvent, Debt, EventMark, FixedItem, IncomeTemplate, WeeklyOverride } from './types';
import { weeklyLimit } from './plan';

/** Ориентировочный обязательный платёж по долгу в месяце */
export function estimatePayment(d: Debt, month: string): number {
  if (d.closed || d.balance <= 0.5) return 0;
  const interest = (d.balance * d.rate) / 12;
  switch (d.rule.type) {
    case 'fixed':
    case 'annuity':
      return Math.min(d.rule.amount, Math.ceil(d.balance + interest));
    case 'interestPlus':
      return Math.min(Math.ceil(d.balance + interest), Math.max(d.rule.min ?? 0, Math.round(interest + d.rule.share * d.balance)));
    case 'schedule':
      return d.rule.items.filter(i => monthKey(i.date) === month).reduce((s, i) => s + i.amount, 0);
  }
}

/** Новый платёж по аннуитету на оставшийся срок — для Сплита после досрочки */
export function annuity(balance: number, rate: number, months: number): number {
  if (months <= 0) return balance;
  const r = rate / 12;
  return Math.round((balance * r) / (1 - (1 + r) ** -months));
}

export interface CalendarInput {
  debts: Debt[];
  incomes: IncomeTemplate[];
  fixed: FixedItem[];
  oneOff: CalEvent[];
  templateFrom: string;
  weeklyOverrides: WeeklyOverride[];
  /** точная сумма и дата платежа со скриншота банка вместо оценки */
  overrides?: Record<string, { amount?: number; date?: string }>;
}

/** Все события в диапазоне дат [from, to] */
export function eventsBetween(input: CalendarInput, from: string, to: string): CalEvent[] {
  const out: CalEvent[] = [];
  const byId = new Map(input.debts.map(d => [d.id, d]));
  const closedBefore = (debtId: string | undefined, date: string) => {
    const d = debtId ? byId.get(debtId) : undefined;
    return !!d && d.closed && (!d.closedOn || d.closedOn < date);
  };

  for (const e of input.oneOff) {
    if (e.date < from || e.date > to) continue;
    if (e.kind === 'payment' && closedBefore(e.debtId, e.date)) continue;
    out.push(e);
  }

  for (let m = monthKey(from); m <= monthKey(to); m = nextMonth(m)) {
    if (m < input.templateFrom) continue;
    const push = (e: CalEvent) => { if (e.date >= from && e.date <= to) out.push(e); };

    if (input.fixed.length) {
      const day = Math.min(...input.fixed.map(f => f.day));
      push({
        key: `fix:${m}`, date: dayIn(m, day), dateMode: 'exact', kind: 'payment',
        title: input.fixed.map(f => f.name).join(', '), amount: input.fixed.reduce((s, f) => s + f.amount, 0),
      });
    }
    for (const d of input.debts) {
      if (d.closed || d.balance <= 0.5) continue;
      if (d.rule.type === 'schedule') {
        d.rule.items.filter(i => monthKey(i.date) === m).forEach((i, n) => push({
          key: `pay:${d.id}:${m}${n ? `:${n}` : ''}`, date: i.date, dateMode: 'exact', kind: 'payment', title: d.short, amount: i.amount, debtId: d.id,
        }));
        continue;
      }
      const amount = estimatePayment(d, m);
      if (!amount) continue;
      const card = d.kind === 'card';
      push({
        key: `pay:${d.id}:${m}`, date: dayIn(m, d.dueDay), dateMode: card ? 'until' : 'exact', kind: 'payment',
        title: card ? `${d.short}, минимальный` : d.short, amount, approx: d.rule.type === 'interestPlus', debtId: d.id,
      });
    }
    for (const inc of input.incomes) {
      if (inc.months && !inc.months.includes(Number(m.slice(5, 7)))) continue;
      push({
        key: `inc:${inc.kind}:${m}`, date: dayIn(m, inc.day), dateMode: 'approx', kind: 'income',
        title: inc.name, amount: inc.amount, approx: true, incomeKind: inc.kind,
      });
    }
  }

  // понедельники: перевести недельный лимит на карту жизни
  for (let mon = weekStart(from) < from ? addDays(weekStart(from), 7) : weekStart(from); mon <= to; mon = addDays(mon, 7)) {
    out.push({
      key: `wk:${mon}`, date: mon, dateMode: 'exact', kind: 'weekly', title: 'Недельный лимит на карту жизни',
      amount: weeklyLimit(input.debts, mon, input.weeklyOverrides),
    });
  }

  const rank = { payment: 0, weekly: 1, income: 2 } as const;
  const ov = input.overrides ?? {};
  return out.map(e => (ov[e.key] ? { ...e, amount: ov[e.key].amount ?? e.amount, date: ov[e.key].date ?? e.date, approx: ov[e.key].amount != null ? false : e.approx } : e)).sort((a, b) => a.date.localeCompare(b.date) || rank[a.kind] - rank[b.kind] || a.title.localeCompare(b.title));
}

const nextMonth = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
};

export type Urgency = 'done' | 'overdue' | 'soon' | 'later';

/** Красное — просрочено или осталось ≤ 3 дней */
export function urgency(e: CalEvent, mark: EventMark | undefined, now: string): Urgency {
  if (mark?.done) return 'done';
  if (e.date < now) return e.kind === 'payment' ? 'overdue' : 'later';
  if (e.kind === 'payment' && e.date <= addDays(now, 3)) return 'soon';
  return 'later';
}

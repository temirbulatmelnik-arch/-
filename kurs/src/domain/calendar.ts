// Календарь платежей и поступлений: разовые события из плана + ежемесячный шаблон + воскресные пополнения карты жизни.
import { addDays, dayIn, monthKey, weekStart } from './dates';
import type { CalEvent, Debt, EventMark, FixedItem, IncomeTemplate, WeeklyOverride } from './types';
import { weeklyLimit } from './plan';
import { workdayOnOrBefore } from './workdays';

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

/** Все события в диапазоне дат [from, to]. Перенос даты вручную учитывается: генерируем с запасом и фильтруем после. */
export function eventsBetween(input: CalendarInput, rangeFrom: string, rangeTo: string): CalEvent[] {
  const from = addDays(rangeFrom, -35), to = addDays(rangeTo, 35);
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
    const push = (e: CalEvent) => { if (e.date >= from && e.date <= to) out.push(e); };

    // обязательные платежи — у каждого своя дата; работают с собственного месяца, а не с начала шаблона
    for (const f of input.fixed) {
      if (m < (f.from ?? input.templateFrom)) continue;
      push({ key: `fix:${f.id}:${m}`, date: dayIn(m, f.day), dateMode: 'exact', kind: 'payment', title: f.name, amount: f.amount, note: f.note });
    }

    if (m < input.templateFrom) continue;
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

  // воскресенье вечером: долить карту жизни из резерва до лимита следующей недели (ключ — по её понедельнику).
  // В календаре — полный лимит как оценка; сколько долито на самом деле, записывает закрытие недели.
  for (let sun = addDays(weekStart(from), 6); sun <= to; sun = addDays(sun, 7)) {
    const mon = addDays(sun, 1);
    out.push({
      key: `wk:${mon}`, date: sun, dateMode: 'exact', kind: 'weekly', title: 'Долить карту жизни до лимита',
      amount: weeklyLimit(input.debts, mon, input.weeklyOverrides),
    });
  }

  const rank = { payment: 0, weekly: 1, income: 2 } as const;
  const ov = input.overrides ?? {};
  return out
    // деньги приходят только в рабочий день: выходной или праздник — значит, накануне
    .map(e => {
      if (e.kind !== 'income' || e.dateMode === 'month' || ov[e.key]?.date) return e;
      const date = workdayOnOrBefore(e.date);
      return date === e.date ? e : { ...e, date, planned: e.date };
    })
    .map(e => (ov[e.key] ? { ...e, amount: ov[e.key].amount ?? e.amount, date: ov[e.key].date ?? e.date, approx: ov[e.key].amount != null ? false : e.approx, moved: ov[e.key].date != null && ov[e.key].date !== e.date } : e))
    .filter(e => e.date >= rangeFrom && e.date <= rangeTo)
    .sort((a, b) => a.date.localeCompare(b.date) || rank[a.kind] - rank[b.kind] || a.title.localeCompare(b.title));
}

const nextMonth = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
};

export type EventGroup = 'debt' | 'fixed' | 'income' | 'weekly' | 'other';

/** К какой группе относится строка календаря: кредиты, обязательные, поступления, пополнения карты, разовые */
export function eventGroup(e: CalEvent): EventGroup {
  if (e.kind === 'income') return 'income';
  if (e.kind === 'weekly') return 'weekly';
  if (e.debtId) return 'debt';
  if (e.key.startsWith('fix:')) return 'fixed';
  return 'other';
}

export type Urgency = 'done' | 'overdue' | 'soon' | 'later';

/** Красное — просрочено или осталось ≤ 3 дней */
export function urgency(e: CalEvent, mark: EventMark | undefined, now: string): Urgency {
  if (mark?.done) return 'done';
  if (e.date < now) return e.kind === 'payment' ? 'overdue' : 'later';
  if (e.kind === 'payment' && e.date <= addDays(now, 3)) return 'soon';
  return 'later';
}

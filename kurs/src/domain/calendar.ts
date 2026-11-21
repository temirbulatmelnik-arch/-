import { partialPayments } from './funds';
// Календарь платежей и поступлений: разовые события из плана + ежемесячный шаблон + воскресные пополнения карты жизни.
import type { AccountBook } from './accounts';
import { kopecks, LIFE_ACCOUNT, RESERVE_ACCOUNT } from './accounts';
import { addDays, dayIn, monthKey, weekStart } from './dates';
import type { CalEvent, CalendarOverride, Debt, EventMark, FixedItem, IncomeKind, IncomeTemplate, WeeklyOverride } from './types';
import { bridgeWeek, type Bridge } from './bridge';
import { weeklyLimit } from './plan';
import { isRegularWork, workEvents, type PayrollProfile } from './payroll';
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
  accountBook?: AccountBook;
  work?: PayrollProfile | null;
  marks?: Record<string, EventMark>;
  incomes: IncomeTemplate[];
  fixed: FixedItem[];
  oneOff: CalEvent[];
  templateFrom: string;
  weeklyOverrides: WeeklyOverride[];
  /** точная сумма и дата платежа со скриншота банка вместо оценки */
  overrides?: Record<string, CalendarOverride>;
  /** мост на кредитке: в его недели из резерва доливают по плану моста, а не весь лимит */
  bridge?: Bridge | null;
}

/** Все события в диапазоне дат [from, to]. Перенос даты вручную учитывается: генерируем с запасом и фильтруем после. */
export function eventsBetween(input: CalendarInput, rangeFrom: string, rangeTo: string): CalEvent[] {
  const from = addDays(rangeFrom, -35), to = addDays(rangeTo, 35);
  const out: CalEvent[] = [];
  const byId = new Map(input.debts.map(d => [d.id, d]));
  const journalLoans = new Map(input.accountBook?.operations.filter(op => op.type === 'loan_disbursement' && op.status === 'confirmed' && op.eventKey)
    .map(op => [op.eventKey!, op]));
  const historicalLoans = new Map(input.accountBook?.historicalLoans?.map(op => [op.eventKey, op]));
  const ov = input.overrides ?? {};
  const seen = new Set<string>();
  const push = (event: CalEvent) => {
    if (seen.has(event.key)) return;
    seen.add(event.key);
    out.push(event);
  };
  const closedBefore = (debtId: string | undefined, date: string) => {
    const d = debtId ? byId.get(debtId) : undefined;
    return !!d && d.closed && (!d.closedOn || d.closedOn < date);
  };

  // A recurring template cannot prove an overdue payment from before a later bank snapshot.
  // Explicit events, manual overrides and payment marks still preserve the historical row.
  const unconfirmedHistory = (debt: Debt, key: string, date: string) => Boolean(debt.bankBalance &&
    monthKey(date) < monthKey(debt.bankBalance.date) && !ov[key] && !input.marks?.[key]);
  for (const e of input.oneOff) {
    if (e.date < from || e.date > to) continue;
    if (e.kind === 'payment' && !input.marks?.[e.key]?.done && closedBefore(e.debtId, e.date)) continue;
    const incomeKind = e.incomeKind ?? (e.kind === 'income' && e.key.startsWith('inc:') ? e.key.split(':')[1] as IncomeKind : undefined);
    push(incomeKind ? { ...e, incomeKind } : e);
  }

  for (let m = monthKey(from); m <= monthKey(to); m = nextMonth(m)) {
    const within = (e: CalEvent) => { if (e.date >= from && e.date <= to) push(e); };

    // обязательные платежи — у каждого своя дата; работают с собственного месяца, а не с начала шаблона
    for (const f of input.fixed) {
      if (m < (f.from ?? input.templateFrom)) continue;
      within({ key: `fix:${f.id}:${m}`, date: dayIn(m, f.day), dateMode: 'exact', kind: 'payment', title: f.name, amount: f.amount, note: f.note });
    }

    if (m < input.templateFrom) continue;
    for (const d of input.debts) {
      const open = !d.closed && d.balance > 0.5;
      if (d.rule.type === 'schedule') {
        d.rule.items.filter(i => monthKey(i.date) === m).forEach((i, n) => {
          const key = `pay:${d.id}:${m}${n ? `:${n}` : ''}`;
          if ((open || input.marks?.[key]?.done) && !unconfirmedHistory(d, key, i.date)) within({
            key, date: i.date, dateMode: 'exact', kind: 'payment', title: d.short, amount: i.amount, debtId: d.id,
          });
        });
        continue;
      }
      const card = d.kind === 'card';
      const key = `pay:${d.id}:${m}`, date = dayIn(m, d.dueDay);
      if (!open && !input.marks?.[key]?.done) continue;
      const amount = open ? estimatePayment(d, m) : input.marks?.[key]?.amount ?? 0;
      if (!amount) continue;
      if (unconfirmedHistory(d, key, date)) continue;
      within({
        key, date, dateMode: card ? 'until' : 'exact', kind: 'payment',
        title: card ? `${d.short}, минимальный` : d.short, amount, approx: d.rule.type === 'interestPlus', debtId: d.id,
      });
    }
    for (const inc of input.incomes) {
      const key = `inc:${inc.kind}:${m}`;
      if (input.work && (isRegularWork(inc.kind) || inc.kind === 'vacation' || inc.kind === 'bonusQuarter' || inc.kind === 'bonusYear') &&
          !input.marks?.[key]?.done && !(ov[key] && (inc.kind === 'bonusQuarter' || inc.kind === 'bonusYear'))) continue;
      if (inc.months && !inc.months.includes(Number(m.slice(5, 7)))) continue;
      within({
        key: `inc:${inc.kind}:${m}`, date: dayIn(m, inc.day), dateMode: 'approx', kind: 'income',
        title: inc.name, amount: inc.amount, approx: true, incomeKind: inc.kind,
      });
    }
  }

  // воскресенье вечером: долить карту жизни из резерва до лимита следующей недели (ключ — по её понедельнику).
  // В календаре — полный лимит как оценка; сколько долито на самом деле, записывает закрытие недели.
  for (let sun = addDays(weekStart(from), 6); sun <= to; sun = addDays(sun, 7)) {
    const mon = addDays(sun, 1);
    push({
      key: `wk:${mon}`, date: sun, dateMode: 'exact', kind: 'weekly', title: 'Долить карту жизни до лимита',
      amount: bridgeWeek(input.bridge, mon)?.fromReserve ?? weeklyLimit(input.debts, mon, input.weeklyOverrides),
    });
  }

  for (const plan of input.accountBook?.splitPlans ?? []) {
    plan.schedule.forEach((payment, index) => {
      const key = `split-plan:${plan.id}:${payment.date}:${index}`;
      if (closedBefore(plan.debtId, payment.date) && !input.marks?.[key]?.done) return;
      push({
        key, date: payment.date, dateMode: 'exact', kind: 'payment', title: plan.name, amount: payment.amount, debtId: plan.debtId,
      });
    });
  }
  if (input.work) {
    const sourceMarks = input.marks ?? {};
    const work = { ...input.work, payDates: { ...input.work.payDates } };
    const canonicalMarks = { ...sourceMarks };
    for (const op of input.accountBook?.operations ?? []) {
      if (op.type === 'income' && op.status === 'confirmed' && op.fundingSource !== 'borrowed' && op.eventKey) {
        canonicalMarks[op.eventKey] = { done: true, amount: op.amount, paidDate: op.date, at: op.at ?? op.date };
      }
    }
    for (const [key, alias] of Object.entries(work.aliases ?? {})) {
      if (canonicalMarks[alias]?.done) canonicalMarks[key] = canonicalMarks[alias];
    }
    for (const [key, custom] of Object.entries(ov)) {
      if (custom.date && !canonicalMarks[key]?.done && !work.payDates[key]) work.payDates[key] = custom.date;
    }
    // Сначала выбираем однозначные прежние события, затем используем их отметки при расчёте НДФЛ.
    const candidates = workEvents(work, from, to, canonicalMarks);
    const aliases = new Map<string, CalEvent>();
    const used = new Set<string>();
    for (const e of candidates) {
      const found = out.filter(old => !journalLoans.has(old.key) && !historicalLoans.has(old.key) && ov[old.key]?.economicType !== 'non_income' &&
        old.economicType !== 'loan_disbursement' && old.kind === 'income' && !used.has(old.key) && old.incomeKind === e.incomeKind &&
        (old.key === e.key || (isRegularWork(e.incomeKind) && (old.date === e.nominalDate || old.date === e.expectedPayDate))));
      const explicit = work.aliases?.[e.key];
      const old = (explicit ? out.find(o => o.key === explicit && !journalLoans.has(o.key) && !historicalLoans.has(o.key)) : undefined) ??
        found.find(old => old.key === e.key) ?? (found.length === 1 ? found[0] : undefined);
      if (old) { aliases.set(e.key, old); used.add(old.key); }
    }
    for (const [key, old] of aliases) {
      const mark = canonicalMarks[old.key];
      if (mark?.done) canonicalMarks[key] = { ...mark, paidDate: mark.paidDate ?? paidOn(old, mark) };
      const customDate = ov[old.key]?.date;
      if (customDate && !mark?.done) work.payDates[key] = customDate;
    }
    const modelled = workEvents(work, from, to, canonicalMarks);
    const recognised = new Set(modelled.map(e => e.key));
    const remaining = out.filter(e => !used.has(e.key) && !recognised.has(e.key) &&
      !(e.kind === 'income' && !sourceMarks[e.key]?.done && !journalLoans.has(e.key) && !historicalLoans.has(e.key) &&
        (isRegularWork(e.incomeKind) || e.incomeKind === 'vacation' || (e.incomeKind === 'bonusQuarter' || e.incomeKind === 'bonusYear') && !ov[e.key])));
    out.length = 0;
    out.push(...remaining, ...modelled.map(e => {
      const old = aliases.get(e.key);
      if (!old) return work.aliases?.[e.key] && canonicalMarks[e.key]?.done ? { ...e, key: work.aliases[e.key] } : e;
      const mark = sourceMarks[old.key];
      return { ...e, key: old.key,
        date: e.payroll?.actualPayDate ?? (mark?.done ? mark.paidDate ?? e.date : e.date),
        note: old.note ?? e.note,
      };
    }));
  }
  const splitDebits = input.accountBook?.splitDebits ?? [];
  const replaced = new Set([
    ...splitDebits.flatMap(d => d.replacesKeys),
    ...(input.accountBook?.splitPlans ?? []).flatMap(plan => plan.replacesKeys ?? []).filter(key => !input.marks?.[key]?.done),
  ]);
  for (const debit of splitDebits) {
    if (debit.debtIds.every(id => closedBefore(id, debit.date)) && !input.marks?.[`split-debit:${debit.id}`]?.done) continue;
    out.push({
    key: `split-debit:${debit.id}`, date: debit.date, dateMode: 'exact', kind: 'payment',
    title: 'Сплит · общее автосписание', amount: debit.amount, accountId: debit.accountId, economicType: 'debt_payment', confidence: 'confirmed',
    });
  }
  const accounts = input.accountBook?.paymentAccounts;
  const singleCard = input.accountBook?.paymentRouting === 'life';
  const confirmedAccounts = new Map(input.accountBook?.operations.flatMap(op =>
    op.status === 'confirmed' && op.eventKey ? [[op.eventKey, op.accountId] as const] : []));
  const rank = { payment: 0, weekly: 1, income: 2 } as const;
  const dated = out
    .filter(e => !replaced.has(e.key))
    .map(e => {
      const loan = journalLoans.get(e.key);
      const historical = historicalLoans.get(e.key);
      if (loan && e.kind === 'income') return { ...e, date: loan.date, amount: loan.amount, accountId: loan.accountId,
        dateMode: 'exact' as const, economicType: 'loan_disbursement' as const, confidence: 'confirmed' as const };
      if (historical && e.kind === 'income') return { ...e, date: historical.date, amount: historical.amount,
        dateMode: 'exact' as const, economicType: 'loan_disbursement' as const, confidence: 'confirmed' as const };
      const fixedKey = e.key.startsWith('fix:') && !input.marks?.[e.key]?.done ? e.key.slice(0, e.key.lastIndexOf(':')) : undefined;
      const mark = input.marks?.[e.key];
      if (singleCard && (e.kind === 'payment' || cashIncomeEvent(e))) {
        const historic = confirmedAccounts.get(e.key) ?? (mark?.paidFrom === 'card' ? LIFE_ACCOUNT
          : mark?.paidFrom === 'reserve' ? RESERVE_ACCOUNT : e.accountId);
        return { ...e, accountId: mark?.done ? historic : LIFE_ACCOUNT,
          ...(e.kind === 'payment' && !mark?.done ? { prepareOn: undefined } : {}) };
      }
      return e.kind === 'payment' ? { ...e,
        accountId: accounts?.[e.key] ?? (e.debtId ? accounts?.[e.debtId] : undefined) ?? (fixedKey ? accounts?.[fixedKey] : undefined) ?? e.accountId } : e;
    })
    // деньги приходят только в рабочий день: выходной или праздник — значит, накануне
    .map(e => {
      if (e.kind !== 'income' || e.economicType === 'loan_disbursement' || e.nominalDate || e.dateMode === 'month' || ov[e.key]?.date) return e;
      const mark = input.marks?.[e.key];
      if (mark?.done) return { ...e, date: paidOn(e, mark), dateMode: 'exact' as const, approx: false };
      const date = workdayOnOrBefore(e.date);
      return date === e.date ? e : { ...e, date, planned: e.date };
    })
    .map(e => {
      const custom = ov[e.key];
      if (e.economicType === 'loan_disbursement') return e;
      const mark = input.marks?.[e.key];
      const fact = e.kind === 'income' && (mark?.done || e.payroll?.documented);
      const legacy = e.payroll ? undefined : custom;
      const status = incomeStatus({ ...e, projection: custom?.projection ?? e.projection }, mark);
      const scenario = status === 'conditional';
      return { ...e,
        amount: e.payroll ? e.amount : fact ? mark?.amount ?? e.amount : legacy?.amount ?? e.amount,
        date: e.payroll ? e.date : fact ? mark?.paidDate ?? e.date : legacy?.date ?? e.date,
        prepareOn: custom?.prepareOn ?? e.prepareOn,
        dateMode: scenario && e.dateMode !== 'month' ? 'approx' as const : e.dateMode,
        economicType: custom?.economicType ?? e.economicType, projection: custom?.projection ?? e.projection,
        approx: scenario || (!fact && legacy?.amount == null && e.approx),
        moved: !fact && custom?.date != null && custom.date !== e.date };
    });
  const datedByKey = new Map(dated.map(e => [e.key, e]));
  const linkedReviews = new Set<string>();
  const possibleExtras = new Map<string, number>();
  for (const event of dated) {
    const targetKey = ov[event.key]?.reviewFor;
    if (!targetKey || targetKey === event.key || event.kind !== 'payment' || event.projection !== 'review' ||
        event.amount <= 0 || input.marks?.[event.key]?.done) continue;
    const target = datedByKey.get(targetKey);
    if (target?.kind !== 'payment' || target.date !== event.date || target.projection || !target.debtId ||
        (event.debtId && event.debtId !== target.debtId)) continue;
    linkedReviews.add(event.key);
    if (!input.marks?.[target.key]?.done) possibleExtras.set(target.key, kopecks((possibleExtras.get(target.key) ?? 0) + event.amount));
  }
  const partial = partialPayments(input.accountBook?.operations ?? []);
  return dated.filter(e => !linkedReviews.has(e.key))
    .map(e => singleCard && e.kind === 'payment' && !input.marks?.[e.key]?.done ? { ...e, prepareOn: addDays(e.date, -1) } : e)
    .map(e => possibleExtras.has(e.key) ? { ...e, possibleExtra: possibleExtras.get(e.key) } : e)
    .map(e => e.kind === 'payment' && !input.marks?.[e.key]?.done && partial.has(e.key)
      ? { ...e, originalAmount: e.amount, amount: Math.max(0, kopecks(e.amount - partial.get(e.key)! / 100)) } : e)
    .filter(e => e.date >= rangeFrom && e.date <= rangeTo)
    .sort((a, b) => a.date.localeCompare(b.date) || rank[a.kind] - rank[b.kind] || a.title.localeCompare(b.title));
}

export const cashIncomeEvent = (event: CalEvent) =>
  event.kind === 'income' && event.economicType !== 'loan_disbursement' && event.economicType !== 'non_income';

export type IncomeStatus = 'recorded' | 'documented' | 'forecast' | 'conditional';
const optionalPay = new Set<IncomeKind>(['bonusQuarter', 'bonusYear', 'thirteenth']);

export function incomeStatus(event: CalEvent, mark?: EventMark): IncomeStatus | undefined {
  if (event.kind !== 'income') return undefined;
  if (mark?.done || event.payroll?.bankConfirmed) return 'recorded';
  if (event.payroll?.documented) return 'documented';
  if (event.projection === 'review' || event.projection === 'conditional' ||
      (event.incomeKind && optionalPay.has(event.incomeKind)) ||
      (event.incomeKind === 'other' && event.confidence === 'estimate') ||
      (event.incomeKind === 'vacation' && !event.payroll)) return 'conditional';
  return 'forecast';
}

export const INCOME_STATUS_LABEL: Record<IncomeStatus, string> = {
  recorded: 'Подтверждено в приложении', documented: 'Факт по документам', forecast: 'Прогноз', conditional: 'Условный сценарий',
};

export const actionableEvent = (event: CalEvent) =>
  !event.payroll?.documented && event.economicType !== 'loan_disbursement' &&
  event.projection !== 'conditional' && event.projection !== 'internal_transfer' && event.projection !== 'review';

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

/** День фактической оплаты отмеченного события: paidDate, а у старых отметок без неё — день отметки, если плановая
 *  дата позже (оплатили заранее), иначе плановая дата. Оплаченное считается в этот день, а не в плановый */
export function paidOn(e: Pick<CalEvent, 'date'>, m: Pick<EventMark, 'paidDate' | 'at'>): string {
  if (m.paidDate) return m.paidDate;
  const marked = m.at?.slice(0, 10);
  return marked && e.date > marked ? marked : e.date;
}

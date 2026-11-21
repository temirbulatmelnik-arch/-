import { cents, kopecks, LIFE_ACCOUNT, RESERVE_ACCOUNT, rubles, type AccountOperation, type PaymentShare } from './accounts';
import { addDays } from './dates';
import type { CalEvent, EventMark, ReserveMove } from './types';

export const DEFAULT_PREPARATION_TIME = '20:00';

export function moscowClock(at = new Date()) {
  const local = new Date(at.getTime() + 3 * 60 * 60 * 1000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export function preparationInstant(date: string, time: string) {
  return new Date(`${date}T${time}:00+03:00`).toISOString();
}

export const weeklyTopUp = (limit: number, available: number) => rubles(Math.max(0, cents(limit) - cents(available)));

export interface HeldPayment extends PaymentShare {
  date: string;
  accountId: string;
}

export function earmarks(operations: AccountOperation[], log: ReserveMove[], marks: Record<string, EventMark>, now: string, legacyEvents: CalEvent[] = []) {
  const held: HeldPayment[] = [];
  const pending: Record<string, number> = {};
  const legacyDraw: Record<string, number> = {};
  const draw = (account: string, amount: number) => {
    const available = pending[account] ?? 0;
    pending[account] = Math.max(0, available - cents(amount));
    legacyDraw[account] = (legacyDraw[account] ?? 0) + Math.max(0, cents(amount) - available);
  };
  let unassignedLife = 0;
  const change = (accountId: string, shares: PaymentShare[], direction: 1 | -1, date: string) => {
    for (const share of shares) {
      const row = held.find(r => r.key === share.key && r.accountId === accountId);
      if (row) {
        row.amount = rubles(Math.max(0, cents(row.amount) + direction * cents(share.amount)));
        if (direction === 1) row.date = date;
      } else if (direction === 1) held.push({ ...share, accountId, date });
    }
  };
  const legacyAmounts = new Map(legacyEvents.map(event => [event.key, event.originalAmount ?? event.amount]));
  let legacyUnmapped = 0;
  for (const move of log) {
    if (move.date > now || !move.card || move.card <= 0 || !move.forKeys?.length) continue;
    let left = cents(move.card);
    for (const key of move.forKeys) {
      const expected = marks[key]?.done ? marks[key].amount ?? legacyAmounts.get(key) : legacyAmounts.get(key);
      const part = move.forKeys.length === 1 ? left : Math.min(left, Math.max(0, cents(expected ?? 0)));
      if (part > 0 && !marks[key]?.done) change(LIFE_ACCOUNT, [{ key, amount: rubles(part) }], 1, move.date);
      left -= part;
    }
    if (move.forKeys.some(key => !marks[key]?.done)) legacyUnmapped += left;
  }
  // Preserve confirmation order, including bank operations with backdated effective dates.
  for (const op of operations) {
    if (op.status !== 'confirmed' || op.date > now) continue;
    if (op.type === 'transfer') {
      if (op.purpose === 'weekly') unassignedLife += cents(op.weeklyExcess ?? 0);
      if ((op.purpose === 'prepare' || op.purpose === 'return') && op.shares) {
        change(op.accountId, op.shares, -1, op.date);
        if (op.purpose === 'prepare') change(op.toAccountId, op.shares, 1, op.date);
      }
      if (op.purpose === 'sweep') draw(op.accountId, op.amount);
    } else if (op.type === 'allocation') {
      if (!op.existingCash) draw(op.accountId, op.amount);
      change(op.accountId, op.shares, 1, op.date);
    } else if (op.type === 'income' && op.pendingSweep && op.accountId !== RESERVE_ACCOUNT && op.fundingSource !== 'borrowed') {
      pending[op.accountId] = (pending[op.accountId] ?? 0) + cents(op.amount);
    } else if ((op.type === 'debt_payment' || op.type === 'expense') && (op.eventKey || op.partialFor)) {
      change(op.accountId, [{ key: (op.eventKey ?? op.partialFor)!, amount: op.amount }], -1, op.date);
    }
  }
  return { legacyUnmapped: rubles(legacyUnmapped), held: held.filter(row => row.amount > 0), pending: Object.fromEntries(Object.entries(pending).map(([id, amount]) => [id, rubles(amount)])), legacyDraw: Object.fromEntries(Object.entries(legacyDraw).map(([id, amount]) => [id, rubles(amount)])), unassignedLife: rubles(unassignedLife) };
}

export interface PaymentPreparation {
  id: string;
  date: string;
  remindDate: string;
  accountId?: string;
  events: CalEvent[];
  total: number;
  prepared: number;
  inTransit: number;
  toFund: number | null;
  reserveShortfall: number;
}

export function paymentPreparations(events: CalEvent[], marks: Record<string, EventMark>, held: HeldPayment[], reserve: number): PaymentPreparation[] {
  const groups = new Map<string, PaymentPreparation>();
  for (const e of events) {
    if (e.kind !== 'payment' || e.projection || marks[e.key]?.done || e.amount <= 0) continue;
    const id = JSON.stringify([e.date, e.accountId ?? null]);
    const remindDate = e.prepareOn && e.prepareOn < e.date ? e.prepareOn : addDays(e.date, -1);
    const group = groups.get(id) ?? { id, date: e.date, remindDate, accountId: e.accountId,
      events: [], total: 0, prepared: 0, inTransit: 0, toFund: null, reserveShortfall: 0 };
    const prepared = Math.min(cents(e.amount), cents(held.find(row => row.key === e.key && row.accountId === e.accountId)?.amount ?? 0));
    const transit = e.accountId && e.accountId !== LIFE_ACCOUNT && e.accountId !== RESERVE_ACCOUNT
      ? Math.min(cents(e.amount) - prepared, cents(held.find(row => row.key === e.key && row.accountId === LIFE_ACCOUNT)?.amount ?? 0)) : 0;
    group.events.push(e);
    if (remindDate < group.remindDate) group.remindDate = remindDate;
    group.total = kopecks(group.total + e.amount);
    group.prepared = kopecks(group.prepared + rubles(prepared));
    group.inTransit = kopecks(group.inTransit + rubles(transit));
    groups.set(id, group);
  }
  let remaining = Math.max(0, cents(reserve));
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date)).map(group => {
    if (!group.accountId) return group;
    const need = Math.max(0, cents(group.total) - cents(group.prepared) - cents(group.inTransit));
    const toFund = group.accountId === RESERVE_ACCOUNT ? 0 : rubles(need);
    const reserveShortfall = rubles(Math.max(0, need - remaining));
    remaining = Math.max(0, remaining - need);
    return { ...group, toFund, reserveShortfall };
  });
}

export function needsPreparation(group: PaymentPreparation) {
  return !group.accountId || Boolean(group.toFund || group.inTransit || group.reserveShortfall);
}

export function preparationDue(group: PaymentPreparation, clock: ReturnType<typeof moscowClock>, time: string) {
  return group.date >= clock.date && needsPreparation(group) &&
    (group.remindDate < clock.date || (group.remindDate === clock.date && clock.time >= time));
}

export type FundingMode = 'reserve' | 'via' | 'forward' | 'allocate' | 'existing';

export function paymentShares(events: CalEvent[], held: HeldPayment[], amount: number, target: string, mode: FundingMode) {
  let left = cents(amount);
  const shares: PaymentShare[] = [];
  for (const event of events) {
    const available = (account: string) => cents(held.find(row => row.key === event.key && row.accountId === account)?.amount ?? 0);
    const missing = Math.max(0, cents(event.amount) - available(target));
    const transit = target === LIFE_ACCOUNT ? 0 : available(LIFE_ACCOUNT);
    const part = Math.min(left, mode === 'forward' ? Math.min(missing, transit) : Math.max(0, missing - transit));
    if (part > 0) shares.push({ key: event.key, amount: rubles(part) });
    left -= part;
  }
  if (left > 0 && shares.length && (mode === 'reserve' || mode === 'via')) {
    const last = shares[shares.length - 1];
    last.amount = kopecks(last.amount + rubles(left));
    left = 0;
  }
  return left === 0 ? shares : null;
}

export function partialPayments(operations: AccountOperation[]) {
  const sums = new Map<string, number>();
  for (const op of operations) if (op.status === 'confirmed' && op.partialFor) {
    sums.set(op.partialFor, (sums.get(op.partialFor) ?? 0) + cents(op.amount));
  }
  return sums;
}

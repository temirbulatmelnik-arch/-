import { cents, LIFE_ACCOUNT, RESERVE_ACCOUNT, rubles, type AccountOperation } from './accounts';
import { actionableEvent, cashIncomeEvent, incomeStatus } from './calendar';
import type { Coverage, CoverageInput, Scenario } from './coverage';
import { addDays } from './dates';
import type { CalEvent, EventMark } from './types';

export const SCENARIO_LABEL: Record<Scenario, string> = {
  base: 'Базовый', cautious: 'Осторожный', stress: 'Стрессовый',
};

export const horizonUnverified = (input: CoverageInput) =>
  !!input.unresolvedCash || input.cash?.[LIFE_ACCOUNT] == null || input.cash?.[RESERVE_ACCOUNT] == null;

export const needsPaymentReview = (event: CalEvent, mark: EventMark | undefined, now: string) =>
  event.kind === 'payment' && !mark?.done &&
  (event.projection === 'review' || actionableEvent(event) && event.date < now);

export function bankProvenEvents(operations: AccountOperation[]) {
  const keys = new Set<string>();
  for (const op of operations) {
    if (op.status !== 'confirmed' || op.origin !== 'bank') continue;
    if (op.eventKey) keys.add(op.eventKey);
    if (op.type === 'income') for (const part of op.payrollParts ?? []) keys.add(part.key);
  }
  return keys;
}

export function monthEventTotals(events: CalEvent[], marks: Record<string, EventMark>, proven: ReadonlySet<string>, now: string) {
  const sums = { paid: 0, recorded: 0, upcoming: 0, review: 0, incomeBank: 0, incomeRecorded: 0, incomeDocumented: 0, income: 0, conditional: 0 };
  for (const event of events) {
    const mark = marks[event.key];
    const amount = cents(mark?.done ? mark.amount ?? event.amount : event.amount);
    if (event.kind === 'payment') {
      if (mark?.done) sums[proven.has(event.key) ? 'paid' : 'recorded'] += amount;
      else if (needsPaymentReview(event, mark, now)) sums.review += amount;
      else if (actionableEvent(event)) sums.upcoming += amount;
    } else if (cashIncomeEvent(event)) {
      const status = incomeStatus(event, mark);
      if (proven.has(event.key)) sums.incomeBank += amount;
      else if (status === 'recorded') sums.incomeRecorded += amount;
      else if (status === 'documented') sums.incomeDocumented += amount;
      else sums[status === 'conditional' ? 'conditional' : 'income'] += amount;
    }
  }
  return { paid: rubles(sums.paid), recorded: rubles(sums.recorded), upcoming: rubles(sums.upcoming),
    review: rubles(sums.review), incomeBank: rubles(sums.incomeBank), incomeRecorded: rubles(sums.incomeRecorded),
    incomeDocumented: rubles(sums.incomeDocumented), income: rubles(sums.income), conditional: rubles(sums.conditional) };
}

export function coverageDayDetails(cov: Coverage, date: string) {
  const end = cov.byDay[date];
  if (end == null || date < cov.from || date > cov.to) return null;
  const start = date === cov.from ? cov.start : cov.byDay[addDays(date, -1)];
  if (start == null) return null;
  const movements = cov.steps.filter(step => step.date === date);
  const income = movements.filter(step => step.delta > 0).reduce((sum, step) => sum + cents(step.delta), 0);
  const out = movements.filter(step => step.delta < 0).reduce((sum, step) => sum - cents(step.delta), 0);
  return { start, end, income: rubles(income), out: rubles(out), low: Math.min(start, ...movements.map(step => step.balance)) };
}

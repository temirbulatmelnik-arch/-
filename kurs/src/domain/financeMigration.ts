import { canonicalBook, cents, EMPTY_BOOK, postings } from './accounts';
import { buildExchange, type ExchangeState } from './exchange';
import { ledger } from './ledger';

function stateProjection(state: ExchangeState, date: string) {
  const led = ledger({ ...state, now: date, checkups: state.checkups ?? [], reserveLog: state.reserveLog ?? [], bridge: state.bridge ?? null });
  const { status } = buildExchange(state, date);
  return {
    cash: [led.card, led.reserve, led.totalCash, led.lifeAvailable, led.heldOnCard].map(amount => amount == null ? null : cents(amount)),
    debt: Object.fromEntries(Object.entries(led.debtBalances).map(([id, row]) => [id, cents(row.estimated)])),
    week: status?.week, today: status?.today, reviews: led.reconciliation,
  };
}

/** Изолированная репетиция переноса. Не выполняет запись в хранилище. */
export function dryRunFinanceMigration<T extends ExchangeState>(source: T, date: string) {
  const snapshot = structuredClone(source);
  const book = snapshot.accountBook ?? EMPTY_BOOK;
  const state = { ...snapshot, accountBook: canonicalBook(book, snapshot.expenses) };
  const existing = new Set(state.accountBook.operations.map(row => row.id));
  const duplicateIds = state.accountBook.operations.length - existing.size;
  const lostOperations = book.operations.filter(row => !existing.has(row.id)).length;
  const unbalanced = state.accountBook.operations.filter(row => postings(row).reduce((sum, leg) => sum + leg.amount, 0) !== 0).length;
  const before = stateProjection(snapshot, date);
  const after = stateProjection(state, date);
  const sameMoney = JSON.stringify(before) === JSON.stringify(after);
  return { state, sameMoney, duplicateIds, lostOperations, unbalanced,
    expenses: state.expenses.length, operations: state.accountBook.operations.length,
    debts: state.debts.length, snapshots: state.checkups?.length ?? 0, reviews: after.reviews.length,
    canCommit: sameMoney && !duplicateIds && !lostOperations && !unbalanced };
}

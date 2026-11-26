import { sha256 } from '@noble/hashes/sha2.js';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { expenseOperation, linkedExpenseId, type AccountBook, type AccountOperation } from '../domain/accounts';
import type { Expense } from '../domain/types';

export const FINANCE_SCHEMA = 11;
export const LEGACY_KEY = 'kurs';
export const FINANCE_KEY = 'kurs:journal-v11';
export const PREVIOUS_FINANCE_KEY = 'kurs:journal-v10';
export const MIGRATION_BACKUP_KEY = 'kurs:before-1.0';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Problem = 'storage' | 'verification' | 'other-version' | 'changed';
type CompactBook = Omit<AccountBook, 'operations'> & { operations: (AccountOperation | { expenseRef: string })[] };
type FinancialData = { expenses?: Expense[]; accountBook?: AccountBook };
type CompactData = Omit<FinancialData, 'accountBook'> & { accountBook?: CompactBook };

const subscribers = new Set<() => void>();
let problem: Problem | null = null;
export const migrationProblem = () => problem;
export function subscribeMigration(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}
function updateProblem(next: typeof problem) {
  if (next === problem) return;
  problem = next;
  for (const listener of subscribers) listener();
}

export const digest = (raw: string) => Array.from(sha256(new TextEncoder().encode(raw)), byte => byte.toString(16).padStart(2, '0')).join('');

export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, input: unknown) => input !== null && typeof input === 'object' && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : input);
}

/** Старые записи хранят сумму и категорию в расходе. Обычную проводку мы восстанавливаем по его ID.
 *  Оригинальные нестандартные проводки сохраняются полностью, в прежнем порядке. */
function compact(state: FinancialData): CompactData {
  if (!state.accountBook || !state.expenses) return state;
  const book = state.accountBook;
  const expenses = new Map(state.expenses.map(expense => [expense.id, expense]));
  return {
    ...state,
    accountBook: { ...book, operations: book.operations.map(op => {
      const expenseRef = linkedExpenseId(op);
      const expense = expenseRef ? expenses.get(expenseRef) : undefined;
      return expense && op.legacyExpense && stableJson(expenseOperation(expense, book)) === stableJson(op)
        ? { expenseRef: expense.id } : op;
    }) },
  };
}

function expand(state: CompactData): FinancialData {
  if (!state.accountBook) return state as FinancialData;
  const book: AccountBook = { ...state.accountBook, operations: [] };
  const expenses = new Map(state.expenses?.map(expense => [expense.id, expense]));
  for (const entry of state.accountBook.operations) {
    if ('expenseRef' in entry) {
      const expense = expenses.get(entry.expenseRef);
      if (!expense) throw new Error('missing expense reference');
      book.operations.push(expenseOperation(expense, book));
    } else {
      book.operations.push(entry);
    }
  }
  return { ...state, accountBook: book };
}

type WithSnapshots = FinancialData & { imports?: { snapshot: FinancialData }[] };
function transformSnapshots(state: WithSnapshots, transform: (value: FinancialData) => CompactData) {
  return { ...transform(state), ...(state.imports ? { imports: state.imports.map(entry => ({ ...entry, snapshot: transform(entry.snapshot) })) } : {}) };
}

export function packFinanceState(state: WithSnapshots): string {
  return JSON.stringify(transformSnapshots(state, compact));
}

export function unpackFinanceState<T extends WithSnapshots>(payload: string): T {
  const state = JSON.parse(payload) as CompactData & { imports?: { snapshot: CompactData }[] };
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('invalid archive');
  return {
    ...expand(state),
    ...(state.imports ? { imports: state.imports.map(entry => ({ ...entry, snapshot: expand(entry.snapshot) })) } : {}),
  } as T;
}

type Archive = { version: number; payload: string; checksum: string; legacyChecksum: string | null; previousChecksum?: string | null };
type Backup = { version: number; createdAt: string; payload: string; checksum: string };

export function readMigrationBackup(storage: Storage, allowChangedPrior = false): StorageValue<unknown> | null {
  const previous = storage.getItem(PREVIOUS_FINANCE_KEY);
  const current = storage.getItem(FINANCE_KEY);
  if (previous) {
    const old = JSON.parse(previous) as Archive;
    if (old.version !== 10 || typeof old.payload !== 'string' || digest(old.payload) !== old.checksum) throw new Error('invalid prior archive');
    if (current) {
      let expected: string | null | undefined;
      try { expected = (JSON.parse(current) as Archive).previousChecksum; } catch { /* The source archive is verified independently. */ }
      if (!allowChangedPrior && expected && expected !== digest(previous)) throw new Error('prior archive changed');
    }
    return { version: 10, state: unpackFinanceState(old.payload) };
  }
  const raw = storage.getItem(MIGRATION_BACKUP_KEY);
  if (!raw) return null;
  const backup = JSON.parse(raw) as Backup;
  if (typeof backup.payload !== 'string' || digest(backup.payload) !== backup.checksum) throw new Error('invalid backup');
  const original = JSON.parse(backup.payload) as StorageValue<unknown>;
  if ((original.version ?? 0) !== backup.version) throw new Error('invalid backup version');
  return original;
}

export function createFinanceStorage<T extends WithSnapshots>(getStorage: () => Storage,
  prepare: (state: unknown, version: number) => T, verify: (before: T, after: T) => boolean, normalize: (state: T) => T = state => state,
): PersistStorage<T> {
  let activeRaw: string | null = null;
  let sourceRaw: string | null = null;
  let previousRaw: string | null = null;
  let previousChecksum: string | null = null;
  let sourceChecksum: string | null = null;
  let blocked = false;

  const fail = (reason: Problem): never => {
    blocked = true;
    updateProblem(reason);
    throw new Error('finance storage unavailable');
  };
  const archive = (state: T) => {
    const payload = packFinanceState(state);
    return JSON.stringify({ version: FINANCE_SCHEMA, payload, checksum: digest(payload), legacyChecksum: sourceChecksum, previousChecksum });
  };
  const storageOrFail = () => {
    try { return getStorage(); } catch { return fail('storage'); }
  };
  const verifiedWrite = (storage: Storage, key: string, raw: string) => {
    try {
      storage.setItem(key, raw);
      if (storage.getItem(key) !== raw) fail('storage');
    } catch { fail('storage'); }
  };

  return {
    getItem() {
      const storage = storageOrFail();
      const current = storage.getItem(FINANCE_KEY);
      const original = storage.getItem(LEGACY_KEY);
      previousRaw = storage.getItem(PREVIOUS_FINANCE_KEY);
      previousChecksum = previousRaw == null ? null : digest(previousRaw);
      blocked = false;
      activeRaw = current;
      sourceRaw = original;
      sourceChecksum = original == null ? null : digest(original);
      if (current != null) {
        try {
          const row = JSON.parse(current) as Archive;
          if (row.version !== FINANCE_SCHEMA) fail('other-version');
          if (typeof row.payload !== 'string' || digest(row.payload) !== row.checksum) fail('verification');
          const state = unpackFinanceState<T>(row.payload);
          if (row.legacyChecksum !== sourceChecksum || (row.previousChecksum ?? null) !== previousChecksum) {
            blocked = true;
            updateProblem('changed');
          } else updateProblem(null);
          return { version: FINANCE_SCHEMA, state };
        } catch {
          if (blocked) throw new Error('finance storage unavailable');
          fail('verification');
        }
      }
      if (previousRaw != null) {
        try {
          const prior = JSON.parse(previousRaw) as Archive;
          if (prior.version !== 10 || typeof prior.payload !== 'string' || digest(prior.payload) !== prior.checksum) fail('verification');
          if (prior.legacyChecksum !== sourceChecksum) fail('changed');
          const before = unpackFinanceState<T>(prior.payload);
          const after = normalize(before);
          const candidate = archive(after);
          const decoded = unpackFinanceState<T>((JSON.parse(candidate) as Archive).payload);
          if (stableJson(after) !== stableJson(decoded) || !verify(before, decoded)) fail('verification');
          if (storage.getItem(LEGACY_KEY) !== original || storage.getItem(PREVIOUS_FINANCE_KEY) !== previousRaw ||
              storage.getItem(FINANCE_KEY) !== null) fail('changed');
          verifiedWrite(storage, FINANCE_KEY, candidate);
          activeRaw = candidate;
          updateProblem(null);
          return { version: FINANCE_SCHEMA, state: after };
        } catch {
          if (blocked) throw new Error('finance storage unavailable');
          fail('verification');
        }
      }
      if (!original) { updateProblem(null); return null; }

      let legacy: StorageValue<unknown>;
      let prepared: T;
      let candidate: string;
      try {
        legacy = JSON.parse(original) as StorageValue<unknown>;
        const version = legacy.version ?? 0;
        if (!Number.isInteger(version) || version < 0 || version >= FINANCE_SCHEMA) fail('other-version');
        const before = prepare(legacy.state, version);
        prepared = normalize(before);
        candidate = archive(prepared);
        const decoded = unpackFinanceState<T>((JSON.parse(candidate) as Archive).payload);
        if (stableJson(prepared) !== stableJson(decoded) || !verify(before, decoded)) fail('verification');
      } catch {
        if (blocked) throw new Error('finance storage unavailable');
        return fail('verification');
      }

      // Фаза 1 закончена. Ниже записываем и проверяем точную копию, старый ключ остаётся доступен старой PWA.
      if (storage.getItem(LEGACY_KEY) !== original || storage.getItem(PREVIOUS_FINANCE_KEY) !== previousRaw || storage.getItem(FINANCE_KEY) !== null) fail('changed');
      try {
        const backup = storage.getItem(MIGRATION_BACKUP_KEY);
        if (backup == null) {
          const record: Backup = { version: legacy.version ?? 0, createdAt: new Date().toISOString(), payload: original, checksum: sourceChecksum! };
          verifiedWrite(storage, MIGRATION_BACKUP_KEY, JSON.stringify(record));
        } else if ((JSON.parse(backup) as Backup).payload !== original) fail('changed');
        if (!readMigrationBackup(storage)) fail('verification');
      } catch {
        if (blocked) throw new Error('finance storage unavailable');
        return fail('verification');
      }

      // Фаза 2. Единственная атомарная запись указывает на новое состояние.
      if (storage.getItem(LEGACY_KEY) !== original || storage.getItem(PREVIOUS_FINANCE_KEY) !== previousRaw || storage.getItem(FINANCE_KEY) !== null) fail('changed');
      verifiedWrite(storage, FINANCE_KEY, candidate);
      activeRaw = candidate;
      updateProblem(null);
      return { version: FINANCE_SCHEMA, state: prepared };
    },
    setItem(_key, value) {
      if (blocked) return;
      const storage = storageOrFail();
      if (storage.getItem(LEGACY_KEY) !== sourceRaw || storage.getItem(PREVIOUS_FINANCE_KEY) !== previousRaw || (storage.getItem(FINANCE_KEY) ?? null) !== activeRaw) {
        blocked = true;
        updateProblem('changed');
        return;
      }
      try {
        const raw = archive(value.state);
        verifiedWrite(storage, FINANCE_KEY, raw);
        activeRaw = raw;
      } catch { fail('storage'); }
    },
    removeItem() {
      storageOrFail().removeItem(FINANCE_KEY);
      activeRaw = null;
    },
  };
}

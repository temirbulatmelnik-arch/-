import { sha256 } from '@noble/hashes/sha2.js';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { expenseOperation, linkedExpenseId, type AccountBook, type AccountOperation } from '../domain/accounts';
import type { Expense } from '../domain/types';

export const FINANCE_SCHEMA = 11;
export const LEGACY_KEY = 'kurs';
export const FINANCE_KEY = 'kurs:journal-v11';
export const PREVIOUS_FINANCE_KEY = 'kurs:journal-v10';
export const MIGRATION_BACKUP_KEY = 'kurs:before-1.0';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type FinanceStorageProblem = 'storage' | 'quota' | 'verification' | 'other-version' | 'changed' | 'archive';
type CompactBook = Omit<AccountBook, 'operations'> & { operations: (AccountOperation | { expenseRef: string })[] };
type FinancialData = { expenses?: Expense[]; accountBook?: AccountBook };
type CompactData = Omit<FinancialData, 'accountBook'> & { accountBook?: CompactBook };

const subscribers = new Set<() => void>();
let problem: FinanceStorageProblem | null = null;
export const migrationProblem = () => problem;
export const reportFinanceArchiveProblem = () => updateProblem('archive');
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

type Payload = { payload: string; checksum: string; encoding?: 'deflate' };
type Archive = Payload & { version: number; legacyChecksum: string | null; previousChecksum?: string | null };
type Backup = Payload & { version: number; createdAt: string };

function checkedPayload(record: Payload) {
  if (typeof record.payload !== 'string') throw new Error('missing archive payload');
  const { encoding } = record;
  if (encoding !== undefined && encoding !== 'deflate') throw new Error('unknown archive encoding');
  const payload = encoding === 'deflate'
    ? strFromU8(inflateSync(strToU8(atob(record.payload), true))) : record.payload;
  if (digest(payload) !== record.checksum) throw new Error('invalid archive checksum');
  return payload;
}

function compressedRecord(record: Payload, raw: string) {
  const payload = btoa(strFromU8(deflateSync(strToU8(record.payload), { level: 1 }), true));
  const compact = { ...record, payload, encoding: 'deflate' as const };
  const encoded = JSON.stringify(compact);
  if (encoded.length >= raw.length) return null;
  if (checkedPayload(compact) !== record.payload) throw new Error('archive compression changed the payload');
  return encoded;
}

const isQuotaError = (error: unknown) => typeof error === 'object' && error !== null && (
  ('name' in error && ['QuotaExceededError', 'QUOTA_EXCEEDED_ERR', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(String(error.name))) ||
  ('code' in error && (error.code === 22 || error.code === 1014)));

function verifiedWrite(storage: Storage, key: string, raw: string) {
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error('archive read-back failed');
}

function writeRecord(storage: Storage, key: string, record: Payload, preferCompact = false) {
  const raw = JSON.stringify(record);
  if (!preferCompact) {
    try {
      verifiedWrite(storage, key, raw);
      return { raw, compact: false };
    } catch (error) {
      if (!isQuotaError(error)) throw error;
    }
  }
  const compact = compressedRecord(record, raw);
  verifiedWrite(storage, key, compact ?? raw);
  return { raw: compact ?? raw, compact: compact != null };
}

export function readMigrationBackup(storage: Storage, allowChangedPrior = false): StorageValue<unknown> | null {
  const previous = storage.getItem(PREVIOUS_FINANCE_KEY);
  const current = storage.getItem(FINANCE_KEY);
  if (previous) {
    const old = JSON.parse(previous) as Archive;
    if (old.version !== 10) throw new Error('invalid prior archive version');
    const payload = checkedPayload(old);
    if (current) {
      let expected: string | null | undefined;
      try { expected = (JSON.parse(current) as Archive).previousChecksum; } catch { /* The source archive is verified independently. */ }
      if (!allowChangedPrior && expected && expected !== digest(previous)) throw new Error('prior archive changed');
    }
    return { version: 10, state: unpackFinanceState(payload) };
  }
  const raw = storage.getItem(MIGRATION_BACKUP_KEY);
  if (!raw) return null;
  const backup = JSON.parse(raw) as Backup;
  const original = JSON.parse(checkedPayload(backup)) as StorageValue<unknown>;
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
  let compactActive = false;

  const fail = (reason: FinanceStorageProblem): never => {
    blocked = true;
    updateProblem(reason);
    throw new Error('finance storage unavailable');
  };
  const archive = (state: T): Archive => {
    const payload = packFinanceState(state);
    return { version: FINANCE_SCHEMA, payload, checksum: digest(payload), legacyChecksum: sourceChecksum, previousChecksum };
  };
  const storageOrFail = () => {
    try { return getStorage(); } catch { return fail('storage'); }
  };
  const failWrite = (error: unknown): never => fail(isQuotaError(error) ? 'quota' : 'storage');
  const writeActive = (storage: Storage, record: Archive, preferCompact = compactActive) => {
    const written = writeRecord(storage, FINANCE_KEY, record, preferCompact);
    activeRaw = written.raw;
    compactActive = written.compact;
  };

  return {
    getItem() {
      const storage = storageOrFail();
      const current = storage.getItem(FINANCE_KEY);
      const original = storage.getItem(LEGACY_KEY);
      previousRaw = storage.getItem(PREVIOUS_FINANCE_KEY);
      previousChecksum = previousRaw == null ? null : digest(previousRaw);
      blocked = false;
      compactActive = false;
      activeRaw = current;
      sourceRaw = original;
      sourceChecksum = original == null ? null : digest(original);
      if (current != null) {
        try {
          const row = JSON.parse(current) as Archive;
          if (row.version !== FINANCE_SCHEMA) fail('other-version');
          const state = unpackFinanceState<T>(checkedPayload(row));
          compactActive = row.encoding === 'deflate';
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
          if (prior.version !== 10) fail('verification');
          if (prior.legacyChecksum !== sourceChecksum) fail('changed');
          const before = unpackFinanceState<T>(checkedPayload(prior));
          const after = normalize(before);
          const candidate = archive(after);
          const decoded = unpackFinanceState<T>(candidate.payload);
          if (stableJson(after) !== stableJson(decoded) || !verify(before, decoded)) fail('verification');
          if (storage.getItem(LEGACY_KEY) !== original || storage.getItem(PREVIOUS_FINANCE_KEY) !== previousRaw ||
              storage.getItem(FINANCE_KEY) !== null) fail('changed');
          try { writeActive(storage, candidate); } catch (error) { failWrite(error); }
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
      let candidate: Archive;
      try {
        legacy = JSON.parse(original) as StorageValue<unknown>;
        const version = legacy.version ?? 0;
        if (!Number.isInteger(version) || version < 0 || version >= FINANCE_SCHEMA) fail('other-version');
        const before = prepare(legacy.state, version);
        prepared = normalize(before);
        candidate = archive(prepared);
        const decoded = unpackFinanceState<T>(candidate.payload);
        if (stableJson(prepared) !== stableJson(decoded) || !verify(before, decoded)) fail('verification');
      } catch {
        if (blocked) throw new Error('finance storage unavailable');
        return fail('verification');
      }

      // Фаза 1 закончена. Ниже записываем и проверяем точную копию, старый ключ остаётся доступен старой PWA.
      if (storage.getItem(LEGACY_KEY) !== original || storage.getItem(PREVIOUS_FINANCE_KEY) !== previousRaw || storage.getItem(FINANCE_KEY) !== null) fail('changed');
      let savedBackup: string | null = null;
      try {
        const backup = storage.getItem(MIGRATION_BACKUP_KEY);
        if (backup == null) {
          const record: Backup = { version: legacy.version ?? 0, createdAt: new Date().toISOString(), payload: original, checksum: sourceChecksum! };
          try { savedBackup = writeRecord(storage, MIGRATION_BACKUP_KEY, record).raw; } catch (error) { failWrite(error); }
        } else {
          if (checkedPayload(JSON.parse(backup) as Backup) !== original) fail('changed');
          savedBackup = backup;
        }
        if (!readMigrationBackup(storage)) fail('verification');
      } catch {
        if (blocked) throw new Error('finance storage unavailable');
        return fail('verification');
      }

      // Фаза 2. Единственная атомарная запись указывает на новое состояние.
      if (storage.getItem(LEGACY_KEY) !== original || storage.getItem(PREVIOUS_FINANCE_KEY) !== previousRaw || storage.getItem(FINANCE_KEY) !== null) fail('changed');
      try {
        writeActive(storage, candidate);
      } catch (error) {
        if (!isQuotaError(error) || savedBackup == null) return failWrite(error);
        // A failed earlier migration may already have written a large, uncompressed backup.
        try {
          const backup = JSON.parse(savedBackup) as Backup;
          const compact = backup.encoding ? null : compressedRecord(backup, savedBackup);
          if (!compact) return failWrite(error);
          if (storage.getItem(LEGACY_KEY) !== original || storage.getItem(PREVIOUS_FINANCE_KEY) !== previousRaw ||
              storage.getItem(FINANCE_KEY) !== null || storage.getItem(MIGRATION_BACKUP_KEY) !== savedBackup) fail('changed');
          verifiedWrite(storage, MIGRATION_BACKUP_KEY, compact);
          writeActive(storage, candidate, true);
        } catch (retryError) {
          if (blocked) throw retryError;
          failWrite(retryError);
        }
      }
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
        writeActive(storage, archive(value.state));
      } catch (error) { failWrite(error); }
    },
    removeItem() {
      storageOrFail().removeItem(FINANCE_KEY);
      activeRaw = null;
    },
  };
}

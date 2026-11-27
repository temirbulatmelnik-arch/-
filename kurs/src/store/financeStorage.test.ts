import { describe, expect, it } from 'vitest';
import { EMPTY_BOOK, expenseOperation, type AccountBook } from '../domain/accounts';
import type { Expense } from '../domain/types';
import { createFinanceStorage, digest, FINANCE_KEY, FINANCE_SCHEMA, LEGACY_KEY, MIGRATION_BACKUP_KEY, PREVIOUS_FINANCE_KEY,
  migrationProblem, packFinanceState, readMigrationBackup, stableJson, unpackFinanceState } from './financeStorage';

const expense: Expense = { id: 'purchase', amount: 120.25, date: '2026-11-26', source: 'life', category: 'groceries', createdAt: '2026-11-26T11:00:00Z' };
const operations = [JSON.parse(JSON.stringify(expenseOperation(expense, EMPTY_BOOK))) as ReturnType<typeof expenseOperation>];
const state = { expenses: [expense], accountBook: { ...EMPTY_BOOK, operations }, marks: { paid: true } };
type Fixture = typeof state;

function memory(version = 9) {
  const legacy = JSON.stringify({ version, state });
  const map = new Map<string, string>([[LEGACY_KEY, legacy]]);
  let refuse: string | null = null;
  let capacity = Infinity;
  const writes: string[] = [];
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === refuse) throw new Error('quota');
      const occupied = [...map].reduce((sum, [storedKey, storedValue]) =>
        sum + (storedKey === key ? 0 : storedKey.length + storedValue.length), 0);
      if (occupied + key.length + value.length > capacity) throw new DOMException('localStorage quota', 'QuotaExceededError');
      writes.push(key);
      map.set(key, value);
    },
    removeItem: (key: string) => { map.delete(key); },
  };
  const open = (verify: (before: Fixture, after: Fixture) => boolean = (a, b) => stableJson(a) === stableJson(b)) =>
    createFinanceStorage(() => storage, (input) => input as Fixture, verify);
  return { map, legacy, storage, writes, open, refuse: (key: typeof refuse) => { refuse = key; },
    limit: (units: number) => { capacity = units; } };
}

describe('двухфазный перенос локального журнала', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])('архивирует точное состояние исторической схемы %d и повторно открывает без записи', version => {
    const m = memory(version);
    const initial = m.open();
    expect(stableJson(initial.getItem(FINANCE_KEY))).toBe(stableJson({ version: FINANCE_SCHEMA, state }));
    expect(m.writes).toEqual([MIGRATION_BACKUP_KEY, FINANCE_KEY]);
    expect(m.map.get(LEGACY_KEY)).toBe(m.legacy);
    const saved = JSON.parse(m.map.get(MIGRATION_BACKUP_KEY)!);
    expect(saved.payload).toBe(m.legacy);
    expect(saved.checksum).toBe(digest(m.legacy));
    expect(readMigrationBackup(m.storage)).toEqual({ version, state: JSON.parse(JSON.stringify(state)) });
    expect(stableJson(m.open().getItem(FINANCE_KEY))).toBe(stableJson({ version: FINANCE_SCHEMA, state }));
    expect(m.writes).toHaveLength(2);
  });

  it('не записывает что-либо при проваленной проверке расчётов', () => {
    const m = memory();
    expect(() => m.open(() => false).getItem(FINANCE_KEY)).toThrow();
    expect(m.writes).toEqual([]);
    expect(m.map.get(LEGACY_KEY)).toBe(m.legacy);
  });

  it.each([MIGRATION_BACKUP_KEY, FINANCE_KEY])('восстанавливается после прерывания записи %s', key => {
    const m = memory();
    m.refuse(key);
    expect(() => m.open().getItem(FINANCE_KEY)).toThrow();
    expect(m.map.get(LEGACY_KEY)).toBe(m.legacy);
    expect(m.map.has(FINANCE_KEY)).toBe(false);
    m.refuse(null);
    expect(m.open().getItem(FINANCE_KEY)).toMatchObject({ version: FINANCE_SCHEMA, state });
    expect(m.writes).toEqual([MIGRATION_BACKUP_KEY, FINANCE_KEY]);
  });

  it('сохраняет обе версии, если старый PWA изменил данные после переноса', () => {
    const m = memory();
    const initial = m.open();
    initial.getItem(FINANCE_KEY);
    const saved = m.map.get(FINANCE_KEY);
    m.map.set(LEGACY_KEY, JSON.stringify({ version: 9, state: { ...state, marks: { paid: false } } }));
    const update = m.open();
    expect(update.getItem(FINANCE_KEY)).toMatchObject({ state });
    expect(migrationProblem()).toBe('changed');
    update.setItem(FINANCE_KEY, { version: FINANCE_SCHEMA, state: { ...state, expenses: [] } });
    expect(m.map.get(FINANCE_KEY)).toBe(saved);
    expect(readMigrationBackup(m.storage)).toMatchObject({ state });
  });

  it('отклоняет испорченный активный архив и сохраняет проверяемый исходник', () => {
    const m = memory();
    m.open().getItem(FINANCE_KEY);
    const original = JSON.parse(m.map.get(FINANCE_KEY)!);
    m.map.set(FINANCE_KEY, JSON.stringify({ ...original, payload: original.payload + ' ' }));
    expect(() => m.open().getItem(FINANCE_KEY)).toThrow();
    expect(migrationProblem()).toBe('verification');
    expect(readMigrationBackup(m.storage)).toMatchObject({ state });
  });

  it('убирает точную копию расхода и сохраняет исключение и порядок', () => {
    const custom = { ...operations[0], id: 'original', cashBooked: true };
    const book: AccountBook = { ...state.accountBook, operations: [custom, ...operations] };
    const packed = packFinanceState({ ...state, accountBook: book });
    expect(JSON.parse(packed).accountBook.operations).toMatchObject([{ id: 'original', cashBooked: true }, { expenseRef: expense.id }]);
    expect(stableJson(unpackFinanceState(packed))).toBe(stableJson({ ...state, accountBook: book }));
  });

  const largerState = { ...state, note: 'Сохранённая история и Unicode 🚢\n'.repeat(1000) };
  const largerSource = JSON.stringify({ version: 9, state: largerState });

  it('укладывает архив и журнал в квоту и сохраняет точные данные при повторном открытии', () => {
    const m = memory();
    m.map.set(LEGACY_KEY, largerSource);
    m.limit(largerSource.length + 4500);
    const opened = m.open();
    expect(opened.getItem(FINANCE_KEY)).toEqual({ version: FINANCE_SCHEMA, state: largerState });
    expect(JSON.parse(m.map.get(MIGRATION_BACKUP_KEY)!)).toMatchObject({ encoding: 'deflate', checksum: digest(largerSource) });
    expect(JSON.parse(m.map.get(FINANCE_KEY)!)).toMatchObject({ encoding: 'deflate' });
    expect(readMigrationBackup(m.storage)).toEqual({ version: 9, state: largerState });
    expect(m.map.get(LEGACY_KEY)).toBe(largerSource);
    opened.setItem(FINANCE_KEY, { version: FINANCE_SCHEMA, state });
    expect(m.open().getItem(FINANCE_KEY)).toEqual({ version: FINANCE_SCHEMA, state });
    expect(readMigrationBackup(m.storage)).toEqual({ version: 9, state: largerState });
  });

  it('переупаковывает проверенный архив от предыдущей попытки при заполненной квоте', () => {
    const m = memory();
    const backup = { version: 9, createdAt: '2026-11-27T13:00:00Z', payload: largerSource, checksum: digest(largerSource) };
    const saved = JSON.stringify(backup);
    m.map.set(LEGACY_KEY, largerSource);
    m.map.set(MIGRATION_BACKUP_KEY, saved);
    m.limit(largerSource.length + saved.length + 80);
    expect(m.open().getItem(FINANCE_KEY)).toEqual({ version: FINANCE_SCHEMA, state: largerState });
    expect(m.map.get(LEGACY_KEY)).toBe(largerSource);
    expect(JSON.parse(m.map.get(MIGRATION_BACKUP_KEY)!)).toMatchObject({
      encoding: 'deflate', createdAt: backup.createdAt, checksum: backup.checksum,
    });
    expect(readMigrationBackup(m.storage)).toEqual({ version: 9, state: largerState });
    expect(migrationProblem()).toBeNull();
  });

  it('показывает нехватку места, если даже компактная копия не помещается', () => {
    const m = memory();
    m.map.set(LEGACY_KEY, largerSource);
    m.limit(largerSource.length + LEGACY_KEY.length);
    expect(() => m.open().getItem(FINANCE_KEY)).toThrow();
    expect(migrationProblem()).toBe('quota');
    expect(m.map.get(LEGACY_KEY)).toBe(largerSource);
    expect(m.map.has(FINANCE_KEY)).toBe(false);
    expect(m.writes).toEqual([]);
  });
});

it('переносит архив alpha.3 с изменениями после обновления и сохраняет его байт в байт', () => {
  const memoryStore = memory();
  const original = { ...state, marks: { paid: false } };
  const payload = packFinanceState(original);
  const archive = JSON.stringify({ version: 10, payload, checksum: digest(payload), legacyChecksum: digest(memoryStore.legacy) });
  memoryStore.map.set(PREVIOUS_FINANCE_KEY, archive);
  memoryStore.refuse(FINANCE_KEY);
  expect(() => memoryStore.open().getItem(FINANCE_KEY)).toThrow();
  expect(memoryStore.map.get(PREVIOUS_FINANCE_KEY)).toBe(archive);
  expect(memoryStore.map.has(FINANCE_KEY)).toBe(false);
  memoryStore.refuse(null);
  expect(memoryStore.open().getItem(FINANCE_KEY)).toMatchObject({ version: FINANCE_SCHEMA, state: original });
  expect(readMigrationBackup(memoryStore.storage)).toEqual({ version: 10, state: JSON.parse(JSON.stringify(original)) });
  expect(memoryStore.map.get(PREVIOUS_FINANCE_KEY)).toBe(archive);
  const active = memoryStore.map.get(FINANCE_KEY);
  memoryStore.open().getItem(FINANCE_KEY);
  expect(memoryStore.map.get(FINANCE_KEY)).toBe(active);
});

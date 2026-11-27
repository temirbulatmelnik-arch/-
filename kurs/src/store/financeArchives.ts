import { digest, LEGACY_KEY, MIGRATION_BACKUP_KEY, PREVIOUS_FINANCE_KEY } from './financeStorage';

const databaseName = 'kurs-finance-archives';
const storeName = 'snapshots';
const referencePrefix = '@kurs-archive:';
const sources = [LEGACY_KEY, PREVIOUS_FINANCE_KEY, MIGRATION_BACKUP_KEY];
export const historicalFinanceArchives = [MIGRATION_BACKUP_KEY, 'kurs:before-0.9.0', 'kurs:before-0.7.1', 'kurs:before-0.6.0'];
const opened = new Map<string, string>();

const archiveId = (key: string, reference: string) => `${key}:${reference.slice(referencePrefix.length)}`;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onblocked = () => reject(new Error('archive database is busy'));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('archive transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('archive transaction failed'));
  });
}

async function readArchives(database: IDBDatabase, ids: string[]) {
  const transaction = database.transaction(storeName, 'readonly');
  const done = completed(transaction);
  const entries = ids.map(id => new Promise<string>((resolve, reject) => {
    const request = transaction.objectStore(storeName).get(id);
    request.onsuccess = () => {
      if (typeof request.result === 'string') resolve(request.result);
      else reject(new Error('archive record missing'));
    };
    request.onerror = () => reject(request.error);
  }));
  const [bytes] = await Promise.all([Promise.all(entries), done]);
  return bytes;
}

export function financeLocalStorage() {
  const local = window.localStorage;
  return {
    getItem(key: string) {
      const raw = local.getItem(key);
      if (!raw?.startsWith(referencePrefix)) return raw;
      const data = opened.get(archiveId(key, raw));
      if (data === undefined) throw new Error('archive has not been read');
      return data;
    },
    setItem: (key: string, value: string) => local.setItem(key, value),
    removeItem: (key: string) => local.removeItem(key),
  };
}

export async function loadFinanceArchives(local: Storage) {
  const entries = sources.flatMap(key => {
    const reference = local.getItem(key);
    return reference?.startsWith(referencePrefix) ? [{ key, reference }] : [];
  });
  if (!entries.length) return;
  const database = await openDatabase();
  try {
    const ids = entries.map(({ key, reference }) => archiveId(key, reference));
    const bytes = await readArchives(database, ids);
    entries.forEach(({ reference }, index) => {
      if (reference !== referencePrefix + digest(bytes[index])) throw new Error('archive checksum mismatch');
      opened.set(ids[index], bytes[index]);
    });
  } finally { database.close(); }
}

/** Save and read back the exact bytes before replacing any local copy with a reference. */
export async function relocateFinanceArchives(local: Storage, keys: string[]) {
  const entries = keys.flatMap(key => {
    const raw = local.getItem(key);
    if (!raw || raw.startsWith(referencePrefix) || raw.length <= referencePrefix.length + 64) return [];
    const reference = referencePrefix + digest(raw);
    return [{ key, raw, reference, id: archiveId(key, reference) }];
  });
  if (!entries.length) return false;

  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, 'readwrite');
    const done = completed(transaction);
    const snapshots = transaction.objectStore(storeName);
    for (const { id, raw } of entries) snapshots.put(raw, id);
    await done;
    const bytes = await readArchives(database, entries.map(entry => entry.id));
    if (entries.some(({ raw }, index) => raw !== bytes[index])) throw new Error('archive read-back mismatch');

    let relocated = false;
    for (const { key, raw, reference, id } of entries) {
      if (local.getItem(key) !== raw) continue;
      opened.set(id, raw);
      local.setItem(key, reference);
      if (local.getItem(key) !== reference) throw new Error('archive reference was not saved');
      relocated = true;
    }
    return relocated;
  } finally { database.close(); }
}

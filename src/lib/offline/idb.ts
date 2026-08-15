/**
 * Tiny promise wrapper around IndexedDB — no dependencies, safe in SSR/test
 * environments where `indexedDB` is unavailable (all calls become no-ops).
 */

const DB_NAME = "gradr-offline";
const DB_VERSION = 1;

export const STORES = {
  resumeVersions: "resume_versions",
  resumeFiles: "resume_files",
  pendingOps: "pending_ops",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.resumeVersions)) {
        const store = db.createObjectStore(STORES.resumeVersions, { keyPath: "id" });
        store.createIndex("user_id", "user_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.resumeFiles)) {
        db.createObjectStore(STORES.resumeFiles, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.pendingOps)) {
        db.createObjectStore(STORES.pendingOps, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(name, mode);
      const request = run(tx.objectStore(name));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function idbGet<T>(store: StoreName, key: IDBValidKey) {
  return withStore<T>(store, "readonly", (s) => s.get(key));
}

export function idbGetAll<T>(store: StoreName) {
  return withStore<T[]>(store, "readonly", (s) => s.getAll()).then((rows) => rows ?? []);
}

export function idbPut<T>(store: StoreName, value: T) {
  return withStore(store, "readwrite", (s) => s.put(value as unknown as never));
}

export function idbDelete(store: StoreName, key: IDBValidKey) {
  return withStore(store, "readwrite", (s) => s.delete(key));
}

export function idbClear(store: StoreName) {
  return withStore(store, "readwrite", (s) => s.clear());
}

export async function idbPutMany<T>(store: StoreName, values: T[]) {
  for (const value of values) {
    await idbPut(store, value);
  }
}

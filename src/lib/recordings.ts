/**
 * Speaking recordings are kept ONLY on this device, in the browser's IndexedDB.
 * Nothing is uploaded. Clearing site data deletes them. Falls back to memory when IndexedDB is unavailable.
 */
export interface Clip { blob: Blob; mime: string; durationSec: number; savedAt: number }

const DB = 'miyu-recordings';
const STORE = 'clips';
const memory = new Map<string, Clip>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve) => {
    if (!d) return resolve(undefined);
    try {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

/** true when recordings survive a reload on this device */
export const persistentStorage = async () => !!(await db());

export async function saveClip(key: string, clip: Clip): Promise<void> {
  memory.set(key, clip);
  await tx('readwrite', (s) => s.put(clip, key));
}
export async function getClip(key: string): Promise<Clip | undefined> {
  return memory.get(key) ?? (await tx<Clip>('readonly', (s) => s.get(key)));
}
export async function deleteClip(key: string): Promise<void> {
  memory.delete(key);
  await tx('readwrite', (s) => s.delete(key));
}

/**
 * Trvalé uložení offline fronty v prohlížeči (IndexedDB, záložně localStorage).
 * Přežije zavření prohlížeče i restart telefonu. Jen pro klientské komponenty.
 */
import { reviveQueue, type QueueState } from "./queue-core";

const DB_NAME = "mcvv-splits";
const STORE = "kv";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function db() {
  dbPromise ??= openDb();
  return dbPromise;
}

export function queueKey(year: number, userId: number): string {
  return `queue:${year}:${userId}`;
}

export async function loadValue<T>(key: string): Promise<T | null> {
  const database = await db();
  if (!database) {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(`${DB_NAME}:${key}`) : null;
    return raw ? (JSON.parse(raw) as T) : null;
  }
  return new Promise((resolve) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

export async function saveValue(key: string, value: unknown): Promise<void> {
  const database = await db();
  if (!database) {
    localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value));
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = database.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function loadQueue(key: string): Promise<QueueState> {
  return reviveQueue(await loadValue(key));
}

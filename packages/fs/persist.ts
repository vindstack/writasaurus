import type { FolderHandle, PermissionMode } from "./files.ts";

const DB_NAME = "writasaurus-fs";
const STORE = "folders";
const DEFAULT_KEY = "default";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function rememberFolder(dir: FolderHandle, key = DEFAULT_KEY): Promise<void> {
  await run("readwrite", (store) => store.put(dir, key));
}

export async function forgetFolder(key = DEFAULT_KEY): Promise<void> {
  await run("readwrite", (store) => store.delete(key));
}

/**
 * Loads a remembered folder. Returns `null` if none is stored or permission is denied.
 * Re-requesting permission requires a user gesture.
 */
export async function restoreFolder(
  key = DEFAULT_KEY,
  mode: PermissionMode = "readwrite",
): Promise<FolderHandle | null> {
  const dir = await run<FolderHandle | undefined>("readonly", (store) => store.get(key));
  if (!dir) return null;
  if (typeof dir.queryPermission !== "function") return dir;
  if ((await dir.queryPermission({ mode })) === "granted") return dir;
  try {
    return (await dir.requestPermission({ mode })) === "granted" ? dir : null;
  } catch {
    return null;
  }
}

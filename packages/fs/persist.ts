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
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Storage transaction aborted."));
    });
  } finally {
    db.close();
  }
}

export async function rememberFolderData<T>(
  dir: FolderHandle,
  data: T,
  key: string,
): Promise<void> {
  await run("readwrite", (store) => store.put({ folder: dir, data }, key));
}

/** Loads a handle without requesting permission, so callers can prompt from a user gesture. */
export async function loadRememberedFolderData<T>(
  key: string,
): Promise<{ folder: FolderHandle; data: T } | null> {
  return (
    (await run<{ folder: FolderHandle; data: T } | undefined>("readonly", (store) =>
      store.get(key),
    )) ?? null
  );
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

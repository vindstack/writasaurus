/**
 * clientstorage.ts
 *
 * Tiny wrapper around browser Storage (sessionStorage / localStorage).
 *
 * - createStorage(prefix: string, type: "localStorage" | "sessionStorage" = "sessionStorage")
 *   returns an object with: getItem<T>(key): T | null, setItem<T>(key, value): boolean,
 *   removeItem(key): void, clear(): void, hasKey(key): boolean
 *
 * Behavior:
 * - Keys are namespaced by prefix: stored key is `${prefix}${key}`.
 * - Values are JSON.stringify'd on set, JSON.parse'd on get.
 * - Errors (parse, quota, unavailable storage) are caught and logged to console.
 *
 * Caveats:
 * - globalThis.localStorage / sessionStorage are not available during SSR.
 *   Only call from browser environment or guard with `typeof globalThis !== 'undefined'`.
 * - clear() currently calls store.clear() which clears the entire storage for the origin.
 *   If you want to only remove keys for the prefix, implement clearPrefix:
 *
 *     for (let i = store.length - 1; i >= 0; i--) {
 *       const k = store.key(i);
 *       if (k?.startsWith(prefix)) store.removeItem(k);
 *     }
 *
 * Minimal usage:
 * import { createStorage } from './clientstorage';
 *
 * const store = createStorage('myApp:', 'sessionStorage');
 * store.setItem('user', { id: 1, name: 'Alice' });
 * const user = store.getItem<{ id: number; name: string }>('user');
 * if (user) console.log(user.name);
 */

type StorageType = "localStorage" | "sessionStorage";

export const createStorage = (prefix: string, type: StorageType = "sessionStorage") => {
  const getStore = () => {
    const store = type === "localStorage" ? globalThis.localStorage : globalThis.sessionStorage;
    if (!store) throw new Error(`${type} is unavailable.`);
    return store;
  };
  const getKey = (key: string) => `${prefix}${key}`;

  const getItem = <T>(key: string): T | null => {
    try {
      const item = getStore().getItem(getKey(key));
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.error(`Error reading item from storage: ${e}`);
      return null;
    }
  };

  const setItem = <T>(key: string, value: T): boolean => {
    try {
      getStore().setItem(getKey(key), JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Error setting item in storage: ${e}`);
      return false;
    }
  };

  const removeItem = (key: string): void => {
    try {
      getStore().removeItem(getKey(key));
    } catch (e) {
      console.error(`Error removing item from storage: ${e}`);
    }
  };

  const clear = (): void => {
    try {
      getStore().clear();
    } catch (e) {
      console.error(`Error clearing storage: ${e}`);
    }
  };

  const hasKey = (key: string): boolean => {
    try {
      return getStore().getItem(getKey(key)) !== null;
    } catch (e) {
      console.error(`Error checking key in storage: ${e}`);
      return false;
    }
  };

  return {
    getItem,
    setItem,
    removeItem,
    clear,
    hasKey,
  };
};

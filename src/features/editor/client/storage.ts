import { createStorage } from "../../../../lib/clientstorage/clientstorage.ts";
import type { Manuscript, WritableFileHandle } from "./types.ts";

export const HANDLE_KEY = "active-file-handle";

/**
 * Manuscript state is cached in sessionStorage only. It exists purely to survive
 * same-tab reloads (e.g. dev watch mode); it is never used to remember a manuscript
 * across app restarts. Reopening the app always re-reads the active file from disk
 * (desktop) or asks the user to open a file (browser).
 */
const manuscriptStore = createStorage("writasaurus-manuscript-v1:", "sessionStorage");
const MANUSCRIPT_KEY = "state";

const sessionFlagsStore = createStorage("writasaurus-session:", "sessionStorage");
const SKIP_WELCOME_KEY = "skip-welcome";

export function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("WritasaurusDB", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeHandle(value: WritableFileHandle | null): Promise<void> {
  try {
    const db = await database();
    const transaction = db.transaction("handles", "readwrite");
    if (value) transaction.objectStore("handles").put(value, HANDLE_KEY);
    else transaction.objectStore("handles").delete(HANDLE_KEY);
  } catch (error) {
    console.warn("Could not persist the file handle.", error);
  }
}

export async function restoreHandle(): Promise<WritableFileHandle | null> {
  try {
    const db = await database();
    return await new Promise((resolve, reject) => {
      const request = db.transaction("handles").objectStore("handles").get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("Could not restore the file handle.", error);
    return null;
  }
}

export interface ManuscriptSessionState {
  manuscript: Manuscript;
  activeChapter: number;
  hasUnsavedChanges?: boolean;
}

export function saveLocal(
  manuscript: Manuscript,
  activeChapter: number,
  hasUnsavedChanges = false,
): void {
  manuscriptStore.setItem<ManuscriptSessionState>(MANUSCRIPT_KEY, {
    manuscript,
    activeChapter,
    hasUnsavedChanges,
  });
}

export function restoreLocal(): ManuscriptSessionState | null {
  const state = manuscriptStore.getItem<ManuscriptSessionState>(MANUSCRIPT_KEY);
  if (!state?.manuscript?.chapters?.length) return null;
  return {
    manuscript: state.manuscript,
    activeChapter: Math.min(
      Number(state.activeChapter) || 0,
      state.manuscript.chapters.length - 1,
    ),
    hasUnsavedChanges: Boolean(state.hasUnsavedChanges),
  };
}

export function clearLocal(): void {
  manuscriptStore.removeItem(MANUSCRIPT_KEY);
}

/**
 * Set when the user explicitly returns to the editor from the welcome screen, so the
 * next load doesn't immediately bounce back to /welcome for an empty manuscript.
 */
export function setSkipWelcome(): void {
  sessionFlagsStore.setItem<boolean>(SKIP_WELCOME_KEY, true);
}

export function shouldSkipWelcome(): boolean {
  return sessionFlagsStore.getItem<boolean>(SKIP_WELCOME_KEY) === true;
}

import { createStorage } from "../clientstorage/clientstorage.ts";
import type { Manuscript } from "./types.ts";

/**
 * Manuscript state is cached in sessionStorage only. It exists purely to survive
 * same-tab reloads (e.g. dev watch mode); it is never used to remember a manuscript
 * across app restarts. Reopening the app re-reads the active file from disk.
 */
const manuscriptStore = createStorage("writasaurus-manuscript-v1:", "sessionStorage");
const MANUSCRIPT_KEY = "state";

const sessionFlagsStore = createStorage("writasaurus-session:", "sessionStorage");
const SKIP_WELCOME_KEY = "skip-welcome";

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

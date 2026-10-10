import { batch } from "@preact/signals";
import { blankManuscript } from "./data.ts";
import { editorHistory } from "./history.ts";
import { activeChapterIndex, hasUnsavedChanges, manuscript, replaceManuscript } from "./state.ts";
import { restoreLocal, shouldSkipWelcome } from "./storage.ts";
import { isEpubFilename } from "../epub.ts";
import { applyFontPreference, getFontPreference } from "../../../../../packages/shared/settings.ts";

export async function startNewManuscript(): Promise<void> {
  replaceManuscript(blankManuscript(), { desktopFileLoaded: false, hasUnsavedChanges: true });
  editorHistory.clear();

  try {
    const response = await fetch("/api/editor/close", { method: "POST" });
    if (!response.ok) throw new Error(`Could not close active manuscript: ${response.status}`);
  } catch (error) {
    console.warn("Could not clear the previously active desktop manuscript.", error);
  }
}

/** Loads the desktop file the native shell already has open, if there is one. */
async function restoreDesktopFile(): Promise<boolean> {
  try {
    const response = await fetch("/api/editor/status");
    if (!response.ok) return false;
    const status = await response.json();
    if (typeof status.activeFile !== "string" || !status.manuscript) {
      return false;
    }
    replaceManuscript(status.manuscript, { desktopFileLoaded: true });
    editorHistory.clear();
    return true;
  } catch {
    return false;
  }
}

function restoreSession(): boolean {
  const saved = restoreLocal();
  if (!saved || !isEpubFilename(saved.manuscript.filename)) return false;
  batch(() => {
    manuscript.value = saved.manuscript;
    activeChapterIndex.value = saved.activeChapter;
    hasUnsavedChanges.value = Boolean(saved.hasUnsavedChanges);
  });
  editorHistory.clear();
  return true;
}

/**
 * Restores the previous document or cached session and applies the saved editor font. Resolves to
 * false when the user should be sent to the welcome page.
 */
export async function restoreEditor(): Promise<boolean> {
  const opened = await restoreDesktopFile() || restoreSession();

  applyFontPreference(getFontPreference());
  return opened || shouldSkipWelcome();
}

import { batch } from "@preact/signals";
import { editorHistory } from "./history.ts";
import { activeChapterIndex, hasUnsavedChanges, manuscript, replaceManuscript } from "./state.ts";
import { restoreLocal, shouldSkipWelcome } from "./storage.ts";
import { isEpubFilename } from "../epub.ts";
import { applyFontPreference } from "../../../../../packages/shared/settings.ts";
import { getFontPreference } from "../app-settings-client.ts";

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
  const opened = (await restoreDesktopFile()) || restoreSession();

  applyFontPreference(getFontPreference());
  return opened || shouldSkipWelcome();
}

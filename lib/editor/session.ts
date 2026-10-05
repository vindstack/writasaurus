import { batch } from "@preact/signals";
import { blankManuscript } from "./data.ts";
import { loadFile } from "./file-io.ts";
import { editorHistory } from "./history.ts";
import {
  activeChapterIndex,
  canWrite,
  fileHandle,
  hasUnsavedChanges,
  isDesktop,
  manuscript,
  replaceManuscript,
} from "./state.ts";
import { restoreHandle, restoreLocal, shouldSkipWelcome, storeHandle } from "./storage.ts";
import { hasWritePermission } from "../open-manuscript.ts";
import { isEpubFilename } from "../epub.ts";
import {
  applyFontPreference,
  applyThemePreference,
  getFontPreference,
  getThemePreference,
} from "../settings.ts";

export async function startNewManuscript(): Promise<void> {
  replaceManuscript(blankManuscript(), { desktopFileLoaded: false, hasUnsavedChanges: true });
  await storeHandle(null);
  editorHistory.clear();

  if (!isDesktop.peek()) return;
  try {
    const response = await fetch("/api/editor/close", { method: "POST" });
    if (!response.ok) throw new Error(`Could not close active manuscript: ${response.status}`);
  } catch (error) {
    console.warn("Could not clear the previously active desktop manuscript.", error);
  }
}

async function restoreFileHandle(): Promise<boolean> {
  const handle = await restoreHandle();
  if (!handle) return false;
  if (!isEpubFilename(handle.name)) {
    await storeHandle(null);
    return false;
  }

  try {
    const file = await handle.getFile();
    if (!isEpubFilename(file.name)) {
      await storeHandle(null);
      return false;
    }
    await loadFile(file, handle, await hasWritePermission(handle, false));
    editorHistory.clear();
    return true;
  } catch {
    batch(() => {
      fileHandle.value = null;
      canWrite.value = false;
    });
    await storeHandle(null);
    return false;
  }
}

/** Loads the desktop file the native shell already has open, if there is one. */
async function restoreDesktopFile(): Promise<boolean> {
  try {
    const response = await fetch("/api/editor/status");
    if (!response.ok) return false;
    const status = await response.json();
    isDesktop.value = status.isDesktop === true;
    if (!isDesktop.peek() || typeof status.activeFile !== "string" || !status.manuscript) {
      return false;
    }
    replaceManuscript(status.manuscript, { desktopFileLoaded: true });
    editorHistory.clear();
    return true;
  } catch {
    isDesktop.value = false;
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
 * Restores the previous document (desktop file, browser file handle, or cached session) and
 * applies saved appearance. Resolves to false when the user should be sent to the welcome page.
 */
export async function restoreEditor(): Promise<boolean> {
  const desktopOpened = await restoreDesktopFile();
  const handleOpened = desktopOpened ? false : await restoreFileHandle();
  const opened = desktopOpened || handleOpened || restoreSession();

  applyFontPreference(getFontPreference());
  applyThemePreference(getThemePreference());
  return opened || shouldSkipWelcome();
}

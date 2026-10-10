import { editorHistory } from "./history.ts";
import { saveEpubToDisk, saveToDisk } from "./file-io.ts";
import { getEditor } from "./surface.ts";
import { hasUnsavedChanges, syncChapter } from "./state.ts";

/** Saves to the current file, only when there is something to save. */
export async function save(): Promise<void> {
  if (!hasUnsavedChanges.peek()) return;
  const editor = getEditor();
  if (!editor) return;
  syncChapter(editor);
  await saveToDisk();
  editorHistory.saveCurrentState();
}

export async function saveAsEpub(): Promise<void> {
  const editor = getEditor();
  if (editor) syncChapter(editor);
  await saveEpubToDisk();
  editorHistory.saveCurrentState();
}

export async function quit(): Promise<void> {
  if (
    hasUnsavedChanges.peek() &&
    confirm("You have unsaved changes. Do you want to save before closing?")
  ) {
    await save();
  }
  if (hasUnsavedChanges.peek()) return;
  try {
    await fetch("/api/editor/exit", { method: "POST" });
  } catch {
    // The native app may already be closing.
  }
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    console.error("Could not toggle fullscreen mode.", error);
  }
}

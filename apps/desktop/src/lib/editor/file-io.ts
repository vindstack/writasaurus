import type { Manuscript } from "./types.ts";
import {
  desktopFileLoaded,
  hasUnsavedChanges,
  manuscript,
  replaceManuscript,
  saveMessage,
} from "./state.ts";
import { epubFilename, isEpubFilename, parseEpub } from "../epub.ts";
import { requestOpen } from "../open-manuscript.ts";
import { editorHistory } from "./history.ts";
import { batch } from "@preact/signals";

export async function loadFile(file: File): Promise<void> {
  if (!isEpubFilename(file.name)) {
    throw new Error("Only EPUB manuscripts can be opened.");
  }
  const parsed = await parseEpub(new Uint8Array(await file.arrayBuffer()), file.name);
  replaceManuscript(parsed, { desktopFileLoaded: false });
  editorHistory.clear();
}

async function saveOnDesktop(current: Manuscript, saveAs: boolean): Promise<void> {
  try {
    const response = await fetch("/api/editor/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manuscript: current,
        filename: epubFilename(current),
        saveAs: saveAs || !desktopFileLoaded.peek(),
      }),
    });
    if (response.status === 204) return;
    if (!response.ok) throw new Error(`Disk save failed: ${response.status}`);
    const result = await response.json();
    batch(() => {
      manuscript.value = { ...manuscript.peek(), filename: result.name };
      desktopFileLoaded.value = true;
      hasUnsavedChanges.value = false;
      saveMessage.value = "";
    });
  } catch (error) {
    console.error("Desktop save failed:", error);
    saveMessage.value = "Save failed";
  }
}

export async function saveToDisk(saveAs = false): Promise<void> {
  await saveOnDesktop(manuscript.peek(), saveAs);
}

export function saveEpubToDisk(): Promise<void> {
  return saveToDisk(true);
}

/** Opens a manuscript via the native dialog. */
export async function openManuscript(): Promise<void> {
  const result = await requestOpen();
  if (result.kind === "cancelled") return;
  if (result.kind === "opened") {
    // The server already owns the active path; adopt the manuscript it returned.
    desktopFileLoaded.value = true;
    if (result.manuscript) {
      replaceManuscript(result.manuscript, { desktopFileLoaded: true });
      editorHistory.clear();
    }
  }
}

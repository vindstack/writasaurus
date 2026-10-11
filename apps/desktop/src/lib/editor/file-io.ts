import type { Manuscript } from "./types.ts";
import {
  desktopFileLoaded,
  hasUnsavedChanges,
  manuscript,
  replaceManuscript,
  saveMessage,
} from "./state.ts";
import { epubFilename } from "../epub.ts";
import { requestProject } from "../open-project.ts";
import { editorHistory } from "./history.ts";
import { batch } from "@preact/signals";

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

export async function openProject(): Promise<void> {
  const result = await requestProject();
  if (result.kind === "cancelled") return;
  replaceManuscript(result.manuscript, { desktopFileLoaded: true });
  editorHistory.clear();
}

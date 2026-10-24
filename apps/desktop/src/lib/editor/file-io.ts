import type { Manuscript } from "./types.ts";
import {
  desktopFileLoaded,
  editorMode,
  hasUnsavedChanges,
  manuscript,
  outlineContent,
  outlineHasUnsavedChanges,
  outlineSaveMessage,
  replaceManuscript,
  replaceOutline,
  saveMessage,
} from "./state.ts";
import { epubFilename } from "../epub.ts";
import { requestProject } from "../open-project.ts";
import { editorHistory } from "./history.ts";
import { batch } from "@preact/signals";

let outlineSaveQueue: Promise<boolean> = Promise.resolve(true);

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

export async function saveOutlineToDisk(content = outlineContent.peek()): Promise<boolean> {
  const save = async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/editor/outline/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Outline save failed: ${response.status}`);
      }
      if (outlineContent.peek() === content) {
        outlineHasUnsavedChanges.value = false;
        outlineSaveMessage.value = "";
        return true;
      }
      return false;
    } catch (error) {
      console.error("Outline save failed:", error);
      outlineSaveMessage.value = "Outline save failed";
      return false;
    }
  };
  const queuedSave = outlineSaveQueue.then(save);
  outlineSaveQueue = queuedSave;
  return await queuedSave;
}

export async function requestOutline(): Promise<string> {
  const response = await fetch("/api/editor/outline/open", { method: "POST" });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Outline open failed: ${response.status}`);
  }
  const result = await response.json();
  if (typeof result.content !== "string") throw new Error("The project outline was invalid.");
  return result.content;
}

export function saveEpubToDisk(): Promise<void> {
  return saveToDisk(true);
}

export async function openProject(): Promise<void> {
  if (editorMode.peek() === "outline" && outlineHasUnsavedChanges.peek()) {
    if (!(await saveOutlineToDisk())) return;
  }
  if (editorMode.peek() === "outline" && hasUnsavedChanges.peek()) {
    await saveToDisk();
    if (hasUnsavedChanges.peek()) return;
  }
  const result = await requestProject();
  if (result.kind === "cancelled") return;
  editorMode.value = "manuscript";
  replaceOutline("");
  replaceManuscript(result.manuscript, { desktopFileLoaded: true });
  editorHistory.clear();
}

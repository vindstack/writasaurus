import type { Manuscript } from "./types.ts";
import {
  projectLoaded,
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
import { epubFilename, generateEpub } from "../epub.ts";
import { requestProject } from "../open-project.ts";
import {
  getActiveFolder,
  getActivePath,
  exportEpub,
  loadOrCreateOutline,
  pickEpubFile,
  writeManuscript,
  writeOutline,
} from "../editor-session.ts";
import { editorHistory } from "./history.ts";
import { batch } from "@preact/signals";

let outlineSaveQueue: Promise<boolean> = Promise.resolve(true);
let manuscriptSaveQueue: Promise<void> = Promise.resolve();

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function saveOnProject(
  current: Manuscript,
  folder: ReturnType<typeof getActiveFolder>,
  filename: string | null,
): Promise<void> {
  try {
    if (!folder || !filename) throw new Error("Open a project before saving.");
    await writeManuscript(folder, filename, current);
    if (
      getActiveFolder() === folder &&
      getActivePath() === filename &&
      manuscript.peek() === current
    ) {
      batch(() => {
        projectLoaded.value = true;
        hasUnsavedChanges.value = false;
        saveMessage.value = "";
      });
    }
  } catch (error) {
    console.error("Project save failed:", error);
    saveMessage.value = error instanceof Error ? `Save failed: ${error.message}` : "Save failed";
  }
}

export async function saveToDisk(saveAs = false): Promise<void> {
  const current = manuscript.peek();
  if (saveAs) {
    try {
      if (typeof globalThis.showSaveFilePicker === "function") {
        const destination = await pickEpubFile(epubFilename(current));
        if (destination) await exportEpub(destination, current);
      } else {
        const bytes = await generateEpub(current);
        download(
          new Blob([new Uint8Array(bytes)], { type: "application/epub+zip" }),
          epubFilename(current),
        );
      }
    } catch (error) {
      console.error("EPUB export failed:", error);
      saveMessage.value = "EPUB export failed";
    }
    return;
  }
  const folder = projectLoaded.peek() ? getActiveFolder() : null;
  const filename = projectLoaded.peek() ? getActivePath() : null;
  const queued = manuscriptSaveQueue.then(() => saveOnProject(current, folder, filename));
  manuscriptSaveQueue = queued;
  await queued;
}

export async function saveOutlineToDisk(content = outlineContent.peek()): Promise<boolean> {
  const save = async (): Promise<boolean> => {
    try {
      if (!projectLoaded.peek()) throw new Error("Open a project before saving the outline.");
      await writeOutline(content);
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
  if (!projectLoaded.peek()) throw new Error("Open a project before using the outline.");
  return await loadOrCreateOutline();
}

export function saveEpubToDisk(): Promise<void> {
  return saveToDisk(true);
}

export function exportOutline(): void {
  download(new Blob([outlineContent.peek()], { type: "text/markdown" }), "Outline.md");
}

export async function openProject(): Promise<void> {
  const result = await requestProject(async () => {
    if (!projectLoaded.peek() && (hasUnsavedChanges.peek() || outlineHasUnsavedChanges.peek())) {
      return confirm(
        "Your recovered changes are not connected to a project. Export your manuscript and outline first. Discard these changes and open another project?",
      );
    }
    if (outlineHasUnsavedChanges.peek() && !(await saveOutlineToDisk())) return false;
    if (hasUnsavedChanges.peek()) {
      await saveToDisk();
      if (hasUnsavedChanges.peek()) return false;
    }
    return true;
  });
  if (result.kind === "cancelled") return;
  editorMode.value = "manuscript";
  replaceOutline("");
  replaceManuscript(result.manuscript, { projectLoaded: true });
  editorHistory.clear();
}

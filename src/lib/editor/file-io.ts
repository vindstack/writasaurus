import type { Manuscript, WritableFileHandle } from "./types.ts";
import { storeHandle } from "./storage.ts";
import {
  canWrite,
  desktopFileLoaded,
  fileHandle,
  hasUnsavedChanges,
  isDesktop,
  manuscript,
  markSaved,
  replaceManuscript,
  saveMessage,
} from "./state.ts";
import { epubFilename, generateEpub, isEpubFilename, parseEpub } from "../epub.ts";
import { EPUB_TYPES, hasWritePermission, requestOpen } from "../open-manuscript.ts";
import { editorHistory } from "./history.ts";
import { batch } from "@preact/signals";

const filePicker = globalThis as unknown as {
  showSaveFilePicker?: (options: object) => Promise<WritableFileHandle>;
};

export async function loadFile(
  file: File,
  handle: WritableFileHandle | null = null,
  writable = false,
): Promise<void> {
  if (!isEpubFilename(file.name)) {
    throw new Error("Only EPUB manuscripts can be opened.");
  }
  const parsed = await parseEpub(new Uint8Array(await file.arrayBuffer()), file.name);
  replaceManuscript(parsed, { fileHandle: handle, canWrite: writable });
  await storeHandle(handle);
}

async function writeFile(handle: WritableFileHandle, current: Manuscript): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(await generateEpub(current));
  await writable.close();
  markSaved();
}

async function download(current: Manuscript): Promise<void> {
  const bytes = await generateEpub(current);
  const url = URL.createObjectURL(
    new Blob([bytes as unknown as BlobPart], { type: "application/epub+zip" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = epubFilename(current);
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  markSaved("Saved");
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
  const current = manuscript.peek();

  if (isDesktop.peek()) {
    await saveOnDesktop(current, saveAs);
    return;
  }

  const existing = fileHandle.peek();
  if (existing && !saveAs) {
    try {
      const writable = await hasWritePermission(existing, true);
      canWrite.value = writable;
      if (writable) {
        await writeFile(existing, current);
        return;
      }
    } catch (error) {
      console.warn("The previous file handle is no longer writable.", error);
      batch(() => {
        fileHandle.value = null;
        canWrite.value = false;
      });
      await storeHandle(null);
    }
  }

  if (!filePicker.showSaveFilePicker) {
    await download(current);
    return;
  }

  try {
    const handle = await filePicker.showSaveFilePicker({
      suggestedName: epubFilename(current),
      types: EPUB_TYPES,
    });
    batch(() => {
      fileHandle.value = handle;
      canWrite.value = true;
      manuscript.value = { ...manuscript.peek(), filename: handle.name };
    });
    await storeHandle(handle);
    await writeFile(handle, manuscript.peek());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    console.warn("Native save picker failed; using a download instead.", error);
    await download(current);
  }
}

export function saveEpubToDisk(): Promise<void> {
  return saveToDisk(true);
}

/** Opens a manuscript via the native dialog; resolves to false when the file input is needed. */
export async function openManuscript(fileInput: HTMLInputElement | null): Promise<void> {
  const result = await requestOpen(isDesktop.peek());
  if (result.kind === "cancelled") return;
  if (result.kind === "input") {
    fileInput?.click();
    return;
  }
  if (result.kind === "desktop") {
    // The server already owns the active path; adopt the manuscript it returned.
    desktopFileLoaded.value = true;
    if (result.manuscript) {
      replaceManuscript(result.manuscript, { desktopFileLoaded: true });
      editorHistory.clear();
    }
    return;
  }
  await loadFile(result.file, result.handle, await hasWritePermission(result.handle, false));
  editorHistory.clear();
}

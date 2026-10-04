import type { Manuscript, WritableFileHandle } from "./types.ts";
import { storeHandle } from "./storage.ts";
import { editorStore, markSaved, state } from "./state.ts";
import { epubFilename, generateEpub } from "../../../../lib/epub.ts";

const filePicker = globalThis as unknown as {
  showSaveFilePicker?: (options: object) => Promise<WritableFileHandle>;
  showOpenFilePicker?: (options: object) => Promise<WritableFileHandle[]>;
};

export const EPUB_TYPES = [{
  description: "EPUB eBook",
  accept: {
    "application/epub+zip": [".epub"],
  },
}];

export async function hasWritePermission(
  handle: WritableFileHandle,
  request: boolean,
): Promise<boolean> {
  if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return request && (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

export async function writeFile(
  handle: WritableFileHandle,
  manuscript: Manuscript,
): Promise<void> {
  const writable = await handle.createWritable();
  const bytes = await generateEpub(manuscript);
  await writable.write(bytes);
  await writable.close();
  markSaved();
}

export async function download(manuscript: Manuscript): Promise<void> {
  const bytes = await generateEpub(manuscript);
  const filename = epubFilename(manuscript);
  const url = URL.createObjectURL(
    new Blob([bytes as unknown as BlobPart], { type: "application/epub+zip" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  markSaved(`Saved`);
}

export const downloadEpub = download;

export async function saveToDisk(saveAs = false): Promise<void> {
  const filename = epubFilename(state.manuscript);

  if (state.isDesktop) {
    try {
      const response = await fetch("/api/editor/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manuscript: state.manuscript,
          filename,
          saveAs: saveAs || !state.desktopFileLoaded,
        }),
      });
      if (response.status === 204) return;
      if (!response.ok) throw new Error(`Disk save failed: ${response.status}`);
      const result = await response.json();
      editorStore.update((draft) => {
        draft.manuscript.filename = result.name;
        draft.desktopFileLoaded = true;
        draft.hasUnsavedChanges = false;
        draft.saveMessage = "";
      });
      return;
    } catch (error) {
      console.error("Desktop save failed:", error);
      editorStore.set({ saveMessage: "Save failed" });
      return;
    }
  }

  if (state.fileHandle && !saveAs) {
    try {
      const canWrite = await hasWritePermission(state.fileHandle, true);
      editorStore.set({ canWrite });
      if (canWrite) {
        await writeFile(state.fileHandle, state.manuscript);
        return;
      }
    } catch (error) {
      console.warn("The previous file handle is no longer writable.", error);
      editorStore.set({ fileHandle: null, canWrite: false });
      await storeHandle(null);
    }
  }

  if (!filePicker.showSaveFilePicker) {
    await download(state.manuscript);
    return;
  }

  try {
    const handle = await filePicker.showSaveFilePicker({
      suggestedName: filename,
      types: EPUB_TYPES,
    });
    editorStore.update((draft) => {
      draft.fileHandle = handle;
      draft.canWrite = true;
      draft.manuscript.filename = handle.name;
    });
    await storeHandle(handle);
    await writeFile(handle, state.manuscript);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    console.warn("Native save picker failed; using a download instead.", error);
    await download(state.manuscript);
  }
}

export async function saveEpubToDisk(): Promise<void> {
  await saveToDisk(true);
}

export async function openFile(
  fileInput: HTMLInputElement,
  onLoaded: (file: File, handle: WritableFileHandle | null, writable: boolean) => Promise<void>,
): Promise<void> {
  if (state.isDesktop) {
    try {
      const response = await fetch("/api/editor/open", { method: "POST" });
      if (response.status === 204) return;
      if (!response.ok) throw new Error(`File open failed: ${response.status}`);
      const result = await response.json();
      editorStore.set({ desktopFileLoaded: true });
      if (result.manuscript) {
        editorStore.set({
          manuscript: result.manuscript,
          activeChapter: 0,
          fileHandle: null,
          canWrite: false,
          hasUnsavedChanges: false,
          desktopFileLoaded: true,
          saveMessage: "",
        });
        await onLoaded(new File([], result.name), null, false);
        return;
      }
      return;
    } catch (error) {
      console.error("Desktop open failed:", error);
      alert("The manuscript could not be opened.");
      return;
    }
  }

  if (!filePicker.showOpenFilePicker) {
    fileInput.click();
    return;
  }

  try {
    const handles = await filePicker.showOpenFilePicker({
      types: EPUB_TYPES,
      multiple: false,
    });
    const handle = handles[0];
    if (handle) {
      const writable = await hasWritePermission(handle, true);
      await onLoaded(await handle.getFile(), handle, writable);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    console.warn("Native open picker failed; falling back to input.", error);
    fileInput.click();
  }
}

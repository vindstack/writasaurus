import type { WritableFileHandle } from "./types.ts";
import { chapter } from "./data.ts";
import { storeHandle } from "./storage.ts";
import { editorStore, state } from "./state.ts";
import { isEpubFilename, parseEpub } from "../../../../lib/epub.ts";

const CHAPTER_NUMBER_PATTERN = /\b(chapter\s+)\d+\b/i;

export async function loadFile(
  file: File,
  handle: WritableFileHandle | null = null,
  writable = false,
): Promise<void> {
  if (!isEpubFilename(file.name)) {
    throw new Error("Only EPUB manuscripts can be opened.");
  }
  const manuscript = await parseEpub(new Uint8Array(await file.arrayBuffer()), file.name);

  editorStore.set({
    manuscript,
    activeChapter: 0,
    fileHandle: handle,
    canWrite: writable,
    hasUnsavedChanges: false,
    saveMessage: "",
  });
  await storeHandle(handle);
}

export function addChapter(): void {
  editorStore.update((draft) => {
    draft.manuscript.chapters.push(
      chapter(`Chapter ${draft.manuscript.chapters.length + 1}: Untitled`, "<p></p>"),
    );
    draft.activeChapter = draft.manuscript.chapters.length - 1;
    draft.hasUnsavedChanges = true;
  });
}

export function deleteChapter(index: number): void {
  if (state.manuscript.chapters.length === 1) {
    alert("A manuscript needs one chapter.");
    return;
  }
  if (!confirm(`Delete "${state.manuscript.chapters[index]?.title}"?`)) return;
  editorStore.update((draft) => {
    draft.manuscript.chapters.splice(index, 1);
    if (index < draft.activeChapter) {
      draft.activeChapter--;
    } else if (index === draft.activeChapter) {
      draft.activeChapter = Math.min(draft.activeChapter, draft.manuscript.chapters.length - 1);
    }
    draft.hasUnsavedChanges = true;
  });
}

export function selectChapter(index: number): void {
  if (index === state.activeChapter) return;
  editorStore.set({ activeChapter: index });
}

export function reorderChapter(fromIndex: number, toIndex: number): void {
  editorStore.update((draft) => {
    const chapters = draft.manuscript.chapters;
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= chapters.length) return;
    if (toIndex < 0 || toIndex >= chapters.length) return;

    const [chapter] = chapters.splice(fromIndex, 1);
    chapters.splice(toIndex, 0, chapter);

    for (const [index, item] of chapters.entries()) {
      item.title = item.title.replace(CHAPTER_NUMBER_PATTERN, `$1${index + 1}`);
    }

    // Adjust active chapter index if it was moved
    if (draft.activeChapter === fromIndex) {
      draft.activeChapter = toIndex;
    } else if (fromIndex < draft.activeChapter && toIndex >= draft.activeChapter) {
      draft.activeChapter--;
    } else if (fromIndex > draft.activeChapter && toIndex <= draft.activeChapter) {
      draft.activeChapter++;
    }

    draft.hasUnsavedChanges = true;
  });
}

export function renameChapter(title: string): void {
  editorStore.update((draft) => {
    const chapter = draft.manuscript.chapters[draft.activeChapter];
    if (!chapter) return;
    chapter.title = title.trim() || `Chapter ${draft.activeChapter + 1}`;
    draft.hasUnsavedChanges = true;
    draft.saveMessage = "";
  });
}

/**
 * Applies the title as typed, without forcing a fallback. Forcing "Untitled
 * Manuscript" here would fire on every keystroke, so clearing the field to
 * type a new title would immediately snap back to the fallback before the
 * user could type anything else. The fallback is only applied on blur, via
 * {@linkcode commitManuscriptTitle}.
 */
export function renameManuscript(title: string): void {
  editorStore.update((draft) => {
    draft.manuscript.frontmatter.title = title;
    draft.hasUnsavedChanges = true;
    draft.saveMessage = "";
  });
}

/** Falls back to a default title once the manuscript title field is no longer being edited. */
export function commitManuscriptTitle(): void {
  editorStore.update((draft) => {
    draft.manuscript.frontmatter.title = String(draft.manuscript.frontmatter.title ?? "").trim() ||
      "Untitled Manuscript";
  });
}

import { batch, computed, signal } from "@preact/signals";
import type { Chapter, Manuscript, WritableFileHandle } from "./types.ts";
import { blankManuscript, chapter as createChapter, count } from "./data.ts";

/**
 * Single source of truth for the editor. Components read these signals directly, so only the
 * parts of the UI that depend on a value re-render when it changes.
 */
export const manuscript = signal<Manuscript>(blankManuscript());
export const activeChapterIndex = signal(0);
export const fileHandle = signal<WritableFileHandle | null>(null);
export const canWrite = signal(false);
export const isDesktop = signal(false);
export const desktopFileLoaded = signal(false);
export const hasUnsavedChanges = signal(false);
/** Overrides the derived save message; used to surface save failures. */
export const saveMessage = signal("");

export const sidebarOpen = signal(false);
export const menuOpen = signal(false);
export const statsIndex = signal(0);
/** Incremented to ask the writing area to select the chapter title field. */
export const titleFocusRequest = signal(0);

export const activeChapter = computed<Chapter | undefined>(() =>
  manuscript.value.chapters[activeChapterIndex.value]
);

export const totalWords = computed(() =>
  manuscript.value.chapters.reduce((total, item) => total + item.wordCount, 0)
);

const CHAPTER_NUMBER_PATTERN = /\b(chapter\s+)\d+\b/i;

/** Replaces the whole document, e.g. after opening or starting a manuscript. */
export function replaceManuscript(
  next: Manuscript,
  options: Partial<{
    activeChapter: number;
    fileHandle: WritableFileHandle | null;
    canWrite: boolean;
    desktopFileLoaded: boolean;
    hasUnsavedChanges: boolean;
    saveMessage: string;
  }> = {},
): void {
  batch(() => {
    manuscript.value = next;
    activeChapterIndex.value = options.activeChapter ?? 0;
    fileHandle.value = options.fileHandle ?? null;
    canWrite.value = options.canWrite ?? false;
    if (options.desktopFileLoaded !== undefined) {
      desktopFileLoaded.value = options.desktopFileLoaded;
    }
    hasUnsavedChanges.value = options.hasUnsavedChanges ?? false;
    saveMessage.value = options.saveMessage ?? "";
  });
}

function updateChapter(index: number, change: (chapter: Chapter) => Chapter): void {
  const current = manuscript.peek();
  if (!current.chapters[index]) return;
  manuscript.value = {
    ...current,
    chapters: current.chapters.map((item, position) => position === index ? change(item) : item),
  };
}

/** Copies the live editor DOM into the active chapter. */
export function syncChapter(editor: HTMLElement): void {
  const stats = count(editor.innerText);
  updateChapter(activeChapterIndex.peek(), (item) => ({
    ...item,
    content: editor.innerHTML,
    wordCount: stats.words,
    charCount: stats.chars,
  }));
}

/** Syncs the editor DOM (when provided) and flags the manuscript as unsaved. */
export function markChanged(editor?: HTMLElement | null): void {
  batch(() => {
    if (editor) syncChapter(editor);
    hasUnsavedChanges.value = true;
    saveMessage.value = "";
  });
}

export function markSaved(message = ""): void {
  batch(() => {
    hasUnsavedChanges.value = false;
    saveMessage.value = message;
  });
}

export function addChapter(): void {
  const current = manuscript.peek();
  batch(() => {
    manuscript.value = {
      ...current,
      chapters: [
        ...current.chapters,
        createChapter(`Chapter ${current.chapters.length + 1}: Untitled`, "<p></p>"),
      ],
    };
    activeChapterIndex.value = current.chapters.length;
    hasUnsavedChanges.value = true;
  });
}

export function deleteChapter(index: number): void {
  const current = manuscript.peek();
  if (current.chapters.length === 1) {
    alert("A manuscript needs one chapter.");
    return;
  }
  if (!confirm(`Delete "${current.chapters[index]?.title}"?`)) return;
  const chapters = current.chapters.filter((_, position) => position !== index);
  let active = activeChapterIndex.peek();
  if (index < active) active--;
  else if (index === active) active = Math.min(active, chapters.length - 1);
  batch(() => {
    manuscript.value = { ...current, chapters };
    activeChapterIndex.value = active;
    hasUnsavedChanges.value = true;
  });
}

export function selectChapter(index: number): void {
  if (index !== activeChapterIndex.peek()) activeChapterIndex.value = index;
}

export function reorderChapter(fromIndex: number, toIndex: number): void {
  const current = manuscript.peek();
  const size = current.chapters.length;
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= size) return;
  if (toIndex < 0 || toIndex >= size) return;

  const chapters = [...current.chapters];
  const [moved] = chapters.splice(fromIndex, 1);
  chapters.splice(toIndex, 0, moved);
  const renumbered = chapters.map((item, index) => ({
    ...item,
    title: item.title.replace(CHAPTER_NUMBER_PATTERN, `$1${index + 1}`),
  }));

  let active = activeChapterIndex.peek();
  if (active === fromIndex) active = toIndex;
  else if (fromIndex < active && toIndex >= active) active--;
  else if (fromIndex > active && toIndex <= active) active++;

  batch(() => {
    manuscript.value = { ...current, chapters: renumbered };
    activeChapterIndex.value = active;
    hasUnsavedChanges.value = true;
  });
}

export function renameChapter(title: string): void {
  const index = activeChapterIndex.peek();
  updateChapter(index, (item) => ({ ...item, title: title.trim() || `Chapter ${index + 1}` }));
  batch(() => {
    hasUnsavedChanges.value = true;
    saveMessage.value = "";
  });
}

/**
 * Applies the title as typed, without forcing a fallback. Forcing "Untitled Manuscript" on every
 * keystroke would snap the field back while the user clears it to type a new title. The fallback
 * is only applied on blur, via {@linkcode commitManuscriptTitle}.
 */
export function renameManuscript(title: string): void {
  const current = manuscript.peek();
  batch(() => {
    manuscript.value = { ...current, frontmatter: { ...current.frontmatter, title } };
    hasUnsavedChanges.value = true;
    saveMessage.value = "";
  });
}

/** Falls back to a default title once the manuscript title field is no longer being edited. */
export function commitManuscriptTitle(): void {
  const current = manuscript.peek();
  manuscript.value = {
    ...current,
    frontmatter: {
      ...current.frontmatter,
      title: String(current.frontmatter.title ?? "").trim() || "Untitled Manuscript",
    },
  };
}

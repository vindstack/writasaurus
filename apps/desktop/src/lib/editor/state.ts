import { batch, computed, signal } from "@preact/signals";
import type { Chapter, Manuscript, SectionType } from "./types.ts";
import { blankManuscript, chapter as createChapter, count, defaultSectionTitle } from "./data.ts";
import { htmlToMarkdown } from "../utilties/markdown-utilities.ts";

/**
 * Single source of truth for the editor. Components read these signals directly, so only the
 * parts of the UI that depend on a value re-render when it changes.
 */
export const manuscript = signal<Manuscript>(blankManuscript());
export const activeChapterIndex = signal(0);
export const desktopFileLoaded = signal(false);
export const hasUnsavedChanges = signal(false);
/** Overrides the derived save message; used to surface save failures. */
export const saveMessage = signal("");
export const editorMode = signal<"manuscript" | "outline">("manuscript");
export const outlineContent = signal("");
export const outlineHasUnsavedChanges = signal(false);
export const outlineSaveMessage = signal("");

export const sidebarOpen = signal(false);
export const menuOpen = signal(false);
/** Incremented to ask the writing area to select the chapter title field. */
export const titleFocusRequest = signal(0);

export const activeChapter = computed<Chapter | undefined>(() =>
  manuscript.value.chapters[activeChapterIndex.value]
);

export const totalWords = computed(() =>
  manuscript.value.chapters.reduce((total, item) => total + item.wordCount, 0)
);

const NUMBERED_SECTION_TYPES = new Set<SectionType>(["chapter", "part", "appendix"]);
const FRONT_MATTER_TYPES = new Set<SectionType>([
  "copyright-page",
  "dedication",
  "epigraph",
  "foreword",
  "preface",
  "introduction",
  "prologue",
]);
const BACK_MATTER_TYPES = new Set<SectionType>([
  "epilogue",
  "afterword",
  "appendix",
  "glossary",
  "bibliography",
  "index",
  "acknowledgments",
  "colophon",
]);

function placement(type: SectionType): number {
  if (FRONT_MATTER_TYPES.has(type)) return 0;
  if (type === "part") return 1;
  return BACK_MATTER_TYPES.has(type) ? 3 : 2;
}

/** Replaces the whole document, e.g. after opening or starting a manuscript. */
export function replaceManuscript(
  next: Manuscript,
  options: Partial<{
    activeChapter: number;
    desktopFileLoaded: boolean;
    hasUnsavedChanges: boolean;
    saveMessage: string;
  }> = {},
): void {
  batch(() => {
    manuscript.value = next;
    activeChapterIndex.value = options.activeChapter ?? 0;
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
  if (editorMode.peek() === "outline") {
    markOutlineChanged(editor);
    return;
  }
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

export function replaceOutline(content: string, hasUnsavedChanges = false): void {
  batch(() => {
    outlineContent.value = content;
    outlineHasUnsavedChanges.value = hasUnsavedChanges;
    outlineSaveMessage.value = "";
  });
}

export function markOutlineChanged(editor?: HTMLElement | null): void {
  batch(() => {
    if (editor) outlineContent.value = htmlToMarkdown(editor.innerHTML);
    outlineHasUnsavedChanges.value = true;
    outlineSaveMessage.value = "";
  });
}

export function addChapter(type: SectionType = "chapter"): void {
  const current = manuscript.peek();
  const sectionNumber =
    current.chapters.filter((item) => (item.type ?? "chapter") === type).length + 1;
  const newChapter = createChapter(defaultSectionTitle(type, sectionNumber), "<p></p>", type);
  const targetPlacement = placement(type);
  const firstLaterSection = current.chapters.findIndex((item) =>
    placement(item.type ?? "chapter") > targetPlacement
  );
  const lastSamePlacement = current.chapters.reduce(
    (last, item, index) => placement(item.type ?? "chapter") === targetPlacement ? index : last,
    -1,
  );
  const insertionIndex = firstLaterSection >= 0
    ? firstLaterSection
    : Math.max(lastSamePlacement + 1, current.chapters.length);
  const chapters = [...current.chapters];
  chapters.splice(insertionIndex, 0, newChapter);
  batch(() => {
    manuscript.value = {
      ...current,
      chapters,
    };
    activeChapterIndex.value = insertionIndex;
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
  const sectionNumbers = new Map<SectionType, number>();
  const renumbered = chapters.map((item) => {
    const type = item.type ?? "chapter";
    if (!NUMBERED_SECTION_TYPES.has(type)) return item;
    const number = (sectionNumbers.get(type) ?? 0) + 1;
    sectionNumbers.set(type, number);
    const label = type === "appendix" ? "appendix" : type;
    return {
      ...item,
      title: item.title.replace(
        new RegExp(`\\b(${label}\\s+)\\d+\\b`, "i"),
        (_match, prefix: string) => `${prefix}${number}`,
      ),
    };
  });

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
  const current = manuscript.peek();
  const item = current.chapters[index];
  const type = item?.type ?? "chapter";
  const sectionNumber =
    current.chapters.slice(0, index + 1).filter((chapter) => (chapter.type ?? "chapter") === type)
      .length;
  updateChapter(index, (chapter) => ({
    ...chapter,
    title: title.trim() || defaultSectionTitle(type, sectionNumber),
  }));
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

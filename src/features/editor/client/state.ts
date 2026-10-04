import { createStore } from "../../../framework/web-components/index.ts";
import type { Chapter, Manuscript, WritableFileHandle } from "../../../../lib/editor/types.ts";
import { blankManuscript, count } from "../../../../lib/editor/data.ts";

export interface EditorState {
  manuscript: Manuscript;
  activeChapter: number;
  fileHandle: WritableFileHandle | null;
  canWrite: boolean;
  isDesktop: boolean;
  desktopFileLoaded: boolean;
  hasUnsavedChanges: boolean;
  /** Overrides the derived save message; used to surface save failures. */
  saveMessage: string;
}

/**
 * Single source of truth for the editor. Components subscribe to it with
 * `webComponent(...).subscribe(editorStore)` and render straight from
 * {@linkcode state}, so no parent has to push updates into its children.
 */
export const editorStore = createStore<EditorState>({
  manuscript: blankManuscript(),
  activeChapter: 0,
  fileHandle: null,
  canWrite: false,
  isDesktop: false,
  desktopFileLoaded: false,
  hasUnsavedChanges: false,
  saveMessage: "",
});

export const state: EditorState = editorStore.state;

export function activeChapter(): Chapter | undefined {
  return state.manuscript.chapters[state.activeChapter];
}

export function totalWords(): number {
  return state.manuscript.chapters.reduce((total, item) => total + item.wordCount, 0);
}

/** Copies the live editor DOM into the active chapter. */
export function syncChapter(editor: HTMLElement): void {
  editorStore.update(() => writeChapter(editor));
}

/** Syncs the editor DOM (when provided) and flags the manuscript as unsaved. */
export function markChanged(editor?: HTMLElement | null): void {
  editorStore.update((draft) => {
    if (editor) writeChapter(editor);
    draft.hasUnsavedChanges = true;
    draft.saveMessage = "";
  });
}

export function markSaved(message = ""): void {
  editorStore.set({ hasUnsavedChanges: false, saveMessage: message });
}

function writeChapter(editor: HTMLElement): void {
  const chapter = activeChapter();
  if (!chapter) return;
  const stats = count(editor.innerText);
  chapter.content = editor.innerHTML;
  chapter.wordCount = stats.words;
  chapter.charCount = stats.chars;
}

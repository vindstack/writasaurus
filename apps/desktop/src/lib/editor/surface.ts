import { markChanged, renameChapter } from "./state.ts";
import { editorHistory } from "./history.ts";
import { normalizeEditorBlocks } from "./normalize.ts";

/**
 * Bridge to the uncontrolled contenteditable surface. Vue never renders the editor's
 * children, so re-renders can't move the caret; this module is the only place that writes the
 * editor DOM besides the user's own typing.
 */
interface Surface {
  editor: HTMLElement;
  title: HTMLInputElement;
}

const HISTORY_DEBOUNCE_MS = 300;

let surface: Surface | null = null;
let historyTimer: ReturnType<typeof setTimeout> | undefined;

export function registerSurface(next: Surface | null): void {
  surface = next;
  if (!next) cancelHistoryCapture();
}

export function getEditor(): HTMLElement | null {
  return surface?.editor ?? null;
}

export function focusEditor(): void {
  surface?.editor.focus();
}

export function selectTitle(): void {
  surface?.title.select();
}

/** Loads chapter content into the editor without going through the framework. */
export function mountContent(content: string): void {
  if (!surface) return;
  surface.editor.innerHTML = content || "<p></p>";
  normalizeEditorBlocks(surface.editor);
}

interface LegacyEditorDocument {
  execCommand(commandId: string, showUI?: boolean, value?: string): boolean;
}

/**
 * Compatibility boundary for contenteditable commands. There is no equivalent
 * interoperable replacement for selection-aware formatting commands yet.
 */
export function executeEditorCommand(command: string, value?: string): boolean {
  return (document as unknown as LegacyEditorDocument).execCommand(command, false, value);
}

/** Runs a formatting command against the editor and records the change. */
export function runCommand(command: string, value?: string): void {
  if (!surface) return;
  executeEditorCommand(command, value);
  surface.editor.focus();
  markChanged(surface.editor);
}

function cancelHistoryCapture(): void {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = undefined;
}

/**
 * Debounced history capture: records state after the writer pauses, grouping consecutive edits
 * (typing a word, adding spaces) into a single undo step.
 */
export function scheduleHistoryCapture(): void {
  if (!surface) return;
  cancelHistoryCapture();
  historyTimer = setTimeout(() => {
    historyTimer = undefined;
    if (surface) editorHistory.push(surface.editor.innerHTML, surface.title.value);
  }, HISTORY_DEBOUNCE_MS);
}

function applyHistoryEntry(entry: { content: string; title: string }): void {
  if (!surface) return;
  surface.editor.innerHTML = entry.content;
  normalizeEditorBlocks(surface.editor);
  surface.title.value = entry.title;
  renameChapter(entry.title);
  markChanged(surface.editor);
}

export function undo(): void {
  cancelHistoryCapture();
  const entry = editorHistory.undo();
  if (entry) applyHistoryEntry(entry);
}

export function redo(): void {
  cancelHistoryCapture();
  const entry = editorHistory.redo();
  if (entry) applyHistoryEntry(entry);
}

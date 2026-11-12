<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import Dialog from "../../../../../packages/shared/ui/components/Dialog.vue";
import { lookupSynonymGroups, type SynonymGroup } from "../../lib/editor/thesaurus.ts";
import { getEditor, replaceRangeInEditor } from "../../lib/editor/surface.ts";

interface CaretPoint {
  offsetNode: Node;
  offset: number;
}

interface PointDocument extends Document {
  caretPositionFromPoint?: (x: number, y: number) => CaretPoint | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

interface SuggestionGroup {
  id: number;
  definition: string;
  suggestions: string[];
}

interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

const contextMenu = ref<HTMLDivElement | null>(null);
const contextMenuOpen = ref(false);
const selectedText = ref("");
const clickedWord = ref("");
const clipboardError = ref("");
const thesaurusOpen = ref(false);
const thesaurusWord = ref("");
const thesaurusLoading = ref(false);
const thesaurusError = ref("");
const synonymGroups = ref<SynonymGroup[]>([]);
const groupsWithSuggestions = computed<SuggestionGroup[]>(() =>
  synonymGroups.value
    .map((group, id) => ({
      id,
      definition: group.definition,
      suggestions: group.words
        .map((word) => word.replaceAll("_", " "))
        .filter((word) => normalizeWord(word) !== normalizeWord(thesaurusWord.value)),
    }))
    .filter((group) => group.suggestions.length > 0),
);
const canCopy = computed(() => Boolean(selectedText.value || clickedWord.value));

let caretRange: Range | null = null;
let selectedRange: Range | null = null;
let clickedWordRange: Range | null = null;
let thesaurusRange: Range | null = null;
let lookupGeneration = 0;

function normalizeWord(word: string): string {
  return word.replaceAll("_", " ").trim().toLocaleLowerCase("en-US");
}

function isWordCharacter(character: string): boolean {
  return /[\p{L}\p{M}\p{N}_]/u.test(character);
}

function isWordConnector(text: string, index: number): boolean {
  return (
    ["'", "’", "-"].includes(text[index]) &&
    index > 0 &&
    index + 1 < text.length &&
    isWordCharacter(text[index - 1]) &&
    isWordCharacter(text[index + 1])
  );
}

function wordRangeAtCaret(editor: HTMLElement, caret: Range): Range | null {
  if (caret.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const caretNode = caret.startContainer as Text;
  const block =
    caretNode.parentElement?.closest<HTMLElement>(
      "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div",
    ) ?? editor;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const segments: TextSegment[] = [];
  const characters: string[] = [];
  let textLength = 0;
  let caretOffset = -1;
  let next = walker.nextNode();
  while (next) {
    if (next.nodeType === Node.TEXT_NODE) {
      const node = next as Text;
      const start = textLength;
      if (node === caretNode) caretOffset = start + caret.startOffset;
      characters.push(node.data);
      textLength += node.data.length;
      segments.push({ node, start, end: textLength });
    } else if ((next as Element).tagName === "BR") {
      characters.push("\n");
      textLength++;
    }
    next = walker.nextNode();
  }
  const text = characters.join("");
  if (caretOffset < 0) return null;
  if (!text.length) return null;

  let offset = Math.min(caretOffset, text.length - 1);
  if (!isWordCharacter(text[offset]) && offset > 0 && isWordCharacter(text[offset - 1])) {
    offset--;
  }
  if (!isWordCharacter(text[offset])) return null;

  let start = offset;
  let end = offset + 1;
  while (start > 0 && (isWordCharacter(text[start - 1]) || isWordConnector(text, start - 1)))
    start--;
  while (end < text.length && (isWordCharacter(text[end]) || isWordConnector(text, end))) end++;

  const startSegment = segments.find((segment) => start >= segment.start && start < segment.end);
  const endSegment = segments.find((segment) => end > segment.start && end <= segment.end);
  if (!startSegment || !endSegment || !editor.contains(startSegment.node)) return null;
  const range = document.createRange();
  range.setStart(startSegment.node, start - startSegment.start);
  range.setEnd(endSegment.node, end - endSegment.start);
  return range;
}

function caretRangeAtPoint(x: number, y: number): Range | null {
  const pointDocument = document as PointDocument;
  const position = pointDocument.caretPositionFromPoint?.(x, y);
  if (position) {
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return pointDocument.caretRangeFromPoint?.(x, y)?.cloneRange() ?? null;
}

function rangeIsInEditor(range: Range, editor = getEditor()): boolean {
  return !!editor && editor.contains(range.startContainer) && editor.contains(range.endContainer);
}

async function showContextMenu(x: number, y: number): Promise<void> {
  clipboardError.value = "";
  contextMenuOpen.value = true;
  await nextTick();

  const menu = contextMenu.value;
  if (!menu) return;
  const bounds = menu.getBoundingClientRect();
  const margin = 8;
  menu.style.left = `${Math.max(margin, Math.min(x, innerWidth - bounds.width - margin))}px`;
  menu.style.top = `${Math.max(margin, Math.min(y, innerHeight - bounds.height - margin))}px`;
  menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
}

function onContextMenu(event: MouseEvent): void {
  const editor = getEditor();
  if (!editor || !(event.target instanceof Node) || !editor.contains(event.target)) return;
  event.preventDefault();

  caretRange = caretRangeAtPoint(event.clientX, event.clientY);
  const selection = document.getSelection();
  const currentSelection =
    selection && !selection.isCollapsed && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : null;
  selectedRange =
    currentSelection && rangeIsInEditor(currentSelection, editor)
      ? currentSelection.cloneRange()
      : null;
  selectedText.value = selectedRange?.toString() ?? "";
  clickedWordRange = caretRange ? wordRangeAtCaret(editor, caretRange) : null;
  clickedWord.value = clickedWordRange?.toString() ?? "";
  void showContextMenu(event.clientX, event.clientY);
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!contextMenuOpen.value) return;
  if (contextMenu.value?.contains(event.target as Node)) return;
  contextMenuOpen.value = false;
  clipboardError.value = "";
}

function closeContextMenu(returnFocus = false): void {
  contextMenuOpen.value = false;
  clipboardError.value = "";
  if (returnFocus) getEditor()?.focus();
}

function editingRange(): Range | null {
  if (selectedRange && selectedText.value) return selectedRange.cloneRange();
  return clickedWordRange?.cloneRange() ?? null;
}

function pasteRange(): Range | null {
  if (selectedRange && selectedText.value) return selectedRange.cloneRange();
  return caretRange?.cloneRange() ?? null;
}

function showClipboardError(action: string, error: unknown): void {
  console.error(`Could not ${action} editor text.`, error);
  clipboardError.value =
    error instanceof Error
      ? `Could not ${action}: ${error.message}`
      : `Could not ${action}. Clipboard access is unavailable.`;
}

async function copyOrCut(cut: boolean): Promise<void> {
  const range = editingRange();
  const text = range?.toString() ?? "";
  if (!range || !text) return;

  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      throw new Error("Clipboard access is unavailable.");
    }
    await navigator.clipboard.writeText(text);
    if (cut) {
      if (!rangeIsInEditor(range) || range.toString() !== text) {
        throw new Error("The selected text changed before it could be cut. Try again.");
      }
      if (!replaceRangeInEditor(range, "")) {
        throw new Error("The selected text could not be removed. Try again.");
      }
    }
    closeContextMenu(true);
  } catch (error) {
    showClipboardError(cut ? "cut" : "copy", error);
  }
}

async function paste(): Promise<void> {
  const range = pasteRange();
  const previousText = range?.toString() ?? "";
  if (!range || !rangeIsInEditor(range)) {
    clipboardError.value = "Choose a place in the editor before pasting.";
    return;
  }

  try {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
      throw new Error("Clipboard access is unavailable.");
    }
    const text = await navigator.clipboard.readText();
    if (!rangeIsInEditor(range) || range.toString() !== previousText) {
      throw new Error("The editor selection changed before it could be pasted. Try again.");
    }
    if (text && !replaceRangeInEditor(range, text)) {
      throw new Error("The clipboard text could not be inserted. Try again.");
    }
    closeContextMenu(true);
  } catch (error) {
    showClipboardError("paste", error);
  }
}

function selectAll(): void {
  const editor = getEditor();
  if (!editor) return;
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  closeContextMenu();
}

async function openThesaurus(): Promise<void> {
  if (!clickedWord.value || !clickedWordRange) return;
  thesaurusWord.value = clickedWord.value;
  thesaurusRange = clickedWordRange.cloneRange();
  synonymGroups.value = [];
  thesaurusError.value = "";
  thesaurusLoading.value = true;
  thesaurusOpen.value = true;
  closeContextMenu();

  const generation = ++lookupGeneration;
  try {
    const results = await lookupSynonymGroups(thesaurusWord.value);
    if (generation === lookupGeneration) synonymGroups.value = results;
  } catch (error) {
    console.error("The offline thesaurus lookup failed.", error);
    if (generation === lookupGeneration) {
      thesaurusError.value = "The offline thesaurus could not be loaded. Please try again.";
    }
  } finally {
    if (generation === lookupGeneration) thesaurusLoading.value = false;
  }
}

function closeThesaurus(): void {
  lookupGeneration++;
  thesaurusOpen.value = false;
  thesaurusLoading.value = false;
  thesaurusRange = null;
  thesaurusWord.value = "";
  thesaurusError.value = "";
  synonymGroups.value = [];
  getEditor()?.focus();
}

function matchWordCase(original: string, suggestion: string): string {
  const letters = original.replace(/[^\p{L}]/gu, "");
  if (letters && letters === letters.toLocaleUpperCase("en-US")) {
    return suggestion.toLocaleUpperCase("en-US");
  }
  if (
    original[0] === original[0]?.toLocaleUpperCase("en-US") &&
    original.slice(1) === original.slice(1).toLocaleLowerCase("en-US")
  ) {
    return suggestion[0]?.toLocaleUpperCase("en-US") + suggestion.slice(1);
  }
  return suggestion;
}

function applySuggestion(suggestion: string): void {
  const editor = getEditor();
  const range = thesaurusRange;
  if (
    !range ||
    !editor ||
    !rangeIsInEditor(range, editor) ||
    range.toString() !== thesaurusWord.value
  ) {
    thesaurusError.value =
      "The original word is no longer available. Close the dialog and try again.";
    return;
  }
  if (!replaceRangeInEditor(range, matchWordCase(thesaurusWord.value, suggestion))) {
    thesaurusError.value = "The word could not be replaced. Close the dialog and try again.";
    return;
  }
  closeThesaurus();
}

function onMenuKeyDown(event: KeyboardEvent): void {
  const items = Array.from(
    contextMenu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
      [],
  );
  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
  let nextIndex: number | undefined;
  if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
  else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = items.length - 1;
  else if (event.key === "Escape") {
    event.preventDefault();
    closeContextMenu(true);
  }
  if (nextIndex === undefined || !items.length) return;
  event.preventDefault();
  items[nextIndex]?.focus();
}

onMounted(() => {
  document.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("pointerdown", onDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener("contextmenu", onContextMenu);
  document.removeEventListener("pointerdown", onDocumentPointerDown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="contextMenuOpen"
      ref="contextMenu"
      class="contextMenu"
      role="menu"
      aria-label="Editor text actions"
      data-editor-context-menu
      @keydown="onMenuKeyDown"
    >
      <button type="button" role="menuitem" :disabled="!canCopy" @click="copyOrCut(true)">
        Cut
      </button>
      <button type="button" role="menuitem" :disabled="!canCopy" @click="copyOrCut(false)">
        Copy
      </button>
      <button type="button" role="menuitem" @click="paste">Paste</button>
      <button type="button" role="menuitem" @click="selectAll">Select all</button>
      <div class="menuSeparator" role="separator"></div>
      <button
        type="button"
        role="menuitem"
        :disabled="!clickedWord"
        data-open-thesaurus
        @click="openThesaurus"
      >
        Thesaurus
      </button>
      <p v-if="clipboardError" class="menuError" role="alert">{{ clipboardError }}</p>
    </div>
    <Dialog
      id="editor-thesaurus-dialog"
      :title="`Synonyms for ${thesaurusWord}`"
      :open="thesaurusOpen"
      @close="closeThesaurus"
    >
      <p v-if="thesaurusLoading" role="status">Looking up offline suggestions…</p>
      <p v-else-if="thesaurusError" class="lookupError" role="alert">
        {{ thesaurusError }}
      </p>
      <p v-else-if="groupsWithSuggestions.length === 0" role="status">
        No alternatives were found for “{{ thesaurusWord }}”.
      </p>
      <div v-else class="suggestionList" data-thesaurus-suggestions>
        <section v-for="group in groupsWithSuggestions" :key="group.id" class="synonymGroup">
          <p class="senseDefinition">{{ group.definition }}</p>
          <div class="suggestionActions">
            <Button
              v-for="suggestion in group.suggestions"
              :key="suggestion"
              variant="quiet-outline"
              size="small"
              :data-synonym="suggestion"
              @click="applySuggestion(suggestion)"
            >
              {{ suggestion }}
            </Button>
          </div>
        </section>
      </div>
      <small class="attribution">
        Synonyms from
        <a
          href="https://github.com/globalwordnet/english-wordnet/releases/tag/2025-edition"
          target="_blank"
          rel="noreferrer"
          >Open English WordNet 2025</a
        >
        and Princeton WordNet, under
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0 </a
        >.
      </small>
      <template #footer>
        <Button variant="quiet" size="small" @click="closeThesaurus">Cancel</Button>
      </template>
    </Dialog>
  </Teleport>
</template>

<style scoped>
.contextMenu {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: 0 8px 24px rgb(0 0 0 / 20%);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 11rem;
  padding: 0.3rem;
  position: fixed;
  z-index: 1100;
}

.contextMenu button {
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  padding: 0.4rem 0.65rem;
  text-align: start;
}

.contextMenu button:hover:not(:disabled),
.contextMenu button:focus-visible {
  background: var(--surface-sunken);
}

.contextMenu button:disabled {
  color: var(--muted);
  cursor: not-allowed;
  opacity: 0.6;
}

.menuSeparator {
  border-block-start: 1px solid var(--border);
  margin-block: 0.2rem;
}

.menuError,
.lookupError {
  color: var(--danger);
  font-size: 0.85rem;
  margin: 0;
  padding: 0.4rem 0.65rem;
}

.suggestionList {
  max-height: min(55vh, 30rem);
  overflow-y: auto;
}

.synonymGroup {
  border-block-end: 1px solid var(--border);
  padding-block: var(--space-2);
}

.synonymGroup:first-child {
  padding-block-start: 0;
}

.synonymGroup:last-child {
  border-block-end: 0;
}

.senseDefinition {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0 0 var(--space-2);
}

.suggestionActions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.attribution {
  display: block;
  font-size: 0.72rem;
  line-height: 1.4;
}
</style>

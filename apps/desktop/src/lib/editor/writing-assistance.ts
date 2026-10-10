import { batch } from "@preact/signals";
import { LocalLinter } from "harper.js";
import { slimBinaryInlined } from "harper.js/slimBinaryInlined";
import {
  getWritingAssistanceIgnores,
  getWritingAssistanceWords,
  saveWritingAssistanceIgnores,
  saveWritingAssistanceWords,
} from "../../../../../packages/shared/settings.ts";
import { normalizeEditorBlocks } from "./normalize.ts";
import { getEditor } from "./surface.ts";
import {
  assistanceActiveIndex,
  assistanceFocusRequest,
  assistanceOpen,
  assistanceStatus,
  assistanceWarnings,
  warningCategory,
  type WritingWarning,
} from "./assistance-state.ts";

interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

const HIGHLIGHT_NAMES = {
  spelling: "writing-assistance-spelling",
  grammar: "writing-assistance-grammar",
  active: "writing-assistance-active",
} as const;

const ANALYSIS_DEBOUNCE_MS = 400;

type HighlightRegistry = {
  delete(name: string): boolean;
  set(name: string, highlight: unknown): void;
};

type HighlightConstructor = new (...ranges: Range[]) => { priority?: number };

let linter: LocalLinter | null = null;
let initialization: Promise<boolean> | null = null;
let segments: TextSegment[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let observedEditor: HTMLElement | null = null;
let observer: MutationObserver | null = null;

function warningKey(warning: WritingWarning): string {
  return `${warning.kind}:${warning.problem.toLocaleLowerCase()}`;
}

function highlightRegistry(): HighlightRegistry | undefined {
  return (globalThis.CSS as unknown as { highlights?: HighlightRegistry }).highlights;
}

function collectText(editor: HTMLElement): { source: string; segments: TextSegment[] } {
  const collected: TextSegment[] = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const values: string[] = [];
  let offset = 0;
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    if (text) {
      collected.push({ node: node as Text, start: offset, end: offset + text.length });
      values.push(text);
      offset += text.length + 1;
    }
    node = walker.nextNode();
  }
  return { source: values.join("\n"), segments: collected };
}

function sourceRange(warning: WritingWarning): Range | null {
  const segment = segments.find((candidate) =>
    warning.start >= candidate.start && warning.end <= candidate.end
  );
  if (!segment) return null;
  const range = document.createRange();
  range.setStart(segment.node, warning.start - segment.start);
  range.setEnd(segment.node, warning.end - segment.start);
  return range;
}

function clearHighlights(): void {
  const registry = highlightRegistry();
  registry?.delete(HIGHLIGHT_NAMES.spelling);
  registry?.delete(HIGHLIGHT_NAMES.grammar);
  registry?.delete(HIGHLIGHT_NAMES.active);
}

function setHighlights(warnings: readonly WritingWarning[], active: WritingWarning | null): void {
  const registry = highlightRegistry();
  const Highlight = (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight;
  if (!registry || !Highlight) return;

  clearHighlights();
  const spellingRanges: Range[] = [];
  const grammarRanges: Range[] = [];
  for (const warning of warnings) {
    const range = sourceRange(warning);
    if (!range) continue;
    if (warningCategory(warning) === "spelling") spellingRanges.push(range);
    else grammarRanges.push(range);
  }
  if (spellingRanges.length) {
    registry.set(HIGHLIGHT_NAMES.spelling, new Highlight(...spellingRanges));
  }
  if (grammarRanges.length) registry.set(HIGHLIGHT_NAMES.grammar, new Highlight(...grammarRanges));

  const activeRange = active ? sourceRange(active) : null;
  if (!activeRange) return;
  const activeHighlight = new Highlight(activeRange);
  // Outranks the per-category highlights so the selected issue stays distinct.
  activeHighlight.priority = 1;
  registry.set(HIGHLIGHT_NAMES.active, activeHighlight);
}

/** Brings a warning's range into view without disturbing the editor selection. */
function scrollRangeIntoView(editor: HTMLElement, range: Range): void {
  const viewport = editor.closest<HTMLElement>("[data-editor-viewport]");
  if (!viewport) return;
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const bounds = viewport.getBoundingClientRect();
  if (rect.top >= bounds.top && rect.bottom <= bounds.bottom) return;
  viewport.scrollBy({ top: rect.top - bounds.top - bounds.height / 3, behavior: "smooth" });
}

async function analyze(): Promise<void> {
  const editor = getEditor();
  if (!assistanceOpen.peek() || !linter || !editor) return;
  const currentGeneration = ++generation;
  // WebKit will not paint highlights inside anonymous block boxes, so make sure every text run
  // lives in a real block before ranges are built.
  normalizeEditorBlocks(editor);
  const collected = collectText(editor);
  segments = collected.segments;

  if (!collected.source.trim()) {
    clearHighlights();
    batch(() => {
      assistanceWarnings.value = [];
      assistanceActiveIndex.value = -1;
    });
    return;
  }

  try {
    const ignored = new Set(getWritingAssistanceIgnores());
    const lints = await linter.lint(collected.source, { language: "plaintext" });
    if (!assistanceOpen.peek() || currentGeneration !== generation) {
      for (const lint of lints) lint.free();
      return;
    }
    const warnings = lints.map((lint) => {
      const span = lint.span();
      const warning: WritingWarning = {
        kind: lint.lint_kind(),
        message: lint.message(),
        problem: lint.get_problem_text(),
        start: Number(span.start),
        end: Number(span.end),
        suggestions: lint.suggestions().map((suggestion) => suggestion.get_replacement_text()),
      };
      lint.free();
      return warning;
    }).filter((warning) => !ignored.has(warningKey(warning)));
    batch(() => {
      assistanceWarnings.value = warnings;
      assistanceActiveIndex.value = -1;
    });
    setHighlights(warnings, null);
  } catch (error) {
    console.error("Writing assistance analysis failed.", error);
    clearHighlights();
    batch(() => {
      assistanceWarnings.value = [];
      assistanceActiveIndex.value = -1;
    });
  }
}

function scheduleAnalysis(): void {
  if (!assistanceOpen.peek() || !linter) return;
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void analyze();
  }, ANALYSIS_DEBOUNCE_MS);
}

function observeEditor(editor: HTMLElement): void {
  if (observedEditor === editor) return;
  observer?.disconnect();
  observedEditor?.removeEventListener("input", scheduleAnalysis);
  observedEditor = editor;
  editor.addEventListener("input", scheduleAnalysis);
  observer = new MutationObserver(scheduleAnalysis);
  observer.observe(editor, { childList: true, characterData: true, subtree: true });
}

function initialize(): Promise<boolean> {
  if (linter) return Promise.resolve(true);
  if (initialization) return initialization;
  assistanceStatus.value = "loading";
  initialization = (async () => {
    const localLinter = new LocalLinter({ binary: slimBinaryInlined });
    try {
      await localLinter.setup();
      await localLinter.importWords(getWritingAssistanceWords());
      linter = localLinter;
      assistanceStatus.value = "ready";
      return true;
    } catch (error) {
      console.error("Writing assistance could not initialize.", error);
      assistanceStatus.value = "unavailable";
      initialization = null;
      return false;
    }
  })();
  return initialization;
}

export async function openAssistance(): Promise<void> {
  const editor = getEditor();
  if (!editor) return;
  assistanceOpen.value = true;
  observeEditor(editor);
  if (await initialize()) scheduleAnalysis();
}

export function closeAssistance(): void {
  assistanceOpen.value = false;
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  generation++;
  segments = [];
  clearHighlights();
  batch(() => {
    assistanceWarnings.value = [];
    assistanceActiveIndex.value = -1;
  });
}

/** Selects an issue, marking it active in both the panel and the editor. */
export function selectWarning(index: number): void {
  const warning = assistanceWarnings.peek()[index];
  const editor = getEditor();
  if (!warning || !editor) return;
  batch(() => {
    assistanceActiveIndex.value = index;
    assistanceFocusRequest.value++;
  });
  setHighlights(assistanceWarnings.peek(), warning);
  const range = sourceRange(warning);
  if (range) scrollRangeIntoView(editor, range);
}

export function replaceWarning(warning: WritingWarning): void {
  const editor = getEditor();
  const suggestion = warning.suggestions[0];
  const range = sourceRange(warning);
  if (!editor || !range || !suggestion) return;
  range.deleteContents();
  range.insertNode(document.createTextNode(suggestion));
  range.commonAncestorContainer.parentNode?.normalize();
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  scheduleAnalysis();
}

export async function addToDictionary(warning: WritingWarning): Promise<void> {
  const words = [...getWritingAssistanceWords(), warning.problem];
  saveWritingAssistanceWords(words);
  await linter?.importWords(words);
  scheduleAnalysis();
}

export function ignoreWarning(warning: WritingWarning): void {
  saveWritingAssistanceIgnores([...getWritingAssistanceIgnores(), warningKey(warning)]);
  scheduleAnalysis();
}

import { LocalLinter } from "harper";
import { slimBinaryInlined } from "npm:harper.js@2.10.0/slimBinaryInlined";
import {
  getWritingAssistanceIgnores,
  getWritingAssistancePreference,
  getWritingAssistanceWords,
  saveWritingAssistanceIgnores,
  saveWritingAssistanceWords,
} from "../../../../lib/settings.ts";
import { TOGGLE_WRITING_ASSISTANCE_EVENT } from "./editor-events.ts";
import { normalizeEditorBlocks } from "./editor-normalize.ts";

interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

interface WritingWarning {
  kind: string;
  message: string;
  problem: string;
  start: number;
  end: number;
  suggestions: string[];
}

const HIGHLIGHT_NAMES = {
  spelling: "writing-assistance-spelling",
  grammar: "writing-assistance-grammar",
  active: "writing-assistance-active",
} as const;

type HighlightRegistry = {
  delete(name: string): boolean;
  set(name: string, highlight: unknown): void;
};

type HighlightConstructor = new (...ranges: Range[]) => { priority?: number };

function warningKey(warning: WritingWarning): string {
  return `${warning.kind}:${warning.problem.toLocaleLowerCase()}`;
}

function warningCategory(warning: WritingWarning): "spelling" | "grammar" {
  return warning.kind === "Spelling" || warning.kind === "Typo" ? "spelling" : "grammar";
}

function collectText(editor: HTMLElement): { source: string; segments: TextSegment[] } {
  const segments: TextSegment[] = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const values: string[] = [];
  let offset = 0;
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    if (text) {
      segments.push({ node: node as Text, start: offset, end: offset + text.length });
      values.push(text);
      offset += text.length + 1;
    }
    node = walker.nextNode();
  }
  return { source: values.join("\n"), segments };
}

function sourceRange(warning: WritingWarning, segments: readonly TextSegment[]): Range | null {
  const segment = segments.find((candidate) =>
    warning.start >= candidate.start && warning.end <= candidate.end
  );
  if (!segment) return null;
  const range = document.createRange();
  range.setStart(segment.node, warning.start - segment.start);
  range.setEnd(segment.node, warning.end - segment.start);
  return range;
}

function setHighlights(
  warnings: readonly WritingWarning[],
  segments: readonly TextSegment[],
  active: WritingWarning | null,
): void {
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry }).highlights;
  const Highlight = (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight;
  if (!registry || !Highlight) return;

  registry.delete(HIGHLIGHT_NAMES.spelling);
  registry.delete(HIGHLIGHT_NAMES.grammar);
  registry.delete(HIGHLIGHT_NAMES.active);

  const spellingRanges: Range[] = [];
  const grammarRanges: Range[] = [];
  for (const warning of warnings) {
    const range = sourceRange(warning, segments);
    if (!range) continue;
    if (warningCategory(warning) === "spelling") spellingRanges.push(range);
    else grammarRanges.push(range);
  }
  if (spellingRanges.length) {
    registry.set(HIGHLIGHT_NAMES.spelling, new Highlight(...spellingRanges));
  }
  if (grammarRanges.length) registry.set(HIGHLIGHT_NAMES.grammar, new Highlight(...grammarRanges));

  const activeRange = active ? sourceRange(active, segments) : null;
  if (!activeRange) return;
  const activeHighlight = new Highlight(activeRange);
  // Outranks the per-category highlights so the selected issue stays distinct.
  activeHighlight.priority = 1;
  registry.set(HIGHLIGHT_NAMES.active, activeHighlight);
}

function clearHighlights(): void {
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry }).highlights;
  registry?.delete(HIGHLIGHT_NAMES.spelling);
  registry?.delete(HIGHLIGHT_NAMES.grammar);
  registry?.delete(HIGHLIGHT_NAMES.active);
}

/** Brings a warning's range into view without disturbing the editor selection. */
function scrollRangeIntoView(range: Range): void {
  const viewport = document.querySelector<HTMLElement>(".editor-viewport");
  if (!viewport) return;
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const bounds = viewport.getBoundingClientRect();
  if (rect.top >= bounds.top && rect.bottom <= bounds.bottom) return;
  viewport.scrollBy({ top: rect.top - bounds.top - bounds.height / 3, behavior: "smooth" });
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

async function start(): Promise<void> {
  await customElements.whenDefined("editor-app");
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const editor = document.querySelector<HTMLElement>("#editor");
  const workspace = document.querySelector<HTMLElement>(".editor-workspace");
  if (!editor || !workspace || !getWritingAssistancePreference()) return;
  editor.spellcheck = false;

  const panel = document.createElement("aside");
  panel.className = "writing-assistance-sidebar collapsed";
  panel.setAttribute("aria-live", "polite");
  workspace.append(panel);

  let linter: LocalLinter | null = null;
  let initialization: Promise<boolean> | null = null;
  let status: "idle" | "loading" | "ready" | "unavailable" = "idle";
  let warnings: WritingWarning[] = [];
  let segments: TextSegment[] = [];
  let activeIndex = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  const isOpen = () => !panel.classList.contains("collapsed");

  const closePanel = () => {
    panel.classList.add("collapsed");
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    generation++;
    warnings = [];
    segments = [];
    activeIndex = -1;
    clearHighlights();
  };

  const renderPanel = (focusActive = false) => {
    panel.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "sidebar-heading";
    const title = document.createElement("h2");
    title.textContent = "Writing Assistance";
    heading.append(
      title,
      createButton("Close", closePanel),
    );
    panel.append(heading);

    let label = "Writing assistance: open to check this chapter";
    if (status === "loading") label = "Writing assistance: loading...";
    else if (status === "unavailable") label = "Writing assistance is unavailable.";
    else if (status === "ready") {
      label = warnings.length
        ? `Writing assistance: ${warnings.length} ${warnings.length === 1 ? "issue" : "issues"}`
        : "Writing assistance: no issues";
    }
    const statusText = document.createElement("p");
    statusText.className = "writing-assistance-status";
    statusText.textContent = label;
    panel.append(statusText);
    if (!warnings.length) return;

    const list = document.createElement("ol");
    list.className = "writing-assistance-list";
    warnings.slice(0, 10).forEach((warning, index) => {
      const category = warningCategory(warning);
      const item = document.createElement("li");
      item.className = category;
      if (index === activeIndex) item.classList.add("active");

      const issue = document.createElement("button");
      issue.type = "button";
      issue.className = "writing-assistance-issue";
      issue.setAttribute("aria-current", index === activeIndex ? "true" : "false");
      const kind = document.createElement("span");
      kind.className = "writing-assistance-kind";
      kind.textContent = category === "spelling" ? "Spelling" : warning.kind;
      const description = document.createElement("span");
      description.textContent = `${warning.problem}: ${warning.message}`;
      issue.append(kind, description);
      issue.addEventListener("click", () => selectWarning(index));
      item.append(issue);

      const actions = document.createElement("span");
      actions.className = "writing-assistance-actions";

      const suggestion = warning.suggestions[0];
      if (suggestion) {
        actions.append(createButton(`Replace with “${suggestion}”`, () => {
          const range = sourceRange(warning, segments);
          if (!range) return;
          range.deleteContents();
          range.insertNode(document.createTextNode(suggestion));
          range.commonAncestorContainer.parentNode?.normalize();
          editor.dispatchEvent(new Event("input", { bubbles: true }));
          scheduleAnalysis();
        }));
      }

      if (category === "spelling") {
        actions.append(createButton("Add to dictionary", async () => {
          const words = [...getWritingAssistanceWords(), warning.problem];
          saveWritingAssistanceWords(words);
          await linter?.importWords(words);
          scheduleAnalysis();
        }));
      } else {
        actions.append(createButton("Ignore", () => {
          saveWritingAssistanceIgnores([...getWritingAssistanceIgnores(), warningKey(warning)]);
          scheduleAnalysis();
        }));
      }
      item.append(actions);
      list.append(item);
    });
    panel.append(list);
    if (focusActive) {
      panel.querySelector<HTMLButtonElement>(".writing-assistance-issue[aria-current='true']")
        ?.focus({ preventScroll: true });
    }
  };

  /** Selects an issue, marking it active in both the panel and the editor. */
  function selectWarning(index: number): void {
    const warning = warnings[index];
    if (!warning) return;
    activeIndex = index;
    setHighlights(warnings, segments, warning);
    renderPanel(true);
    const range = sourceRange(warning, segments);
    if (range) scrollRangeIntoView(range);
  }

  const analyze = async () => {
    if (!isOpen() || !linter) return;
    const currentGeneration = ++generation;
    // WebKit will not paint highlights inside anonymous block boxes, so make sure
    // every text run lives in a real block before ranges are built.
    normalizeEditorBlocks(editor);
    const collected = collectText(editor);
    if (!collected.source.trim()) {
      warnings = [];
      segments = collected.segments;
      activeIndex = -1;
      clearHighlights();
      renderPanel();
      return;
    }

    try {
      const ignored = new Set(getWritingAssistanceIgnores());
      const lints = await linter.lint(collected.source, { language: "plaintext" });
      if (!isOpen() || currentGeneration !== generation) {
        for (const lint of lints) lint.free();
        return;
      }
      warnings = lints.map((lint) => {
        const span = lint.span();
        const warning = {
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
      segments = collected.segments;
      activeIndex = -1;
      setHighlights(warnings, segments, null);
      renderPanel();
    } catch (error) {
      console.error("Writing assistance analysis failed.", error);
      warnings = [];
      activeIndex = -1;
      clearHighlights();
      renderPanel();
    }
  };

  function scheduleAnalysis(): void {
    if (!isOpen() || !linter) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void analyze();
    }, 400);
  }

  const initialize = (): Promise<boolean> => {
    if (linter) return Promise.resolve(true);
    if (initialization) return initialization;
    status = "loading";
    renderPanel();
    initialization = (async () => {
      const localLinter = new LocalLinter({ binary: slimBinaryInlined });
      try {
        await localLinter.setup();
        await localLinter.importWords(getWritingAssistanceWords());
        linter = localLinter;
        status = "ready";
        return true;
      } catch (error) {
        console.error("Writing assistance could not initialize.", error);
        status = "unavailable";
        return false;
      } finally {
        if (isOpen()) renderPanel();
      }
    })();
    return initialization;
  };

  const openPanel = async () => {
    panel.classList.remove("collapsed");
    renderPanel();
    if (await initialize()) scheduleAnalysis();
  };

  globalThis.addEventListener(TOGGLE_WRITING_ASSISTANCE_EVENT, () => {
    if (isOpen()) closePanel();
    else void openPanel();
  });
  editor.addEventListener("input", scheduleAnalysis);
  new MutationObserver(scheduleAnalysis).observe(editor, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  renderPanel();
}

void start();

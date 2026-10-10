const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "FIELDSET",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "UL",
]);

function isBlock(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName);
}

function isBlank(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "").trim();
}

/** Absolute offset of a caret position within the editor's concatenated text. */
function caretOffset(editor: HTMLElement, node: Node, offset: number): number | null {
  if (!editor.contains(node)) return null;
  const range = document.createRange();
  range.setStart(editor, 0);
  try {
    range.setEnd(node, offset);
  } catch {
    return null;
  }
  return range.toString().length;
}

function restoreCaret(editor: HTMLElement, target: number): void {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode();
  let last: Text | null = null;
  while (node) {
    const text = node as Text;
    const length = text.data.length;
    if (seen + length >= target) {
      const selection = globalThis.getSelection();
      selection?.removeAllRanges();
      const range = document.createRange();
      range.setStart(text, target - seen);
      range.collapse(true);
      selection?.addRange(range);
      return;
    }
    seen += length;
    last = text;
    node = walker.nextNode();
  }
  if (!last) return;
  const selection = globalThis.getSelection();
  selection?.removeAllRanges();
  const range = document.createRange();
  range.setStart(last, last.data.length);
  range.collapse(true);
  selection?.addRange(range);
}

function wrapRun(container: Node, run: Node[]): void {
  if (!run.length) return;
  if (run.every(isBlank)) {
    for (const node of run) node.parentNode?.removeChild(node);
    return;
  }
  const paragraph = document.createElement("p");
  container.insertBefore(paragraph, run[0]);
  for (const node of run) paragraph.appendChild(node);
}

function normalizeContainer(container: Node): boolean {
  const children = Array.from(container.childNodes);
  let changed = false;

  if (children.some(isBlock)) {
    let run: Node[] = [];
    for (const child of children) {
      if (isBlock(child)) {
        if (run.length) {
          wrapRun(container, run);
          changed = true;
          run = [];
        }
        continue;
      }
      run.push(child);
    }
    if (run.length) {
      wrapRun(container, run);
      changed = true;
    }
  }

  for (const child of Array.from(container.childNodes)) {
    if (isBlock(child)) changed = normalizeContainer(child) || changed;
  }
  return changed;
}

/**
 * Wraps stray text and inline nodes that sit alongside block elements in paragraphs.
 *
 * WebKit (the Deno Desktop webview) does not paint `::highlight()` ranges for text laid
 * out in anonymous block boxes, which is what a container with mixed inline and block
 * children produces. Contenteditable creates that structure routinely — typing before
 * pressing Enter leaves a bare text node next to generated `<div>`s — so spelling and
 * grammar underlines silently disappeared for every line but the last well-formed block.
 *
 * Returns true when the DOM was restructured. The caret is preserved.
 */
export function normalizeEditorBlocks(editor: HTMLElement): boolean {
  const selection = globalThis.getSelection();
  const anchor = selection?.anchorNode ?? null;
  const offset = anchor ? caretOffset(editor, anchor, selection?.anchorOffset ?? 0) : null;

  const changed = normalizeContainer(editor);
  if (!changed) return false;

  if (!editor.firstChild) editor.appendChild(document.createElement("p"));
  if (offset !== null) restoreCaret(editor, offset);
  return true;
}

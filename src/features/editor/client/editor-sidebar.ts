import {
  html,
  repeat,
  webComponent,
  type WebComponentElement,
} from "../../../framework/web-components/index.ts";
import { addChapter, deleteChapter, reorderChapter, selectChapter } from "./actions.ts";
import { editorEvents } from "./editor-events.ts";
import { editorStore, state } from "./state.ts";
import { createDragDrop, type DragDropController } from "../../../../lib/drag-drop.ts";
import "../../../../lib/ui/app-chip.ts";

export interface EditorSidebar extends WebComponentElement<Record<string, never>> {
  collapsed: boolean;
  collapse(): void;
  expand(): void;
  toggle(): boolean;
}

const dragDropControllers = new WeakMap<HTMLElement, DragDropController>();

function getCollapsed(this: EditorSidebar): boolean {
  return this.classList.contains("collapsed");
}

function setCollapsed(this: EditorSidebar, value: boolean): void {
  this.classList.toggle("collapsed", value);
  this.emit("toggle", { collapsed: value });
}

function toggle(this: EditorSidebar): boolean {
  this.collapsed = !this.collapsed;
  return this.collapsed;
}

function collapse(this: EditorSidebar): void {
  this.collapsed = true;
}

function expand(this: EditorSidebar): void {
  this.collapsed = false;
}

export const editorSidebar = webComponent("editor-sidebar")
  .defineShadow(false)
  .subscribe(editorStore)
  .defineProperty("collapsed", { get: getCollapsed, set: setCollapsed })
  .defineProperty("toggle", toggle)
  .defineProperty("collapse", collapse)
  .defineProperty("expand", expand)
  .connectedCallback((element) => {
    dragDropControllers.set(
      element,
      createDragDrop(element, {
        handleSelector: "[data-drag-handle]",
        onReorder: reorderChapter,
        keyboardEnabled: true,
      }),
    );
  })
  .disconnectedCallback((element) => {
    dragDropControllers.get(element)?.destroy();
    dragDropControllers.delete(element);
  })
  .defineRender((element) => {
    const sidebar = element as unknown as EditorSidebar;
    const { chapters } = state.manuscript;
    const onSelect = (index: number) => () => {
      selectChapter(index);
      if (matchMedia("(max-width: 55rem)").matches) sidebar.collapse();
    };
    const onDelete = (index: number) => (event: Event) => {
      event.stopPropagation();
      deleteChapter(index);
    };
    const onAdd = () => {
      addChapter();
      editorEvents.emit("focusChapterTitle", undefined);
    };

    return html`
      <div class="sidebar-heading">
        <h2>Chapters</h2>
        <button type="button" class="small" @click=${onAdd}>Add</button>
      </div>
      <ol id="chapter-list">
        ${repeat(
          chapters,
          (chapter) => chapter.id,
          (chapter, index) =>
            html`
              <li
                class=${`chapter-item${index === state.activeChapter ? " active" : ""}`}
                data-drag-item>
                <button
                  type="button"
                  class="drag-handle"
                  data-drag-handle
                  aria-label=${`Reorder ${chapter.title}`}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  title="Drag to reorder">
                  ⋮
                </button>
                <span class="chapter-title" @click=${onSelect(index)}>${chapter.title}</span>
                <app-chip class="chapter-word-chip" variant="outline">
                  <small>${chapter.wordCount.toLocaleString()}w</small>
                </app-chip>
                <button
                  type="button"
                  class="delete-chapter"
                  aria-label=${`Delete ${chapter.title}`}
                  title="Delete chapter"
                  @click=${onDelete(index)}>
                  Delete
                </button>
              </li>
            `,
        )}
      </ol>
      <span id="sidebar-stats">${chapters.length} chapter${chapters.length === 1 ? "" : "s"}</span>
    `;
  })
  .create();

import { useEffect, useRef } from "preact/hooks";
import { Chip } from "../Chip.tsx";
import { createDragDrop } from "../../lib/drag-drop.ts";
import {
  activeChapterIndex,
  addChapter,
  deleteChapter,
  manuscript,
  reorderChapter,
  selectChapter,
  sidebarOpen,
  titleFocusRequest,
} from "../../lib/editor/state.ts";
import controls from "./controls.module.css";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!list.current) return;
    const controller = createDragDrop(list.current, {
      handleSelector: "[data-drag-handle]",
      onReorder: reorderChapter,
      keyboardEnabled: true,
      draggedClass: styles.dragging,
      dropTargetClass: styles.dragOver,
      draggingClass: styles.dragActive,
    });
    return () => controller.destroy();
  }, []);

  const { chapters } = manuscript.value;
  const active = activeChapterIndex.value;
  const open = sidebarOpen.value;

  function choose(index: number): void {
    selectChapter(index);
    if (matchMedia("(max-width: 55rem)").matches) sidebarOpen.value = false;
  }

  return (
    <aside
      class={`${styles.sidebar} ${open ? "" : styles.collapsed}`}
      aria-label="Chapters"
      data-collapsed={String(!open)}
      data-testid="chapters-sidebar"
    >
      <div class={styles.heading}>
        <h2>Chapters</h2>
        <button
          type="button"
          class={`${controls.button} ${controls.small}`}
          onClick={() => {
            addChapter();
            titleFocusRequest.value++;
          }}
        >
          Add
        </button>
      </div>
      <ol id="chapter-list" class={styles.list} ref={list}>
        {chapters.map((chapter, index) => (
          <li
            key={chapter.id}
            class={`${styles.item} ${index === active ? styles.active : ""}`}
            data-drag-item
            aria-current={index === active ? "true" : undefined}
          >
            <button
              type="button"
              class={styles.handle}
              data-drag-handle
              aria-label={`Reorder ${chapter.title}`}
              aria-keyshortcuts="ArrowUp ArrowDown"
              title="Drag to reorder"
            >
              ⋮
            </button>
            <span data-chapter-title onClick={() => choose(index)}>{chapter.title}</span>
            <Chip variant="outline" class={styles.chip}>
              <small>{chapter.wordCount.toLocaleString()}w</small>
            </Chip>
            <button
              type="button"
              class={styles.delete}
              aria-label={`Delete ${chapter.title}`}
              title="Delete chapter"
              onClick={(event) => {
                event.stopPropagation();
                deleteChapter(index);
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ol>
      <span id="sidebar-stats" class={styles.stats}>
        {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
      </span>
    </aside>
  );
}

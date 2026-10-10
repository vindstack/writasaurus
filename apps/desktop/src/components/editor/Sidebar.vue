<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
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
import { useSignalValue } from "../vue-signals.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import Chip from "../../../../../packages/shared/ui/components/Chip.vue";

const manuscriptState = useSignalValue(manuscript);
const activeIndex = useSignalValue(activeChapterIndex);
const isOpen = useSignalValue(sidebarOpen);
const list = ref<HTMLOListElement | null>(null);
let destroyDragDrop: (() => void) | undefined;

onMounted(() => {
  if (!list.value) return;
  const controller = createDragDrop(list.value, {
    handleSelector: "[data-drag-handle]",
    onReorder: reorderChapter,
    keyboardEnabled: true,
    draggedClass: "dragging",
    dropTargetClass: "dragOver",
    draggingClass: "dragActive",
  });
  destroyDragDrop = () => controller.destroy();
});
onUnmounted(() => destroyDragDrop?.());

function choose(index: number): void {
  selectChapter(index);
  if (matchMedia("(max-width: 55rem)").matches) sidebarOpen.value = false;
}
</script>

<template>
  <aside
    :class="['sidebar', !isOpen && 'collapsed']"
    aria-label="Chapters"
    :data-collapsed="String(!isOpen)"
    data-testid="chapters-sidebar"
  >
    <div class="heading">
      <h2>Chapters</h2>
      <Button
        variant="quiet"
        size="small"
        @click="addChapter(); titleFocusRequest.value++"
      >
        Add
      </Button>
    </div>
    <ol id="chapter-list" class="list" ref="list">
      <li
        v-for="(chapter, index) in manuscriptState.chapters"
        :key="chapter.id"
        :class="['item', index === activeIndex && 'active']"
        data-drag-item
        :aria-current="index === activeIndex ? 'true' : undefined"
      >
        <button
          type="button"
          class="handle"
          data-drag-handle
          :aria-label="`Reorder ${chapter.title}`"
          aria-keyshortcuts="ArrowUp ArrowDown"
          title="Drag to reorder"
        >
          ⋮
        </button>
        <span data-chapter-title @click="choose(index)">{{ chapter.title }}</span>
        <Chip variant="outline" class="chip">
          <small>{{ chapter.wordCount.toLocaleString() }}w</small>
        </Chip>
        <button
          type="button"
          class="delete"
          :aria-label="`Delete ${chapter.title}`"
          title="Delete chapter"
          @click.stop="deleteChapter(index)"
        >
          Delete
        </button>
      </li>
    </ol>
    <span id="sidebar-stats" class="stats">
      {{ manuscriptState.chapters.length }} chapter{{ manuscriptState.chapters.length === 1 ? "" : "s" }}
    </span>
  </aside>
</template>

<style scoped>
.sidebar {
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-width: 19rem;
  padding: 0.75rem;
  transition:
    margin 0.2s,
    transform 0.2s;
  width: 19rem;
}

.collapsed {
  margin-left: -19rem;
}

.heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding-bottom: 0.75rem;
}

.heading h2 {
  font:
    700 0.8rem ui-sans-serif,
    system-ui;
  letter-spacing: 0.08em;
  margin: 0;
  text-transform: uppercase;
}

.list {
  align-content: start;
  display: grid;
  gap: 0.25rem;
  grid-auto-rows: max-content;
  list-style: none;
  margin: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 0;
}

.dragActive {
  opacity: 0.95;
}

.item {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  cursor: pointer;
  display: grid;
  gap: 0.5rem;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  min-height: 2.75rem;
  padding: 0.55rem;
}

.item > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active {
  background: var(--surface-sunken);
  border-color: var(--border);
}

.dragging {
  background: var(--surface-sunken);
  border-color: var(--accent);
  opacity: 0.5;
  pointer-events: none;
}

.dragOver {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border-color: var(--accent);
  box-shadow: inset 0 2px 4px color-mix(in srgb, var(--accent) 20%, transparent);
}

.handle {
  align-items: center;
  background: transparent;
  border: 0;
  color: var(--muted);
  cursor: grab;
  display: inline-flex;
  font-size: 0.9rem;
  justify-content: center;
  padding: 0 0.25rem;
  transition: color 0.15s;
  user-select: none;
}

.handle:active {
  cursor: grabbing;
}

.chip {
  --border: transparent;

  font-size: 0.72rem;
}

.delete {
  align-items: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 0.3rem;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.7rem;
  justify-content: center;
  padding: 0.2rem 0.35rem;
}

.delete:hover,
.delete:focus-visible {
  background: var(--surface-sunken);
  border-color: var(--border);
  outline: none;
}

.delete:active:not(:disabled) {
  background: var(--surface-sunken);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
  transform: translateY(1px) scale(0.96);
}

.stats {
  color: var(--muted);
  font-size: 0.72rem;
}

@media (max-width: 55rem) {
  .sidebar {
    bottom: 0;
    left: 0;
    margin-left: 0;
    min-width: 0;
    position: absolute;
    top: 0;
    width: min(19rem, 88vw);
    z-index: 10;
  }

  .collapsed {
    margin-left: 0;
    transform: translateX(-100%);
  }
}

</style>

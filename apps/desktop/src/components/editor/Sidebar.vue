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
import { SECTION_TYPE_LABELS, SECTION_TYPES, type SectionType } from "../../lib/editor/types.ts";
import { useSignalValue } from "../vue-signals.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import Chip from "../../../../../packages/shared/ui/components/Chip.vue";
import DropdownMenu from "../../../../../packages/shared/ui/components/DropdownMenu.vue";
import SlideoutPanel from "./SlideoutPanel.vue";

const manuscriptState = useSignalValue(manuscript);
const activeIndex = useSignalValue(activeChapterIndex);
const isOpen = useSignalValue(sidebarOpen);
const addMenuOpen = ref(false);
const list = ref<HTMLOListElement | null>(null);
let destroyDragDrop: (() => void) | undefined;

function addSection(type: SectionType): void {
  addChapter(type);
  titleFocusRequest.value++;
  addMenuOpen.value = false;
}

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
  <SlideoutPanel :open="isOpen" side="left" label="Book sections" class="sidebar" data-testid="chapters-sidebar">
    <div class="heading">
      <h2>Sections</h2>
      <div class="heading-actions">
        <span
          class="generated-toc"
          data-generated-section="toc"
          aria-label="Table of contents, generated for EPUB"
          title="The EPUB table of contents is generated from book sections"
        >TOC</span>
        <DropdownMenu
          placement="bottom-end"
          :open="addMenuOpen"
          @open-change="addMenuOpen = $event"
          @keydown.esc="addMenuOpen = false"
        >
          <template #trigger>
            <Button
              variant="quiet"
              size="small"
              aria-haspopup="menu"
              :aria-expanded="addMenuOpen"
            >
              Add
            </Button>
          </template>
          <div class="section-menu">
            <button
              v-for="type in SECTION_TYPES"
              :key="type"
              type="button"
              role="menuitem"
              class="section-menu-item"
              @click="addSection(type)"
            >
              {{ SECTION_TYPE_LABELS[type] }}
            </button>
          </div>
        </DropdownMenu>
      </div>
    </div>
    <ol id="chapter-list" class="list" ref="list">
      <li v-for="(chapter, index) in manuscriptState.chapters" :key="chapter.id"
        :class="['item', index === activeIndex && 'active']" data-drag-item
        :aria-current="index === activeIndex ? 'true' : undefined">
        <button type="button" class="handle" data-drag-handle :aria-label="`Reorder ${chapter.title}`"
          aria-keyshortcuts="ArrowUp ArrowDown" title="Drag to reorder">
          ⋮
        </button>
        <span data-chapter-title @click="choose(index)">
          {{ chapter.title }}
          <small v-if="chapter.type && chapter.type !== 'chapter'">
            · {{ SECTION_TYPE_LABELS[chapter.type] }}
          </small>
        </span>
        <Chip variant="outline" class="chip">
          <small>{{ chapter.wordCount.toLocaleString() }}w</small>
        </Chip>
        <button type="button" class="delete button--small" :aria-label="`Delete ${chapter.title}`"
          title="Delete chapter" @click.stop="deleteChapter(index)">
          Delete
        </button>
      </li>
    </ol>
    <span id="sidebar-stats" class="stats">
      {{ manuscriptState.chapters.length }} chapter{{ manuscriptState.chapters.length === 1 ? "" : "s" }}
    </span>
  </SlideoutPanel>
</template>

<style scoped>
.sidebar {
  grid-template-rows: auto auto 1fr auto;
}

.heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding-bottom: 0.25rem;
}

.heading-actions {
  align-items: center;
  display: flex;
  gap: 0.35rem;
}

.section-menu {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  box-shadow: 0 0.5rem 1.5rem color-mix(in srgb, var(--text) 14%, transparent);
  display: grid;
  max-height: min(70vh, 24rem);
  min-width: 12rem;
  overflow-y: auto;
  padding: 0.25rem;
}

.section-menu-item {
  background: transparent;
  border: 0;
  border-radius: 0.25rem;
  color: var(--text);
  cursor: pointer;
  padding: 0.45rem 0.6rem;
  text-align: left;
}

.section-menu-item:hover,
.section-menu-item:focus-visible {
  background: var(--surface-sunken);
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

.item>span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generated-toc {
  color: var(--muted);
  font-size: 0.65rem;
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
</style>

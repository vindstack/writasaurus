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
import controls from "./controls.module.css";
import styles from "./Sidebar.module.css";
import Chip from "../Chip.vue";

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
    draggedClass: styles.dragging,
    dropTargetClass: styles.dragOver,
    draggingClass: styles.dragActive,
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
    :class="[styles.sidebar, !isOpen && styles.collapsed]"
    aria-label="Chapters"
    :data-collapsed="String(!isOpen)"
    data-testid="chapters-sidebar"
  >
    <div :class="styles.heading">
      <h2>Chapters</h2>
      <button
        type="button"
        :class="[controls.button, controls.small]"
        @click="addChapter(); titleFocusRequest.value++"
      >
        Add
      </button>
    </div>
    <ol id="chapter-list" :class="styles.list" ref="list">
      <li
        v-for="(chapter, index) in manuscriptState.chapters"
        :key="chapter.id"
        :class="[styles.item, index === activeIndex && styles.active]"
        data-drag-item
        :aria-current="index === activeIndex ? 'true' : undefined"
      >
        <button
          type="button"
          :class="styles.handle"
          data-drag-handle
          :aria-label="`Reorder ${chapter.title}`"
          aria-keyshortcuts="ArrowUp ArrowDown"
          title="Drag to reorder"
        >
          ⋮
        </button>
        <span data-chapter-title @click="choose(index)">{{ chapter.title }}</span>
        <Chip variant="outline" :class="styles.chip">
          <small>{{ chapter.wordCount.toLocaleString() }}w</small>
        </Chip>
        <button
          type="button"
          :class="styles.delete"
          :aria-label="`Delete ${chapter.title}`"
          title="Delete chapter"
          @click.stop="deleteChapter(index)"
        >
          Delete
        </button>
      </li>
    </ol>
    <span id="sidebar-stats" :class="styles.stats">
      {{ manuscriptState.chapters.length }} chapter{{ manuscriptState.chapters.length === 1 ? "" : "s" }}
    </span>
  </aside>
</template>

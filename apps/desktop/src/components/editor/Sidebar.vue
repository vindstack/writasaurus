<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { createDragDrop } from "../../lib/drag-drop.ts";
import { save } from "../../lib/editor/commands.ts";
import { editorHistory } from "../../lib/editor/history.ts";
import {
  activeChapterIndex,
  addChapter,
  deleteChapter,
  hasUnsavedChanges,
  manuscript,
  manuscriptLoadVersion,
  replaceManuscript,
  reorderChapter,
  selectChapter,
  sidebarOpen,
  titleFocusRequest,
} from "../../lib/editor/state.ts";
import type { Manuscript, SectionType } from "../../lib/editor/types.ts";
import { SECTION_TYPE_LABELS, SECTION_TYPES } from "../../lib/editor/types.ts";
import { useSignalValue } from "../vue-signals.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import Chip from "../../../../../packages/shared/ui/components/Chip.vue";
import Dialog from "../../../../../packages/shared/ui/components/Dialog.vue";
import DropdownMenu from "../../../../../packages/shared/ui/components/DropdownMenu.vue";
import SlideoutPanel from "./SlideoutPanel.vue";

interface DraftSummary {
  number: number;
  filename: string;
}

const manuscriptState = useSignalValue(manuscript);
const loadVersion = useSignalValue(manuscriptLoadVersion);
const activeIndex = useSignalValue(activeChapterIndex);
const isOpen = useSignalValue(sidebarOpen);
const addMenuOpen = ref(false);
const draftMenuOpen = ref(false);
const createDraftOpen = ref(false);
const draftMode = ref<"blank" | "copy">("copy");
const sourceDraft = ref(1);
const drafts = ref<DraftSummary[]>([]);
const activeDraft = ref(1);
const draftBusy = ref(false);
const draftLoading = ref(false);
const draftError = ref("");
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

async function chooseDraft(number: number): Promise<void> {
  draftMenuOpen.value = false;
  if (number === activeDraft.value) return;
  draftBusy.value = true;
  try {
    if (!(await saveBeforeDraftChange())) return;
    const response = await fetch("/api/editor/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "select", number }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    replaceManuscript(result.manuscript as Manuscript, { desktopFileLoaded: true });
    drafts.value = result.drafts;
    activeDraft.value = result.activeDraft;
    editorHistory.clear();
    if (matchMedia("(max-width: 55rem)").matches) sidebarOpen.value = false;
  } catch (error) {
    console.error("Could not switch drafts:", error);
    alert(error instanceof Error ? error.message : "Could not switch drafts.");
  } finally {
    draftBusy.value = false;
  }
}

function openCreateDraft(): void {
  draftMenuOpen.value = false;
  draftMode.value = "copy";
  sourceDraft.value = drafts.value.at(-1)?.number ?? activeDraft.value;
  draftError.value = "";
  createDraftOpen.value = true;
}

function closeCreateDraft(): void {
  createDraftOpen.value = false;
  draftError.value = "";
}

async function createNewDraft(): Promise<void> {
  draftBusy.value = true;
  draftError.value = "";
  try {
    if (!(await saveBeforeDraftChange())) {
      draftError.value = "Save the current draft before creating another.";
      return;
    }
    const response = await fetch("/api/editor/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        mode: draftMode.value,
        sourceDraft: sourceDraft.value,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    replaceManuscript(result.manuscript as Manuscript, { desktopFileLoaded: true });
    drafts.value = result.drafts;
    activeDraft.value = result.activeDraft;
    editorHistory.clear();
    createDraftOpen.value = false;
  } catch (error) {
    console.error("Could not create a draft:", error);
    draftError.value = error instanceof Error ? error.message : "Could not create a draft.";
  } finally {
    draftBusy.value = false;
  }
}

async function saveBeforeDraftChange(): Promise<boolean> {
  if (!hasUnsavedChanges.peek()) return true;
  await save();
  return !hasUnsavedChanges.peek();
}

watch(
  [loadVersion, () => manuscriptState.value.filename],
  async (_value, _previous, onCleanup) => {
    let current = true;
    onCleanup(() => (current = false));
    drafts.value = [];
    activeDraft.value = 1;
    draftError.value = "";
    draftMenuOpen.value = false;
    createDraftOpen.value = false;
    draftLoading.value = true;
    try {
      const response = await fetch("/api/editor/drafts");
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      if (!current) return;
      drafts.value = result.drafts;
      activeDraft.value = result.activeDraft;
    } catch (error) {
      if (!current) return;
      console.error("Could not load project drafts:", error);
      draftError.value = error instanceof Error ? error.message : "Could not load project drafts.";
    } finally {
      if (current) draftLoading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <SlideoutPanel
    :open="isOpen"
    side="left"
    label="Book sections"
    class="sidebar"
    data-testid="chapters-sidebar"
  >
    <div class="draft-controls">
      <div class="draft-toolbar">
        <DropdownMenu
          placement="bottom-start"
          :open="draftMenuOpen"
          @open-change="draftMenuOpen = $event"
          @keydown.esc="draftMenuOpen = false"
        >
          <template #trigger>
            <Button
              variant="quiet-outline"
              size="small"
              aria-haspopup="menu"
              :aria-expanded="draftMenuOpen"
              :disabled="draftBusy || draftLoading"
              data-draft-selector
            >
              Draft {{ activeDraft }} <span aria-hidden="true">▾</span>
            </Button>
          </template>
          <div class="draft-menu">
            <button
              v-for="draft in drafts"
              :key="draft.number"
              type="button"
              role="menuitemradio"
              class="section-menu-item"
              :aria-checked="draft.number === activeDraft"
              :disabled="draftBusy"
              @click="chooseDraft(draft.number)"
            >
              Draft {{ draft.number }}
            </button>
            <div class="menu-divider"></div>
            <button
              type="button"
              role="menuitem"
              class="section-menu-item"
              :disabled="draftBusy"
              @click="openCreateDraft"
            >
              Create new draft…
            </button>
          </div>
        </DropdownMenu>
        <span class="draft-count" data-draft-count
          >{{ drafts.length }} draft{{ drafts.length === 1 ? "" : "s" }}</span
        >
      </div>
      <p v-if="draftError && !createDraftOpen" class="draft-error" role="alert">{{ draftError }}</p>
    </div>
    <div class="heading">
      <h2>Sections</h2>
      <div class="heading-actions">
        <span
          class="generated-toc"
          data-generated-section="toc"
          aria-label="Table of contents, generated for EPUB"
          title="The EPUB table of contents is generated from book sections"
          >TOC</span
        >
        <DropdownMenu
          placement="bottom-end"
          :open="addMenuOpen"
          @open-change="addMenuOpen = $event"
          @keydown.esc="addMenuOpen = false"
        >
          <template #trigger>
            <Button variant="quiet" size="small" aria-haspopup="menu" :aria-expanded="addMenuOpen">
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
      <li
        v-for="(chapter, index) in manuscriptState.chapters"
        :key="chapter.id"
        :class="['item', index === activeIndex && 'active']"
        data-drag-item
        @click="choose(index)"
        :aria-current="index === activeIndex ? 'true' : undefined"
      >
        <button
          type="button"
          class="handle"
          data-drag-handle
          :aria-label="`Reorder ${chapter.title}`"
          aria-keyshortcuts="ArrowUp ArrowDown"
          title="Drag to reorder"
          @click.stop
        >
          ⋮
        </button>
        <span data-chapter-title>
          {{ chapter.title }}
          <small v-if="chapter.type && chapter.type !== 'chapter'">
            · {{ SECTION_TYPE_LABELS[chapter.type] }}
          </small>
        </span>
        <Chip variant="outline" class="chip">
          <small>{{ chapter.wordCount.toLocaleString() }}w</small>
        </Chip>
        <button
          type="button"
          class="delete button--small"
          :aria-label="`Delete ${chapter.title}`"
          title="Delete chapter"
          @click.stop="deleteChapter(index)"
        >
          Delete
        </button>
      </li>
    </ol>
    <span id="sidebar-stats" class="stats">
      {{ manuscriptState.chapters.length }} chapter{{
        manuscriptState.chapters.length === 1 ? "" : "s"
      }}
    </span>
    <Dialog
      id="create-draft-dialog"
      title="Create New Draft"
      :open="createDraftOpen"
      @close="closeCreateDraft"
    >
      <form class="draft-form" @submit.prevent="createNewDraft">
        <fieldset>
          <legend>Start the draft</legend>
          <label>
            <input v-model="draftMode" type="radio" value="copy" :disabled="draftBusy" />
            Copy a previous draft
          </label>
          <label>
            <input v-model="draftMode" type="radio" value="blank" :disabled="draftBusy" />
            Start from scratch
          </label>
        </fieldset>
        <label v-if="draftMode === 'copy'" class="source-field">
          Copy from
          <select v-model.number="sourceDraft" :disabled="draftBusy">
            <option v-for="draft in drafts" :key="draft.number" :value="draft.number">
              Draft {{ draft.number }}
            </option>
          </select>
        </label>
        <p v-if="draftError" class="draft-error" role="alert">{{ draftError }}</p>
        <footer class="dialog-actions">
          <Button :disabled="draftBusy" @click="closeCreateDraft">Cancel</Button>
          <button class="button button--primary" type="submit" :disabled="draftBusy">
            {{ draftBusy ? "Creating…" : "Create Draft" }}
          </button>
        </footer>
      </form>
    </Dialog>
  </SlideoutPanel>
</template>

<style scoped>
.sidebar {
  grid-template-rows: auto auto 1fr auto;
}

.draft-controls {
  padding-bottom: 0.35rem;
}

.draft-toolbar {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.draft-count {
  color: var(--muted);
  font-size: 0.7rem;
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

.section-menu,
.draft-menu {
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

.draft-menu {
  min-width: 10rem;
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

.section-menu-item:disabled {
  cursor: default;
  opacity: 0.6;
}

.menu-divider {
  border-top: 1px solid var(--border);
  margin: 0.25rem 0;
}

.draft-form {
  display: grid;
  gap: var(--space-4);
}

.draft-form fieldset {
  border: 0;
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
}

.draft-form legend {
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.draft-form label {
  align-items: center;
  display: flex;
  gap: var(--space-2);
}

.draft-form .source-field {
  align-items: stretch;
  flex-direction: column;
}

.dialog-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

.draft-error {
  color: var(--danger);
  font-size: 0.75rem;
  margin: 0;
  overflow-wrap: anywhere;
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
  gap: 0.2rem;
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
  gap: 0.35rem;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  line-height: 1.3;
  min-height: 2.25rem;
  padding: 0.3rem 0.4rem;
}

.item:hover:not(.active) {
  background: var(--surface-sunken);
}

.item > span {
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
  min-height: 1.5rem;
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
  line-height: 1.2;
  padding: 0.12rem 0.4rem;
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
  line-height: 1.2;
  min-height: 1.5rem;
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

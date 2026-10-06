<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { isEpubFilename } from "../../lib/epub.ts";
import { saveLocal } from "../../lib/editor/storage.ts";
import { loadFile, openManuscript } from "../../lib/editor/file-io.ts";
import { restoreEditor, startNewManuscript } from "../../lib/editor/session.ts";
import { focusEditor, redo, undo } from "../../lib/editor/surface.ts";
import { save, toggleFullscreen } from "../../lib/editor/commands.ts";
import { toggleAssistance } from "../../lib/editor/assistance-state.ts";
import {
  activeChapterIndex,
  desktopFileLoaded,
  hasUnsavedChanges,
  isDesktop,
  manuscript,
  menuOpen,
  sidebarOpen,
  statsIndex,
} from "../../lib/editor/state.ts";
import { effect } from "@preact/signals";
import Topbar from "../editor/Topbar.vue";
import Sidebar from "../editor/Sidebar.vue";
import WritingArea from "../editor/WritingArea.vue";
import AssistancePanel from "../editor/AssistancePanel.vue";
import StatusBar from "../editor/StatusBar.vue";

const AUTOSAVE_DEBOUNCE_MS = 1_000;
const props = defineProps<{ isDesktop: boolean }>();
const fileInput = ref<HTMLInputElement | null>(null);
const ready = ref(false);
isDesktop.value = props.isDesktop;

let disposed = false;
let stopPersistence: (() => void) | undefined;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let cleanupListeners: (() => void) | undefined;

onMounted(() => {
  void restoreEditor().then((opened) => {
    if (disposed) return;
    ready.value = true;
    if (!opened) {
      location.replace("/welcome");
      return;
    }
    stopPersistence = effect(() => {
      const unsaved = hasUnsavedChanges.value;
      saveLocal(manuscript.value, activeChapterIndex.value, unsaved);
      if (isDesktop.value && desktopFileLoaded.value && unsaved) {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS);
      } else if (!unsaved) {
        clearTimeout(autosaveTimer);
      }
      return () => clearTimeout(autosaveTimer);
    });
  });

  const onKeyDown = (event: KeyboardEvent) => {
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (modifier && key === "y") {
      event.preventDefault();
      redo();
    } else if (modifier && key === "b") {
      event.preventDefault();
      sidebarOpen.value = !sidebarOpen.value;
    } else if (modifier && key === "g") {
      event.preventDefault();
      statsIndex.value = (statsIndex.value + 1) % 3;
    } else if (modifier && key === "n" && isDesktop.value) {
      event.preventDefault();
      void toggleAssistance();
    } else if (modifier && key === "s") {
      event.preventDefault();
      void save();
    } else if (modifier && event.key === ",") {
      event.preventDefault();
      location.href = "/settings";
    } else if (modifier && event.shiftKey && key === "e") {
      event.preventDefault();
      focusEditor();
    } else if (event.key === "F11" && isDesktop.value) {
      event.preventDefault();
      menuOpen.value = false;
      void toggleFullscreen();
    } else if (event.key === "Escape") {
      menuOpen.value = false;
    } else if (modifier && key === "m") {
      event.preventDefault();
      menuOpen.value = true;
      setTimeout(() => {
        document.querySelector<HTMLElement>('#app-menu [role="menuitem"]')?.focus();
      });
    }
  };
  const onDragOver = (event: DragEvent) => event.preventDefault();
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file && isEpubFilename(file.name)) void loadFile(file);
  };
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!hasUnsavedChanges.peek()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("dragover", onDragOver);
  document.addEventListener("drop", onDrop);
  addEventListener("beforeunload", onBeforeUnload);
  cleanupListeners = () => {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("dragover", onDragOver);
    document.removeEventListener("drop", onDrop);
    removeEventListener("beforeunload", onBeforeUnload);
  };
});

onUnmounted(() => {
  disposed = true;
  stopPersistence?.();
  clearTimeout(autosaveTimer);
  cleanupListeners?.();
});
</script>

<template>
  <div class="app" :data-ready="String(ready)">
    <Topbar
      :on-new="() => void startNewManuscript()"
      :on-open="() => void openManuscript(fileInput.value)"
    />
    <main class="main">
      <div class="workspace">
        <Sidebar />
        <WritingArea />
        <AssistancePanel />
      </div>
    </main>
    <StatusBar />
    <input
      ref="fileInput"
      id="editor-file-input"
      type="file"
      accept=".epub,application/epub+zip"
      hidden
      @change="(event) => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (file) void loadFile(file);
        input.value = '';
      }"
    />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100vh;
  max-width: 100vw;
  overflow: hidden;
  width: 100vw;
}

.main {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  width: 100%;
}

.workspace {
  display: flex;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  position: relative;
  width: 100%;
}

@media (max-width: 55rem) {
  .app {
    height: 100dvh;
  }
}
</style>

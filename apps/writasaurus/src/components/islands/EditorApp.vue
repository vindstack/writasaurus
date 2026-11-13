<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { restoreLocal, saveLocal } from "../../lib/editor/storage.ts";
import { getProjectIdentity } from "../../lib/editor-session.ts";
import {
  openProject,
  requestOutline,
  saveOutlineToDisk,
  saveToDisk,
} from "../../lib/editor/file-io.ts";
import {
  reconnectProject,
  recoverCachedEditor,
  recoveryNotice,
  restoreEditor,
} from "../../lib/editor/session.ts";
import { focusEditor, redo, undo } from "../../lib/editor/surface.ts";
import { save, toggleFullscreen } from "../../lib/editor/commands.ts";
import { toggleAssistance } from "../../lib/editor/assistance-state.ts";
import { getFontPreference, loadAppSettings } from "../../lib/app-settings-client.ts";
import { applyFontPreference } from "../../../../../packages/shared/settings.ts";
import { getProjectShortcutAction } from "../../lib/shortcuts.ts";
import type { Manuscript } from "../../lib/editor/types.ts";
import { editorHistory } from "../../lib/editor/history.ts";
import {
  activeChapterIndex,
  advanceChapter,
  projectLoaded,
  editorMode,
  hasUnsavedChanges,
  manuscript,
  menuOpen,
  outlineContent,
  outlineHasUnsavedChanges,
  replaceManuscript,
  replaceOutline,
  sidebarOpen,
} from "../../lib/editor/state.ts";
import { effect } from "@preact/signals";
import Topbar from "../editor/Topbar.vue";
import Toolbar from "../editor/Toolbar.vue";
import Sidebar from "../editor/Sidebar.vue";
import WritingArea from "../editor/WritingArea.vue";
import AssistancePanel from "../editor/AssistancePanel.vue";
import StatusBar from "../editor/StatusBar.vue";
import ProjectCreateDialog from "./ProjectCreateDialog.vue";
import { useSignalValue } from "../vue-signals.ts";

const AUTOSAVE_DEBOUNCE_MS = 1_000;
const ready = ref(false);
const surfaceReady = ref(false);
const initializationError = ref("");
const recoveryCacheFailed = ref(false);
const needsPermission = ref(false);
const toolbarVisible = ref(true);
const createProjectOpen = ref(false);
const modeState = useSignalValue(editorMode);
const loadedState = useSignalValue(projectLoaded);
const unsavedState = useSignalValue(hasUnsavedChanges);
const outlineUnsavedState = useSignalValue(outlineHasUnsavedChanges);
const recoveryNoticeState = useSignalValue(recoveryNotice);
let disposed = false;
let stopPersistence: (() => void) | undefined;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let cleanupListeners: (() => void) | undefined;

onMounted(() => {
  void initializeEditor();
  const onKeyDown = (event: KeyboardEvent) => {
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const projectAction = getProjectShortcutAction(event);
    if (projectAction === "new-project") {
      event.preventDefault();
      void startNewProject();
    } else if (projectAction === "open-project") {
      event.preventDefault();
      void openProject();
    } else if (projectAction === "next-chapter" && editorMode.peek() === "manuscript") {
      event.preventDefault();
      advanceChapter();
    } else if (projectAction === "toggle-project-view") {
      event.preventDefault();
      if (editorMode.peek() === "manuscript") void openOutline();
      else void showManuscript();
    } else if (projectAction === "writing-assistance" && editorMode.peek() === "manuscript") {
      event.preventDefault();
      void toggleAssistance();
    } else if (modifier && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (modifier && key === "y") {
      event.preventDefault();
      redo();
    } else if (modifier && key === "b" && editorMode.peek() === "manuscript") {
      event.preventDefault();
      sidebarOpen.value = !sidebarOpen.value;
    } else if (modifier && key === "s") {
      event.preventDefault();
      void save();
    } else if (modifier && event.key === ",") {
      event.preventDefault();
      location.href = "/editor/settings";
    } else if (modifier && event.shiftKey && key === "e") {
      event.preventDefault();
      focusEditor();
    } else if (event.key === "F11") {
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
  document.addEventListener("keydown", onKeyDown);
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (hasUnsavedChanges.peek() || outlineHasUnsavedChanges.peek()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  addEventListener("beforeunload", onBeforeUnload);
  cleanupListeners = () => {
    document.removeEventListener("keydown", onKeyDown);
    removeEventListener("beforeunload", onBeforeUnload);
  };
});

async function initializeEditor(): Promise<void> {
  try {
    await loadAppSettings();
    applyFontPreference(getFontPreference());
    await restoreProjectEditor();
  } catch (error) {
    initializationError.value =
      error instanceof Error ? error.message : "Could not initialize Writasaurus.";
  } finally {
    ready.value = true;
  }
}

async function restoreProjectEditor(offline = false): Promise<void> {
  const opened = offline
    ? recoverCachedEditor()
      ? "opened"
      : "permission"
    : await restoreEditor();
  if (disposed) return;
  if (opened === "permission") {
    needsPermission.value = true;
    return;
  }
  needsPermission.value = false;
  if (opened === "welcome") {
    location.replace("/editor/welcome");
    return;
  }
  stopPersistence = effect(() => {
    const unsaved = hasUnsavedChanges.value;
    const mode = editorMode.value;
    const outlineUnsaved = outlineHasUnsavedChanges.value;
    const outlineDraft = outlineContent.value;
    const saveManuscript = projectLoaded.value && unsaved;
    const identity = projectLoaded.value ? getProjectIdentity() : null;
    const recovered = identity ? null : restoreLocal();
    recoveryCacheFailed.value = !saveLocal(
      manuscript.value,
      activeChapterIndex.value,
      unsaved,
      outlineDraft,
      outlineUnsaved,
      mode,
      identity?.id ?? recovered?.projectId,
      identity?.filename ?? recovered?.projectFilename,
    );
    if ((projectLoaded.value && mode === "outline" && outlineUnsaved) || saveManuscript) {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        if (mode === "outline" && outlineUnsaved) {
          void saveOutlineToDisk(outlineDraft);
        }
        if (saveManuscript) {
          if (mode === "manuscript") void save();
          else void saveToDisk();
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    } else {
      clearTimeout(autosaveTimer);
    }
    return () => clearTimeout(autosaveTimer);
  });
}

async function recoverCached(): Promise<void> {
  initializationError.value = "";
  await restoreProjectEditor(true);
  if (needsPermission.value) initializationError.value = "No cached editor session is available.";
}

async function reconnect(): Promise<void> {
  try {
    if (await reconnectProject()) {
      initializationError.value = "";
      await restoreProjectEditor();
    } else {
      initializationError.value = "Project access was not granted. Please try again.";
    }
  } catch (error) {
    initializationError.value =
      error instanceof Error ? error.message : "Could not reconnect the project.";
  }
}

onUnmounted(() => {
  disposed = true;
  stopPersistence?.();
  clearTimeout(autosaveTimer);
  cleanupListeners?.();
});

function useCreatedProject(created: Manuscript): void {
  editorMode.value = "manuscript";
  replaceOutline("");
  replaceManuscript(created, { projectLoaded: true });
  editorHistory.clear();
}

async function startNewProject(): Promise<void> {
  if (!projectLoaded.peek() && (hasUnsavedChanges.peek() || outlineHasUnsavedChanges.peek())) {
    if (
      !confirm(
        "Your recovered changes are not connected to a project. Export your manuscript and outline first. Discard these changes and create another project?",
      )
    )
      return;
    createProjectOpen.value = true;
    return;
  }
  if (editorMode.peek() === "outline" && outlineHasUnsavedChanges.peek()) {
    if (!(await saveOutlineToDisk())) return;
  }
  if (hasUnsavedChanges.peek()) {
    if (editorMode.peek() === "manuscript") await save();
    else await saveToDisk();
    if (hasUnsavedChanges.peek()) return;
  }
  createProjectOpen.value = true;
}

async function openOutline(): Promise<boolean> {
  try {
    if (!projectLoaded.peek() && outlineHasUnsavedChanges.peek()) {
      editorMode.value = "outline";
      editorHistory.clear();
      return true;
    }
    if (editorMode.peek() === "manuscript" && hasUnsavedChanges.peek()) {
      await save();
      if (hasUnsavedChanges.peek()) return false;
    }
    const content = await requestOutline();
    replaceOutline(content);
    editorHistory.clear();
    editorMode.value = "outline";
    return true;
  } catch (error) {
    console.error("Could not open the project outline:", error);
    alert(error instanceof Error ? error.message : "Could not open the project outline.");
    return false;
  }
}

async function showManuscript(): Promise<boolean> {
  if (!projectLoaded.peek()) {
    editorMode.value = "manuscript";
    editorHistory.clear();
    return true;
  }
  if (outlineHasUnsavedChanges.peek() && !(await saveOutlineToDisk())) return false;
  if (hasUnsavedChanges.peek()) {
    await saveToDisk();
    if (hasUnsavedChanges.peek()) return false;
  }
  editorMode.value = "manuscript";
  editorHistory.clear();
  return true;
}
</script>

<template>
  <main v-if="needsPermission" class="permissionPage">
    <section class="permissionCard" aria-labelledby="permission-title">
      <div class="permissionIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M3.75 7.5h6l1.8 2.1h8.7v8.65a1.5 1.5 0 0 1-1.5 1.5h-13.5a1.5 1.5 0 0 1-1.5-1.5V7.5Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
          <path
            d="M12 12.25v4.5m-2.25-2.25h4.5"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
      </div>
      <p class="permissionEyebrow">Project access</p>
      <h1 id="permission-title">Reconnect your project</h1>
      <p class="permissionDescription">
        Writasaurus needs access to your project folder to reopen your manuscript and save changes.
        Your files stay on your device.
      </p>
      <p v-if="initializationError" class="permissionError" role="alert">
        {{ initializationError }}
      </p>
      <div class="permissionActions">
        <button
          class="button button--primary"
          type="button"
          data-reconnect-project
          @click="reconnect"
        >
          Reconnect project
        </button>
        <button class="button button--quiet-outline" type="button" @click="recoverCached">
          Recover cached changes
        </button>
      </div>
      <p class="permissionNote">
        If folder access isn’t available, you can try recovering the latest changes saved in this
        browser.
      </p>
    </section>
  </main>
  <p v-else-if="initializationError" role="alert">
    {{ initializationError }} You may retry by restarting Writasaurus.
  </p>
  <p v-else-if="!ready" role="status">Loading Writasaurus...</p>
  <div
    v-else
    :class="['app', !toolbarVisible && 'toolbarHidden']"
    :data-ready="String(surfaceReady)"
  >
    <Topbar
      :on-new-project="startNewProject"
      :on-open-project="() => void openProject()"
      :toolbar-visible="toolbarVisible"
      :on-toggle-toolbar="() => (toolbarVisible = !toolbarVisible)"
      :on-open-outline="openOutline"
      :on-show-manuscript="showManuscript"
    />
    <p v-if="recoveryCacheFailed" role="alert" data-recovery-warning>
      Session recovery could not be updated and may be outdated. Unsaved changes may be lost on
      reload; save your project or export your work before leaving.
    </p>
    <p v-if="!loadedState && (unsavedState || outlineUnsavedState)" role="alert">
      {{
        recoveryNoticeState ||
        "Changes are not connected to a project. Export your manuscript and outline before opening another project."
      }}
    </p>
    <ProjectCreateDialog
      :open="createProjectOpen"
      @close="createProjectOpen = false"
      @created="useCreatedProject"
    />
    <Toolbar v-if="toolbarVisible" />
    <main class="main">
      <div class="workspace">
        <Sidebar v-if="modeState === 'manuscript'" />
        <WritingArea :mode="modeState" @ready="surfaceReady = true" />
        <AssistancePanel v-if="modeState === 'manuscript'" />
      </div>
    </main>
    <StatusBar />
  </div>
</template>

<style scoped>
.permissionPage {
  align-items: center;
  background:
    radial-gradient(
      ellipse at 50% 20%,
      color-mix(in srgb, var(--accent) 8%, transparent),
      transparent 38rem
    ),
    var(--bg);
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: clamp(1.25rem, 5vw, 3rem);
}

.permissionCard {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1rem;
  box-shadow: var(--shadow-md);
  box-sizing: border-box;
  max-width: 34rem;
  padding: clamp(1.5rem, 5vw, 2.75rem);
  text-align: center;
  width: 100%;
}

.permissionIcon {
  align-items: center;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border-radius: 1rem;
  color: var(--accent-strong);
  display: flex;
  height: 3.5rem;
  justify-content: center;
  margin: 0 auto 1.25rem;
  width: 3.5rem;
}

.permissionIcon svg {
  height: 1.8rem;
  width: 1.8rem;
}

.permissionEyebrow {
  color: var(--accent-warm);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin: 0 0 0.5rem;
  text-transform: uppercase;
}

.permissionCard h1 {
  color: var(--accent-strong);
  font-family: var(--font-display, var(--font-serif));
  font-size: clamp(1.8rem, 5vw, 2.35rem);
  letter-spacing: -0.025em;
  margin: 0;
}

.permissionDescription {
  color: var(--muted);
  line-height: 1.65;
  margin: 0.75rem auto 0;
  max-width: 29rem;
}

.permissionError {
  background: color-mix(in srgb, var(--danger) 9%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border));
  border-radius: var(--radius-control);
  color: var(--danger);
  font-size: 0.9rem;
  margin: 1.25rem 0 0;
  padding: 0.75rem 1rem;
  text-align: left;
}

.permissionActions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  margin-top: 1.5rem;
}

.permissionActions .button {
  min-height: 2.8rem;
}

.permissionNote {
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.5;
  margin: 1.25rem auto 0;
  max-width: 27rem;
}

.app {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  height: calc(100vh - var(--window-titlebar-height, 0px));
  max-width: 100vw;
  overflow: hidden;
  width: 100vw;
}

.app.toolbarHidden {
  grid-template-rows: auto minmax(0, 1fr) auto;
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
    height: calc(100dvh - var(--window-titlebar-height, 0px));
  }
}

@media (max-width: 36rem) {
  .permissionPage {
    padding: 1rem;
  }

  .permissionActions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>

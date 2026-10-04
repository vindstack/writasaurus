import { html, webComponent } from "../../../framework/web-components/index.ts";
import {
  applyFontPreference,
  applyThemePreference,
  getFontPreference,
  getThemePreference,
} from "../../../../lib/settings.ts";
import { blankManuscript } from "../../../../lib/editor/data.ts";
import { loadFile } from "./actions.ts";
import { executeEditorCommand } from "./editor-commands.ts";
import { editorEvents, toggleWritingAssistancePanel } from "./editor-events.ts";
import { type EditorSidebar, editorSidebar } from "./editor-sidebar.ts";
import { editorStatusbar } from "./editor-statusbar.ts";
import { type EditorTopbar, editorTopbar } from "./editor-topbar.ts";
import { type EditorWritingArea, editorWritingArea } from "./editor-writing-area.ts";
import { hasWritePermission, openFile, saveEpubToDisk, saveToDisk } from "./fileio.ts";
import { editorStore, markChanged, state, syncChapter } from "./state.ts";
import { editorHistory } from "./history.ts";
import { isEpubFilename } from "../../../../lib/epub.ts";
import {
  restoreHandle,
  restoreLocal,
  saveLocal,
  shouldSkipWelcome,
  storeHandle,
} from "../../../../lib/editor/storage.ts";

import "./editor-canvas.ts";
import "./editor-toolbar.ts";

type EditorAction = "new" | "open" | "save" | "saveAsEpub" | "fullscreen" | "quit";
const cleanups = new WeakMap<HTMLElement, () => void>();
const AUTOSAVE_DEBOUNCE_MS = 1_000;

function ui(root: HTMLElement): {
  sidebar: EditorSidebar;
  topbar: EditorTopbar;
  writingArea: EditorWritingArea;
} {
  const sidebar = root.querySelector<EditorSidebar>("editor-sidebar");
  const topbar = root.querySelector<EditorTopbar>("editor-topbar");
  const writingArea = root.querySelector<EditorWritingArea>("editor-writing-area");
  if (!sidebar || !topbar || !writingArea) throw new Error("Editor UI did not render.");
  return { sidebar, topbar, writingArea };
}

async function autoSave(app: HTMLElement): Promise<void> {
  if (!state.isDesktop || !state.desktopFileLoaded || !state.hasUnsavedChanges) return;
  await save(app);
}

async function save(app: HTMLElement): Promise<void> {
  if (!state.hasUnsavedChanges) return;
  const editor = ui(app).writingArea.editor;
  if (!editor) return;
  syncChapter(editor);
  await saveToDisk();
  editorHistory.saveCurrentState();
}

async function saveAsEpub(app: HTMLElement): Promise<void> {
  const editor = ui(app).writingArea.editor;
  if (editor) syncChapter(editor);
  await saveEpubToDisk();
  editorHistory.saveCurrentState();
}

async function startNewManuscript(): Promise<void> {
  editorStore.set({
    manuscript: blankManuscript(),
    activeChapter: 0,
    fileHandle: null,
    canWrite: false,
    desktopFileLoaded: false,
    hasUnsavedChanges: true,
    saveMessage: "",
  });
  await storeHandle(null);
  editorHistory.clear();

  if (!state.isDesktop) return;
  try {
    const response = await fetch("/api/editor/close", {
      method: "POST",
      headers: { origin: location.origin },
    });
    if (!response.ok) throw new Error(`Could not close active manuscript: ${response.status}`);
  } catch (error) {
    console.warn("Could not clear the previously active desktop manuscript.", error);
  }
}

async function openManuscript(app: HTMLElement): Promise<void> {
  const input = app.querySelector<HTMLInputElement>("#editor-file-input");
  if (!input) throw new Error("Editor file input did not render.");
  await openFile(input, async (file, handle, writable) => {
    // The desktop open route has already loaded its returned manuscript into the editor state.
    if (!state.isDesktop) await loadFile(file, handle, writable);
    editorHistory.clear();
  });
}

async function quit(app: HTMLElement): Promise<void> {
  if (
    state.hasUnsavedChanges &&
    confirm("You have unsaved changes. Do you want to save before closing?")
  ) {
    await save(app);
  }
  if (state.hasUnsavedChanges) return;
  if (state.isDesktop) {
    try {
      await fetch("/api/editor/exit", { method: "POST", headers: { origin: location.origin } });
    } catch {
      // The native app may already be closing.
    }
  } else {
    globalThis.close();
  }
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    console.error("Could not toggle fullscreen mode.", error);
  }
}

async function restoreFileHandle(): Promise<boolean> {
  const fileHandle = await restoreHandle();
  if (!fileHandle) return false;
  if (!isEpubFilename(fileHandle.name)) {
    await storeHandle(null);
    return false;
  }

  try {
    const file = await fileHandle.getFile();
    if (!isEpubFilename(file.name)) {
      await storeHandle(null);
      return false;
    }
    await loadFile(file, fileHandle, await hasWritePermission(fileHandle, false));
    editorHistory.clear();
    return true;
  } catch {
    editorStore.set({ fileHandle: null, canWrite: false });
    await storeHandle(null);
    return false;
  }
}

/** Loads the desktop file the native shell already has open, if there is one. */
async function restoreDesktopFile(): Promise<boolean> {
  try {
    const response = await fetch("/api/editor/status");
    if (!response.ok) return false;
    const status = await response.json();
    editorStore.set({ isDesktop: status.isDesktop === true });
    if (
      !state.isDesktop || typeof status.activeFile !== "string" ||
      !status.manuscript
    ) {
      return false;
    }
    editorStore.set({
      manuscript: status.manuscript,
      activeChapter: 0,
      fileHandle: null,
      canWrite: false,
      hasUnsavedChanges: false,
      desktopFileLoaded: true,
    });
    editorHistory.clear();
    return true;
  } catch {
    editorStore.set({ isDesktop: false });
    return false;
  }
}

function restoreSession(): boolean {
  const saved = restoreLocal();
  if (!saved || !isEpubFilename(saved.manuscript.filename)) return false;
  editorStore.set({
    manuscript: saved.manuscript,
    activeChapter: saved.activeChapter,
    hasUnsavedChanges: Boolean(saved.hasUnsavedChanges),
  });
  editorHistory.clear();
  return true;
}

async function initialize(app: HTMLElement): Promise<void> {
  const desktopOpened = await restoreDesktopFile();
  const handleOpened = desktopOpened ? false : await restoreFileHandle();
  const opened = desktopOpened || handleOpened || restoreSession();

  applyFontPreference(getFontPreference());
  applyThemePreference(getThemePreference());
  if (!opened && !shouldSkipWelcome()) {
    location.replace("/welcome");
    return;
  }
  ui(app).sidebar.collapse();
}

webComponent("editor-app")
  .defineShadow(false)
  .defineRender(() =>
    html`
      ${editorTopbar()}
      <main class="editor-main">
        <div class="editor-workspace">
          ${editorSidebar({ class: "editor-sidebar collapsed" })}
          <div class="editor-viewport">
            ${editorWritingArea()}
          </div>
        </div>
      </main>
      ${editorStatusbar()}
      <input id="editor-file-input" type="file" accept=".epub,application/epub+zip" hidden>
    `
  )
  .connectedCallback((app) => {
    const onAction = (event: Event) => {
      const { action } = (event as CustomEvent<{ action: EditorAction }>).detail;
      ui(app).topbar.closeMenu();
      if (action === "new") void startNewManuscript();
      else if (action === "open") void openManuscript(app);
      else if (action === "save") void save(app);
      else if (action === "saveAsEpub") void saveAsEpub(app);
      else if (action === "fullscreen") void toggleFullscreen();
      else void quit(app);
    };
    const onFileInputChange = (event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      if (file) void loadFile(file);
      input.value = "";
    };
    const onDocumentClick = (event: MouseEvent) => {
      const { topbar } = ui(app);
      if (!topbar.contains(event.target as Node | null)) topbar.closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "z") {
        if (event.shiftKey) {
          event.preventDefault();
          editorEvents.emit("redo", undefined);
        } else {
          event.preventDefault();
          editorEvents.emit("undo", undefined);
        }
      } else if (modifier && key === "y") {
        event.preventDefault();
        editorEvents.emit("redo", undefined);
      } else if (modifier && key === "b") {
        event.preventDefault();
        ui(app).sidebar.toggle();
      } else if (modifier && key === "g") {
        event.preventDefault();
        editorEvents.emit("toggleStats", undefined);
      } else if (modifier && key === "n" && state.isDesktop) {
        event.preventDefault();
        toggleWritingAssistancePanel();
      } else if (modifier && key === "s") {
        event.preventDefault();
        void save(app);
      } else if (modifier && event.key === ",") {
        event.preventDefault();
        location.href = "/settings";
      } else if (modifier && event.shiftKey && key === "e") {
        event.preventDefault();
        ui(app).writingArea.focusEditor();
      } else if (event.key === "F11" && state.isDesktop) {
        event.preventDefault();
        ui(app).topbar.closeMenu();
        void toggleFullscreen();
      } else if (event.key === "Escape") {
        ui(app).topbar.closeMenu();
      } else if (modifier && key === "m") {
        event.preventDefault();
        ui(app).topbar.toggleMenu(true);
      }
    };
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files[0];
      if (file && isEpubFilename(file.name)) void loadFile(file);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!state.hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const unsubscribeCommand = editorEvents.on("command", ({ command, target, value }) => {
      const editor = app.querySelector<HTMLElement>(target);
      if (!editor) return;
      executeEditorCommand(command, value);
      editor.focus();
      markChanged(editor);
    });
    const unsubscribeSidebar = editorEvents.on("toggleSidebar", () => ui(app).sidebar.toggle());
    // Cache the manuscript so a same-tab reload (e.g. dev watch mode) resumes where it left off.
    let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribeSession = editorStore.subscribe(() => {
      saveLocal(state.manuscript, state.activeChapter, state.hasUnsavedChanges);
      if (state.isDesktop && state.desktopFileLoaded && state.hasUnsavedChanges) {
        if (autosaveTimer) clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => {
          void autoSave(app);
        }, AUTOSAVE_DEBOUNCE_MS);
      } else if (autosaveTimer && !state.hasUnsavedChanges) {
        clearTimeout(autosaveTimer);
        autosaveTimer = undefined;
      }
    });

    app.addEventListener("editoraction", onAction);
    app.querySelector<HTMLInputElement>("#editor-file-input")?.addEventListener(
      "change",
      onFileInputChange,
    );
    document.addEventListener("click", onDocumentClick);
    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("dragover", onDragOver);
    globalThis.addEventListener("drop", onDrop);
    globalThis.addEventListener("beforeunload", onBeforeUnload);
    cleanups.set(app, () => {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      unsubscribeCommand();
      unsubscribeSidebar();
      unsubscribeSession();
      app.removeEventListener("editoraction", onAction);
      app.querySelector<HTMLInputElement>("#editor-file-input")?.removeEventListener(
        "change",
        onFileInputChange,
      );
      document.removeEventListener("click", onDocumentClick);
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("dragover", onDragOver);
      globalThis.removeEventListener("drop", onDrop);
      globalThis.removeEventListener("beforeunload", onBeforeUnload);
    });
    void initialize(app);
  })
  .disconnectedCallback((app) => {
    cleanups.get(app)?.();
    cleanups.delete(app);
  })
  .create();

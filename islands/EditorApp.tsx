import { useEffect, useRef, useState } from "preact/hooks";
import { effect } from "@preact/signals";
import { isEpubFilename } from "../lib/epub.ts";
import { saveLocal } from "../lib/editor/storage.ts";
import { loadFile, openManuscript } from "../lib/editor/file-io.ts";
import { restoreEditor, startNewManuscript } from "../lib/editor/session.ts";
import { focusEditor, redo, undo } from "../lib/editor/surface.ts";
import { save, toggleFullscreen } from "../lib/editor/commands.ts";
import { toggleAssistance } from "../lib/editor/assistance-state.ts";
import {
  activeChapterIndex,
  desktopFileLoaded,
  hasUnsavedChanges,
  isDesktop,
  manuscript,
  menuOpen,
  sidebarOpen,
  statsIndex,
} from "../lib/editor/state.ts";
import { Topbar } from "../components/editor/Topbar.tsx";
import { Sidebar } from "../components/editor/Sidebar.tsx";
import { WritingArea } from "../components/editor/WritingArea.tsx";
import { AssistancePanel } from "../components/editor/AssistancePanel.tsx";
import { StatusBar } from "../components/editor/StatusBar.tsx";
import styles from "./EditorApp.module.css";

const AUTOSAVE_DEBOUNCE_MS = 1_000;

interface EditorAppProps {
  isDesktop: boolean;
}

export default function EditorApp(props: EditorAppProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  isDesktop.value = props.isDesktop;

  useEffect(() => {
    let disposed = false;
    let stopPersistence: (() => void) | undefined;

    // Persistence is only wired after the previous session is restored, otherwise the initial
    // blank manuscript would overwrite it.
    void restoreEditor().then((opened) => {
      if (disposed) return;
      setReady(true);
      if (!opened) {
        location.replace("/welcome");
        return;
      }
      let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
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

    return () => {
      disposed = true;
      stopPersistence?.();
    };
  }, []);

  useEffect(() => {
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
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
      removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  return (
    <div class={styles.app} data-ready={String(ready)}>
      <Topbar
        onNew={() => void startNewManuscript()}
        onOpen={() => void openManuscript(fileInput.current)}
      />
      <main class={styles.main}>
        <div class={styles.workspace}>
          <Sidebar />
          <WritingArea />
          <AssistancePanel />
        </div>
      </main>
      <StatusBar />
      <input
        ref={fileInput}
        id="editor-file-input"
        type="file"
        accept=".epub,application/epub+zip"
        hidden
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (file) void loadFile(file);
          input.value = "";
        }}
      />
    </div>
  );
}

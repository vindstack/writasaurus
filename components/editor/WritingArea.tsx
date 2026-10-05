import { useEffect, useRef } from "preact/hooks";
import { getWritingAssistancePreference } from "../../lib/settings.ts";
import {
  executeEditorCommand,
  mountContent,
  registerSurface,
  scheduleHistoryCapture,
} from "../../lib/editor/surface.ts";
import {
  activeChapter,
  isDesktop,
  markChanged,
  renameChapter,
  titleFocusRequest,
} from "../../lib/editor/state.ts";
// @ts-types="../../vite-env.d.ts"
import styles from "./WritingArea.module.css";

export function WritingArea() {
  const editor = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const chapter = activeChapter.value;
  const chapterId = chapter?.id;
  const chapterTitle = chapter?.title ?? "";
  const focusRequest = titleFocusRequest.value;

  useEffect(() => {
    if (!editor.current || !title.current) return;
    registerSurface({ editor: editor.current, title: title.current });
    return () => registerSurface(null);
  }, []);

  // Content is loaded imperatively, only when the chapter changes, so typing never moves the caret.
  useEffect(() => {
    const current = activeChapter.peek();
    if (!current) return;
    mountContent(current.content);
    if (title.current) title.current.value = current.title;
  }, [chapterId]);

  // Title edits made elsewhere (undo, rename) are reflected unless the writer is typing in it.
  useEffect(() => {
    if (title.current && document.activeElement !== title.current) {
      title.current.value = chapterTitle;
    }
  }, [chapterTitle]);

  useEffect(() => {
    if (focusRequest > 0) title.current?.select();
  }, [focusRequest]);

  const assistanceEnabled = isDesktop.value && getWritingAssistancePreference();

  return (
    <div class={styles.viewport} data-editor-viewport>
      <section class={styles.area}>
        <input
          ref={title}
          id="chapter-title"
          class={styles.title}
          aria-label="Chapter title"
          onInput={(event) => {
            renameChapter(event.currentTarget.value);
            scheduleHistoryCapture();
          }}
        />
        <div
          ref={editor}
          id="editor"
          class={styles.canvas}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Chapter text"
          spellcheck={!assistanceEnabled}
          onInput={(event) => {
            scheduleHistoryCapture();
            markChanged(event.currentTarget);
          }}
          onPaste={(event) => {
            event.preventDefault();
            executeEditorCommand("insertText", event.clipboardData?.getData("text/plain") ?? "");
          }}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            event.preventDefault();
            executeEditorCommand("insertText", "\t");
            event.currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
          }}
        />
      </section>
    </div>
  );
}

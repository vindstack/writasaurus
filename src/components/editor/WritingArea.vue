<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
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
import { useSignalValue } from "../vue-signals.ts";
import styles from "./WritingArea.module.css";

const chapterState = useSignalValue(activeChapter);
const desktopState = useSignalValue(isDesktop);
const focusRequest = useSignalValue(titleFocusRequest);
const editor = ref<HTMLDivElement | null>(null);
const title = ref<HTMLInputElement | null>(null);
let stopChapterWatch: (() => void) | undefined;
let stopTitleWatch: (() => void) | undefined;
let stopFocusWatch: (() => void) | undefined;

onMounted(() => {
  if (editor.value && title.value) {
    registerSurface({ editor: editor.value, title: title.value });
  }
  stopChapterWatch = watch(
    () => chapterState.value?.id,
    () => {
      const current = activeChapter.peek();
      if (!current) return;
      mountContent(current.content);
      if (title.value) title.value.value = current.title;
    },
    { immediate: true },
  );
  stopTitleWatch = watch(
    () => chapterState.value?.title ?? "",
    (chapterTitle) => {
      if (title.value && document.activeElement !== title.value) {
        title.value.value = chapterTitle;
      }
    },
  );
  stopFocusWatch = watch(
    () => focusRequest.value,
    (request) => {
      if (request > 0) title.value?.select();
    },
  );
});

onBeforeUnmount(() => {
  stopChapterWatch?.();
  stopTitleWatch?.();
  stopFocusWatch?.();
  registerSurface(null);
});

const assistanceEnabled = () => desktopState.value && getWritingAssistancePreference();
</script>

<template>
  <div :class="styles.viewport" data-editor-viewport>
    <section :class="styles.area">
      <input
        ref="title"
        id="chapter-title"
        :class="styles.title"
        aria-label="Chapter title"
        @input="renameChapter(($event.currentTarget as HTMLInputElement).value); scheduleHistoryCapture()"
      />
      <div
        ref="editor"
        id="editor"
        :class="styles.canvas"
        contenteditable
        role="textbox"
        aria-multiline="true"
        aria-label="Chapter text"
        :spellcheck="!assistanceEnabled()"
        @input="scheduleHistoryCapture(); markChanged($event.currentTarget as HTMLElement)"
        @paste="(event) => {
          event.preventDefault();
          executeEditorCommand('insertText', event.clipboardData?.getData('text/plain') ?? '');
        }"
        @keydown="(event) => {
          if (event.key !== 'Tab') return;
          event.preventDefault();
          executeEditorCommand('insertText', '\t');
          event.currentTarget.dispatchEvent(new Event('input', { bubbles: true }));
        }"
      />
    </section>
  </div>
</template>

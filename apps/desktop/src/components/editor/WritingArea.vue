<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getWritingAssistancePreference } from "../../../../../packages/shared/settings.ts";
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
  <div class="viewport" data-editor-viewport>
    <section class="area">
      <input
        ref="title"
        id="chapter-title"
        class="title"
        aria-label="Chapter title"
        @input="renameChapter(($event.currentTarget as HTMLInputElement).value); scheduleHistoryCapture()"
      />
      <div
        ref="editor"
        id="editor"
        class="canvas"
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

<style scoped>
.viewport {
  box-sizing: border-box;
  display: block;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  width: 100%;
}

.area {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0 auto;
  max-width: 36rem;
  min-height: 100%;
  min-width: 0;
  padding: 1rem 1.5rem;
  width: 100%;
}

.title {
  background: transparent;
  border: 0;
  box-sizing: border-box;
  color: var(--text);
  font-family: var(
    --editor-font,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    Helvetica,
    Arial,
    sans-serif
  );
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  margin: 0;
  min-width: 0;
  outline: 0;
  padding: 0.25rem 0;
  width: 100%;
}

.canvas {
  box-sizing: border-box;
  display: block;
  flex: 1 1 auto;
  font-family: var(
    --editor-font,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    Helvetica,
    Arial,
    sans-serif
  );
  font-size: 1rem;
  line-height: 1.75;
  min-height: 0;
  min-width: 0;
  outline: 0;
  overflow: visible;
  overflow-wrap: break-word;
  padding: 0.5rem 0 4rem;
  tab-size: 4;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 55rem) {
  .area {
    max-width: 100%;
    padding: 1rem;
  }
}

@media (max-width: 36rem) {
  .area {
    padding: 0.65rem 0.75rem;
  }

  .title {
    font-size: 1.125rem;
    line-height: 1.25rem;
  }

  .canvas {
    line-height: 1.6;
    padding-top: 0.5rem;
  }
}
</style>

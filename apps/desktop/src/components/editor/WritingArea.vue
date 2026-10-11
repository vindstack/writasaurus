<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  executeEditorCommand,
  mountContent,
  registerSurface,
  scheduleHistoryCapture,
} from "../../lib/editor/surface.ts";
import {
  activeChapterIndex,
  activeChapter,
  advanceChapter,
  markChanged,
  markOutlineChanged,
  manuscript,
  outlineContent,
  renameChapter,
  titleFocusRequest,
} from "../../lib/editor/state.ts";
import { useSignalValue } from "../vue-signals.ts";
import { markdownToHtml } from "../../lib/utilties/markdown-utilities.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";

const props = defineProps<{ mode: "manuscript" | "outline" }>();
const chapterState = useSignalValue(activeChapter);
const activeIndexState = useSignalValue(activeChapterIndex);
const manuscriptState = useSignalValue(manuscript);
const focusRequest = useSignalValue(titleFocusRequest);
const editor = ref<HTMLDivElement | null>(null);
const title = ref<HTMLInputElement | null>(null);
const nextChapter = computed(() => manuscriptState.value.chapters[activeIndexState.value + 1]);
let stopChapterWatch: (() => void) | undefined;
let stopTitleWatch: (() => void) | undefined;
let stopFocusWatch: (() => void) | undefined;

onMounted(() => {
  if (editor.value) {
    registerSurface({ editor: editor.value, title: title.value ?? undefined });
  }
  stopChapterWatch = watch(
    [() => props.mode, () => chapterState.value?.id],
    ([mode]) => {
      if (editor.value) {
        registerSurface({ editor: editor.value, title: title.value ?? undefined });
      }
      if (mode === "outline") {
        mountContent(markdownToHtml(outlineContent.peek()));
        return;
      }
      const current = activeChapter.peek();
      if (!current) return;
      mountContent(current.content);
      if (title.value) title.value.value = current.title;
    },
    { immediate: true, flush: "post" },
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

</script>

<template>
  <div class="viewport" data-editor-viewport :data-mode="props.mode">
    <section class="area">
      <input
        v-if="props.mode === 'manuscript'"
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
        :aria-label="props.mode === 'outline' ? 'Outline text' : 'Chapter text'"
        spellcheck="false"
        @input="scheduleHistoryCapture(); props.mode === 'outline'
          ? markOutlineChanged($event.currentTarget as HTMLElement)
          : markChanged($event.currentTarget as HTMLElement)"
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
    <div v-if="props.mode === 'manuscript'" class="chapterNavigation">
      <Button
        variant="quiet-outline"
        size="small"
        aria-keyshortcuts="Control+Shift+N Meta+Shift+N"
        data-next-chapter
        title="Next or create chapter (Ctrl+Shift+N)"
        @click="advanceChapter"
      >
        {{ nextChapter ? `Go to ${nextChapter.title}` : "Create Next Chapter" }}
        <kbd class="chapterShortcut" aria-hidden="true">Ctrl+Shift+N</kbd>
      </Button>
    </div>
  </div>
</template>

<style scoped>
.viewport {
  box-sizing: border-box;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
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
  flex: 1 0 auto;
  gap: 0.25rem;
  margin: 0 auto;
  max-width: 36rem;
  min-height: 0;
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

.chapterNavigation {
  box-sizing: border-box;
  display: flex;
  justify-content: flex-end;
  padding: 0.75rem 1rem 1rem;
  width: 100%;
}

.chapterShortcut {
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: 0.25rem;
  color: var(--muted);
  font: inherit;
  font-size: 0.65rem;
  line-height: 1.2;
  padding: 0.05rem 0.3rem;
  white-space: nowrap;
}

.viewport[data-mode="outline"] .canvas :deep(:is(h1, h2, h3)) {
  font-family: var(--editor-font);
}

.viewport[data-mode="outline"] .canvas :deep(h1) {
  border-bottom: 1px solid var(--border);
  font-size: 1.5rem;
  line-height: 1.3;
  margin: 2.75rem 0 0.8rem;
  padding-bottom: 0.45rem;
}

.viewport[data-mode="outline"] .canvas :deep(h1:first-child) {
  margin-top: 0;
}

.viewport[data-mode="outline"] .canvas :deep(h2) {
  font-size: 1.12rem;
  line-height: 1.4;
  margin: 2rem 0 0.45rem;
}

.viewport[data-mode="outline"] .canvas :deep(p) {
  line-height: 1.7;
  margin: 0 0 1rem;
}

.viewport[data-mode="outline"] .canvas :deep(blockquote) {
  background: color-mix(in srgb, var(--surface-sunken) 55%, var(--surface));
  border-left: 3px solid var(--accent);
  border-radius: 0.15rem 0.5rem 0.5rem 0.15rem;
  box-sizing: border-box;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.55;
  margin: 0 0 1.45rem;
  padding: 0.65rem 0.9rem;
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

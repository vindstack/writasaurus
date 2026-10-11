<script setup lang="ts">
import { computed } from "vue";
import { getWordsPerPagePreference } from "../../../../../packages/shared/settings.ts";
import { toggleAssistance } from "../../lib/editor/assistance-state.ts";
import {
  activeChapter,
  editorMode,
  outlineContent,
  sidebarOpen,
  totalWords,
} from "../../lib/editor/state.ts";
import { useSignalValue } from "../vue-signals.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";

const chapterState = useSignalValue(activeChapter);
const totalState = useSignalValue(totalWords);
const modeState = useSignalValue(editorMode);
const outlineState = useSignalValue(outlineContent);
const wordsPerPage = getWordsPerPagePreference();
const chapterStats = computed(() => {
  const chapter = chapterState.value;
  const words = chapter?.wordCount ?? 0;
  const pages = (words / wordsPerPage).toFixed(0);
  return {
    label: chapter?.title ?? "Chapter",
    words: words.toLocaleString(),
    pages,
  };
});
const totalStats = computed(() => {
  const words = totalState.value;
  const pages = (words / wordsPerPage).toFixed(0);
  return {
    words: words.toLocaleString(),
    pages,
  };
});
const outlineWords = computed(() =>
  outlineState.value.replace(/[>#*_`~\[\]()]/g, " ").trim().split(/\s+/).filter(Boolean).length
);
</script>

<template>
  <footer class="statusbar">
    <Button v-if="modeState === 'manuscript'" variant="quiet" size="small" class="toggle" aria-label="Toggle chapters panel"
      title="Toggle chapters panel (Ctrl+B)" @click="sidebarOpen.value = !sidebarOpen.value">
      Chapters <kbd class="kbd">Ctrl+B</kbd>
    </Button>
    <span v-if="modeState === 'manuscript'" class="wordCount" role="group" aria-label="Word and page counts">
      <span class="statGroup" data-stat="chapter">
        <span class="statLabel">{{ chapterStats.label }}:</span>
        <span class="statValue">{{ chapterStats.words }}</span>
        <span>words,</span>
        <span class="statValue">{{ chapterStats.pages }}</span>
        <span>pages</span>
      </span>
      <span class="separator" aria-hidden="true">|</span>
      <span class="statGroup" data-stat="total">
        <span class="statLabel">Total:</span>
        <span class="statValue">{{ totalStats.words }}</span>
        <span>words,</span>
        <span class="statValue">{{ totalStats.pages }}</span>
        <span>pages</span>
      </span>
    </span>
    <span v-else class="wordCount" role="group" aria-label="Outline word count">
      <span>Outline:</span>
      <span class="statValue">{{ outlineWords.toLocaleString() }}</span>
      <span>words</span>
    </span>
    <Button v-if="modeState === 'manuscript'" variant="quiet" size="small" class="toggle" aria-label="Toggle writing assistance panel"
      title="Toggle writing assistance panel (Ctrl+Shift+A)" @click="toggleAssistance()">
      Writing Assistance <kbd class="kbd">Ctrl+Shift+A</kbd>
    </Button>
  </footer>
</template>

<style scoped>
.statusbar {
  align-items: center;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-sizing: border-box;
  color: var(--muted);
  display: flex;
  font-size: 0.75rem;
  gap: 0.75rem;
  height: 2.4rem;
  justify-content: space-between;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 0.25rem 1rem;
  position: relative;
}

.toggle {
  flex-shrink: 0;
}

.wordCount {
  align-items: center;
  display: inline-flex;
  flex-shrink: 1;
  gap: 0.65rem;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.statGroup {
  align-items: baseline;
  display: inline-flex;
  flex-shrink: 1;
  gap: 0.25rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.statLabel {
  color: var(--muted);
  flex-shrink: 1;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.statValue {
  color: var(--text);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.separator {
  color: var(--border);
  flex-shrink: 0;
}

@media (max-width: 55rem) {
  .statusbar {
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
  }
}

.kbd {
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: 0.25rem;
  color: var(--muted);
  font-family: inherit;
  font-size: 0.65rem;
  padding: 0.05rem 0.3rem;
}
</style>

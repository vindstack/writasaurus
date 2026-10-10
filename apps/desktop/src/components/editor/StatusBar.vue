<script setup lang="ts">
import { computed } from "vue";
import {
  getDailyWordGoalPreference,
  getDailyWrittenWords,
  getWordsPerPagePreference,
} from "../../../../../packages/shared/settings.ts";
import { toggleAssistance } from "../../lib/editor/assistance-state.ts";
import {
  activeChapter,
  isDesktop,
  manuscript,
  sidebarOpen,
  statsIndex,
  totalWords,
} from "../../lib/editor/state.ts";
import { useSignalValue } from "../vue-signals.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";

const statNames = ["chapter", "manuscript", "daily writing goal"];
const chapterState = useSignalValue(activeChapter);
const manuscriptState = useSignalValue(manuscript);
const totalState = useSignalValue(totalWords);
const desktopState = useSignalValue(isDesktop);
const indexState = useSignalValue(statsIndex);
const wordsPerPage = getWordsPerPagePreference();
const wordStats = computed(() => {
  const chapterWords = chapterState.value?.wordCount ?? 0;
  const total = totalState.value;
  const { filename, frontmatter } = manuscriptState.value;
  const daily = typeof localStorage === "undefined"
    ? 0
    : getDailyWrittenWords(`${filename}:${frontmatter.createdAt ?? ""}`, total);
  const goal = getDailyWordGoalPreference();
  return [
    `Chapter: ${chapterWords.toLocaleString()} words · ${(chapterWords / wordsPerPage).toFixed(1)} pages`,
    `Manuscript: ${total.toLocaleString()} words · ${(total / wordsPerPage).toFixed(1)} pages`,
    `Daily Goal: ${daily.toLocaleString()} / ${goal.toLocaleString()} words`,
  ];
});
const nextIndex = computed(() => (indexState.value + 1) % wordStats.value.length);
</script>

<template>
  <footer class="statusbar">
    <Button
      variant="quiet"
      size="small"
      class="toggle"
      aria-label="Toggle chapters panel"
      title="Toggle chapters panel (Ctrl+B)"
      @click="sidebarOpen.value = !sidebarOpen.value"
    >
      Chapters <kbd class="kbd">Ctrl+B</kbd>
    </Button>
    <span class="wordCount">
      <button
        type="button"
        class="stat"
        title="Cycle statistics (Ctrl+G)"
        :aria-label="`Show ${statNames[nextIndex]} statistics`"
        @click="statsIndex.value = nextIndex"
      >
        {{ wordStats[indexState] }}
      </button>
      <kbd class="kbd" title="Cycle statistics (Ctrl+G)">Ctrl+G</kbd>
    </span>
    <Button
      v-if="desktopState"
      variant="quiet"
      size="small"
      class="toggle"
      aria-label="Toggle writing assistance panel"
      title="Toggle writing assistance panel (Ctrl+N)"
      @click="toggleAssistance()"
    >
      Writing Assistance <kbd class="kbd">Ctrl+N</kbd>
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
  justify-content: space-between;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 0.5rem 1rem;
  position: relative;
}

.toggle {
  flex-shrink: 0;
}

.wordCount {
  align-items: center;
  display: inline-flex;
  flex-shrink: 1;
  gap: 0.4rem;
  min-width: 0;
}

.stat {
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  text-align: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 55rem) {
  .statusbar {
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
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

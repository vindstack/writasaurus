<script setup lang="ts">
import { computed } from "vue";
import {
  getDailyWordGoalPreference,
  getDailyWrittenWords,
  getWordsPerPagePreference,
} from "../../lib/settings.ts";
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
import controls from "./controls.module.css";
import styles from "./StatusBar.module.css";

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
  <footer :class="styles.statusbar">
    <button
      type="button"
      :class="[controls.button, controls.small, styles.toggle]"
      aria-label="Toggle chapters panel"
      title="Toggle chapters panel (Ctrl+B)"
      @click="sidebarOpen.value = !sidebarOpen.value"
    >
      Chapters <kbd :class="controls.kbd">Ctrl+B</kbd>
    </button>
    <span :class="styles.wordCount">
      <button
        type="button"
        :class="styles.stat"
        title="Cycle statistics (Ctrl+G)"
        :aria-label="`Show ${statNames[nextIndex]} statistics`"
        @click="statsIndex.value = nextIndex"
      >
        {{ wordStats[indexState] }}
      </button>
      <kbd :class="controls.kbd" title="Cycle statistics (Ctrl+G)">Ctrl+G</kbd>
    </span>
    <button
      v-if="desktopState"
      type="button"
      :class="[controls.button, controls.small, styles.toggle]"
      aria-label="Toggle writing assistance panel"
      title="Toggle writing assistance panel (Ctrl+N)"
      @click="toggleAssistance()"
    >
      Writing Assistance <kbd :class="controls.kbd">Ctrl+N</kbd>
    </button>
  </footer>
</template>

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
// @ts-types="../../vite-env.d.ts"
import controls from "./controls.module.css";
// @ts-types="../../vite-env.d.ts"
import styles from "./StatusBar.module.css";

const STAT_NAMES = ["chapter", "manuscript", "daily writing goal"];

function WordCount() {
  const chapterWords = activeChapter.value?.wordCount ?? 0;
  const total = totalWords.value;
  const { filename, frontmatter } = manuscript.value;
  const perPage = getWordsPerPagePreference();
  const daily = getDailyWrittenWords(`${filename}:${frontmatter.createdAt ?? ""}`, total);
  const goal = getDailyWordGoalPreference();

  const stats = [
    `Chapter: ${chapterWords.toLocaleString()} words · ${
      (chapterWords / perPage).toFixed(1)
    } pages`,
    `Manuscript: ${total.toLocaleString()} words · ${(total / perPage).toFixed(1)} pages`,
    `Daily Goal: ${daily.toLocaleString()} / ${goal.toLocaleString()} words`,
  ];
  const next = (statsIndex.value + 1) % stats.length;

  return (
    <span class={styles.wordCount}>
      <button
        type="button"
        class={styles.stat}
        title="Cycle statistics (Ctrl+G)"
        aria-label={`Show ${STAT_NAMES[next]} statistics`}
        onClick={() => statsIndex.value = next}
      >
        {stats[statsIndex.value]}
      </button>
      <kbd class={controls.kbd} title="Cycle statistics (Ctrl+G)">Ctrl+G</kbd>
    </span>
  );
}

export function StatusBar() {
  return (
    <footer class={styles.statusbar}>
      <button
        type="button"
        class={`${controls.button} ${controls.small} ${styles.toggle}`}
        aria-label="Toggle chapters panel"
        title="Toggle chapters panel (Ctrl+B)"
        onClick={() => sidebarOpen.value = !sidebarOpen.value}
      >
        Chapters <kbd class={controls.kbd}>Ctrl+B</kbd>
      </button>
      <WordCount />
      {isDesktop.value && (
        <button
          type="button"
          class={`${controls.button} ${controls.small} ${styles.toggle}`}
          aria-label="Toggle writing assistance panel"
          title="Toggle writing assistance panel (Ctrl+N)"
          onClick={() => void toggleAssistance()}
        >
          Writing Assistance <kbd class={controls.kbd}>Ctrl+N</kbd>
        </button>
      )}
    </footer>
  );
}

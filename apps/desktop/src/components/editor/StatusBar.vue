<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import {
  appSettingsError,
  getWordsPerPagePreference,
} from "../../lib/app-settings-client.ts";
import {
  recordDailyWritingProgress,
  type ProjectDailyProgress,
} from "../../lib/project-daily-progress-client.ts";
import { toggleAssistance } from "../../lib/editor/assistance-state.ts";
import {
  activeChapter,
  editorMode,
  manuscript,
  outlineContent,
  sidebarOpen,
  totalWords,
} from "../../lib/editor/state.ts";
import { useSignalValue } from "../vue-signals.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";

const chapterState = useSignalValue(activeChapter);
const totalState = useSignalValue(totalWords);
const manuscriptState = useSignalValue(manuscript);
const modeState = useSignalValue(editorMode);
const outlineState = useSignalValue(outlineContent);
const wordsPerPage = computed(() => getWordsPerPagePreference());
const projectDailyProgress = ref<ProjectDailyProgress | null>(null);
const dailyProgressError = ref("");
const dailyWordGoal = computed(() => projectDailyProgress.value?.dailyWordGoal ?? 1);
const manuscriptId = computed(() => {
  const current = manuscriptState.value;
  return String(current.frontmatter.writasaurusId ?? "").trim() || current.filename;
});
const dailyWords = computed(() => {
  const startingWords = projectDailyProgress.value?.progress.startingWords[manuscriptId.value];
  return startingWords === undefined ? 0 : Math.max(totalState.value - startingWords, 0);
});
const dailyProgress = computed(() => Math.min(dailyWords.value, dailyWordGoal.value));
const celebration = ref(false);
let celebrationTimer: ReturnType<typeof setTimeout> | undefined;
let dailyProgressTimer: ReturnType<typeof setTimeout> | undefined;
let lastTrackedManuscriptId = "";

async function saveDailyProgress(): Promise<void> {
  const id = manuscriptId.value;
  const total = totalState.value;
  try {
    const result = await recordDailyWritingProgress(id, total);
    if (id !== manuscriptId.value) return;
    projectDailyProgress.value = result;
    dailyProgressError.value = "";
  } catch (error) {
    dailyProgressError.value = error instanceof Error
      ? error.message
      : "Could not update daily writing progress.";
    console.error("Could not update daily writing progress.", error);
  }
}

watch([manuscriptId, () => totalState.value], ([id]) => {
  const manuscriptChanged = lastTrackedManuscriptId !== id;
  if (manuscriptChanged) {
    projectDailyProgress.value = null;
    lastTrackedManuscriptId = id;
    clearTimeout(dailyProgressTimer);
    void saveDailyProgress();
    return;
  }
  clearTimeout(dailyProgressTimer);
  dailyProgressTimer = setTimeout(() => void saveDailyProgress(), 500);
}, { immediate: true });

watch(dailyWords, (words, previousWords) => {
  if (previousWords < dailyWordGoal.value && words >= dailyWordGoal.value) {
    celebration.value = true;
    clearTimeout(celebrationTimer);
    celebrationTimer = setTimeout(() => {
      celebration.value = false;
    }, 3000);
  }
});

onUnmounted(() => {
  clearTimeout(celebrationTimer);
  clearTimeout(dailyProgressTimer);
  void saveDailyProgress();
});

const chapterStats = computed(() => {
  const chapter = chapterState.value;
  const words = chapter?.wordCount ?? 0;
  const pages = (words / wordsPerPage.value).toFixed(0);
  return {
    label: chapter?.title ?? "Chapter",
    words: words.toLocaleString(),
    pages,
  };
});
const totalStats = computed(() => {
  const words = totalState.value;
  const pages = (words / wordsPerPage.value).toFixed(0);
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
  <div class="footerStack">
    <div v-if="modeState === 'manuscript' && projectDailyProgress" class="progressTrack">
      <progress
        class="dailyProgress"
        :value="dailyProgress"
        :max="dailyWordGoal"
        aria-label="Daily writing goal"
        :aria-valuetext="`${dailyWords.toLocaleString()} of ${dailyWordGoal.toLocaleString()} words`"
        :title="`${dailyWords.toLocaleString()} of ${dailyWordGoal.toLocaleString()} words today`"
      >
        {{ dailyProgress / dailyWordGoal * 100 }}%
      </progress>
      <span v-if="celebration" class="fireworks" aria-hidden="true">
        <i v-for="spark in 9" :key="spark" class="spark" />
      </span>
      <span v-if="celebration" class="goalNotice">Daily goal reached!</span>
      <span class="screenReaderOnly" aria-live="polite">
        {{ celebration ? "Daily writing goal reached!" : "" }}
      </span>
    </div>
    <p v-if="dailyProgressError || appSettingsError" class="settingsError" role="alert">
      {{ dailyProgressError || appSettingsError }}
    </p>
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
  </div>
</template>

<style scoped>
.footerStack {
  min-width: 0;
}

.settingsError {
  color: var(--danger);
  font-size: 0.75rem;
  margin: 0.25rem 0;
  padding-inline: 1rem;
}

.progressTrack {
  background: var(--border);
  height: 0.2rem;
  overflow: visible;
  position: relative;
  width: 100%;
}

.dailyProgress {
  appearance: none;
  background: transparent;
  border: 0;
  display: block;
  height: 100%;
  margin: 0;
  width: 100%;
}

.dailyProgress::-webkit-progress-bar {
  background: transparent;
}

.dailyProgress::-webkit-progress-value {
  background: var(--success);
  transition: width 250ms ease;
}

.dailyProgress::-moz-progress-bar {
  background: var(--success);
  transition: width 250ms ease;
}

.fireworks {
  height: 1px;
  position: absolute;
  right: 0;
  top: 50%;
  width: 1px;
}

.spark {
  animation: firework 1800ms ease-out both;
  background: var(--spark-color, #f2c14e);
  box-shadow: 0 0 0.35rem var(--spark-color, #f2c14e);
  border-radius: 50%;
  height: 0.4rem;
  left: 0;
  position: absolute;
  top: 0;
  width: 0.4rem;
}

.spark:nth-child(2) {
  --spark-color: #ff6b6b;
  --spark-x: 1.4rem;
  --spark-y: -1rem;
}

.spark:nth-child(3) {
  --spark-color: #74c0fc;
  --spark-x: 1.2rem;
  --spark-y: 1rem;
}

.spark:nth-child(4) {
  --spark-color: #ffd43b;
  --spark-x: -1.2rem;
  --spark-y: -1.3rem;
}

.spark:nth-child(5) {
  --spark-color: #b197fc;
  --spark-x: -1.4rem;
  --spark-y: 0.9rem;
}

.spark:nth-child(6) {
  --spark-color: #69db7c;
  --spark-x: 0.2rem;
  --spark-y: -1.5rem;
}

.spark:nth-child(7) {
  --spark-color: #ffa94d;
  --spark-x: 0.5rem;
  --spark-y: 1.4rem;
}

.spark:nth-child(8) {
  --spark-color: #f783ac;
  --spark-x: -0.3rem;
  --spark-y: 1.5rem;
}

.spark:nth-child(9) {
  --spark-color: #66d9e8;
  --spark-x: -1.5rem;
  --spark-y: -0.5rem;
}

@keyframes firework {
  from {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  to {
    opacity: 0;
    transform: translate(
        calc(-50% + var(--spark-x, -1rem)),
        calc(-50% + var(--spark-y, -1rem))
      )
      scale(0.2);
  }
}

.goalNotice {
  animation: goal-notice 3s ease-out both;
  background: var(--success);
  border-radius: 0.25rem;
  bottom: calc(100% + 0.45rem);
  color: white;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  position: absolute;
  right: 0.75rem;
  white-space: nowrap;
}

@keyframes goal-notice {
  0% {
    opacity: 0;
    transform: translateY(0.25rem);
  }
  10%,
  80% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-0.25rem);
  }
}

.screenReaderOnly {
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

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

@media (prefers-reduced-motion: reduce) {
  .dailyProgress::-webkit-progress-value,
  .dailyProgress::-moz-progress-bar {
    transition: none;
  }

  .spark {
    animation: none;
    display: none;
  }

  .goalNotice {
    animation: none;
  }
}
</style>

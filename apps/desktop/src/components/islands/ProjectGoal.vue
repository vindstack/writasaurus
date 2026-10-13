<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import Progress from "../../../../../packages/shared/ui/components/Progress.vue";
import type { ActiveProjectDetails } from "../../lib/editor-session.ts";

const loading = ref(true);
const hasProject = ref(false);
const error = ref("");
const project = ref<ActiveProjectDetails | null>(null);
const goal = computed(() => project.value?.settings.user_settings.manuscriptWordGoal ?? 0);
const words = computed(() => project.value?.manuscript.totalWords ?? 0);
const percent = computed(() => goal.value ? Math.min(words.value / goal.value * 100, 100) : 0);
const remaining = computed(() => Math.max(goal.value - words.value, 0));

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

const historyDays = computed(() => {
  const activeProject = project.value;
  if (!activeProject) return [];

  const userSettings = activeProject.settings.user_settings;
  const history = new Map(
    userSettings.dailyWritingHistory.map((entry) => [entry.date, entry]),
  );
  const today = dateKey(new Date());
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (userSettings.dailyWritingProgress.date === today) {
    const startingWords =
      userSettings.dailyWritingProgress.startingWords[activeProject.manuscript.id];
    if (startingWords !== undefined) {
      const currentWords = Math.max(activeProject.manuscript.totalWords - startingWords, 0);
      const saved = history.get(today);
      history.set(today, {
        date: today,
        words: Math.max(saved?.words ?? 0, currentWords),
        goal: userSettings.dailyWordGoal,
      });
    }
  }

  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(todayStart);
    date.setDate(date.getDate() - (29 - index));
    const key = dateKey(date);
    const entry = history.get(key);
    const known = key >= userSettings.dailyWritingTrackingStarted;
    const dayWords = entry?.words ?? 0;
    const dayGoal = key === today ? userSettings.dailyWordGoal : entry?.goal ?? userSettings.dailyWordGoal;
    const activity = !known ? "unknown" : dayWords >= dayGoal ? "goal" : dayWords > 0 ? "writing" : "none";
    return {
      date: key,
      day: date.toLocaleDateString(undefined, { day: "numeric" }),
      words: dayWords,
      goal: dayGoal,
      known,
      activity,
      description: !known
        ? `${date.toLocaleDateString()}: tracking not started`
        : `${date.toLocaleDateString()}: ${dayWords.toLocaleString()} words${
          dayWords >= dayGoal ? ", daily goal completed" : ""
        }`,
    };
  });
});

function streakLength(completed: (day: (typeof historyDays.value)[number]) => boolean): number {
  const days = historyDays.value;
  if (!days.length) return 0;
  let index = days.length - 1;
  if (!completed(days[index])) index -= 1;

  let count = 0;
  for (; index >= 0 && days[index].known && completed(days[index]); index -= 1) count += 1;
  return count;
}

const writingStreak = computed(() =>
  streakLength((day) => day.words > 0)
);
const goalStreak = computed(() =>
  streakLength((day) => day.words >= day.goal)
);
const todayWords = computed(() => historyDays.value.at(-1)?.words ?? 0);
const estimate = computed(() => {
  const trackedDays = historyDays.value.filter((day) => day.known);
  const totalWritten = trackedDays.reduce((total, day) => total + day.words, 0);
  if (!trackedDays.length || !totalWritten || !remaining.value) return null;

  const average = totalWritten / trackedDays.length;
  const daysRemaining = Math.ceil(remaining.value / average);
  const completionDate = new Date();
  completionDate.setHours(0, 0, 0, 0);
  completionDate.setDate(completionDate.getDate() + daysRemaining);
  return {
    average: Math.round(average).toLocaleString(),
    date: completionDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    trackedDays: trackedDays.length,
  };
});

onMounted(async () => {
  try {
    const response = await fetch("/api/editor/project-settings");
    if (response.status === 409) return;
    if (!response.ok) throw new Error(await response.text());
    project.value = await response.json();
    hasProject.value = true;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "Could not load manuscript progress.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div v-if="loading" class="message" role="status">Loading manuscript progress…</div>
  <div v-else-if="!hasProject" class="message" data-project-required>
    <p>Open a project to view its manuscript word-goal progress.</p>
  </div>
  <div v-else-if="project" class="goal">
    <p class="title">{{ project.manuscript.title }}</p>
    <p class="counts">
      <strong>{{ words.toLocaleString() }}</strong>
      <span>of</span>
      <strong>{{ goal.toLocaleString() }}</strong>
      <span>words</span>
      <Button href="/project-settings" size="small" title="Edit project goal">Edit</Button>
    </p>
    <Progress label="Manuscript word goal" :value="words" :max="goal" />
    <p class="remaining" aria-live="polite">
      {{
        remaining
          ? `${remaining.toLocaleString()} words to go (${percent.toFixed(1)}% complete).`
          : "Manuscript word goal reached!"
      }}
    </p>
    <section class="report" aria-labelledby="writing-history-title">
      <h3 id="writing-history-title">Last 30 days</h3>
      <p class="dailySummary">
        Today: <strong>{{ todayWords.toLocaleString() }}</strong> of
        <strong>{{ project.settings.user_settings.dailyWordGoal.toLocaleString() }}</strong> daily
        words
      </p>
      <dl class="streaks">
        <div>
          <dt>Writing streak</dt>
          <dd>{{ writingStreak }} {{ writingStreak === 1 ? "day" : "days" }}</dd>
        </div>
        <div>
          <dt>Daily goal streak</dt>
          <dd>{{ goalStreak }} {{ goalStreak === 1 ? "day" : "days" }}</dd>
        </div>
      </dl>
      <ol class="history" aria-label="Daily writing history for the last 30 days">
        <li
          v-for="day in historyDays"
          :key="day.date"
          :data-activity="day.activity"
          :aria-label="day.description"
          :title="day.description"
        >
          <time :datetime="day.date">{{ day.day }}</time>
        </li>
      </ol>
      <p v-if="estimate" class="estimate">
        At your average of {{ estimate.average }} words per day over {{ estimate.trackedDays }}
        tracked {{ estimate.trackedDays === 1 ? "day" : "days" }}, the draft may be complete by
        <strong>{{ estimate.date }}</strong>.
      </p>
      <p v-else-if="remaining" class="estimate">
        A completion estimate will appear once you have writing history.
      </p>
      <p v-else class="estimate">Your manuscript word goal is complete.</p>
    </section>
  </div>
  <p v-if="error" class="error" role="alert">{{ error }}</p>
</template>

<style scoped>
.goal,
.message {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.title,
.remaining {
  color: var(--muted);
  line-height: 1.6;
  margin: 0;
}

.counts {
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
}

.counts strong {
  font-size: 1.5rem;
}

.remaining {
  font-size: 0.95rem;
}

.report {
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 1rem;
}

.report h3 {
  font-size: 1rem;
  margin: 0;
}

.streaks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 2rem;
  margin: 0;
}

.dailySummary {
  margin: 0;
}

.streaks div {
  display: flex;
  gap: 0.4rem;
}

.streaks dt {
  color: var(--muted);
}

.streaks dd {
  font-weight: 600;
  margin: 0;
}

.history {
  display: grid;
  gap: 0.35rem;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.history li {
  align-items: center;
  aspect-ratio: 1;
  background: var(--border);
  border-radius: 0.25rem;
  color: var(--muted);
  display: flex;
  font-size: 0.7rem;
  justify-content: center;
}

.history li[data-activity="writing"] {
  background: color-mix(in srgb, var(--success) 45%, var(--surface));
  color: var(--text);
}

.history li[data-activity="goal"] {
  background: var(--success);
  color: var(--surface);
}

.history li[data-activity="unknown"] {
  background: transparent;
  border: 1px dashed var(--border);
}

.estimate {
  color: var(--muted);
  line-height: 1.6;
  margin: 0;
}

.message {
  color: var(--muted);
  line-height: 1.6;
}

.error {
  color: var(--danger);
}
</style>

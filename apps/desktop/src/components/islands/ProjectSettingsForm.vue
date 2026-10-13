<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import type { ActiveProjectDetails } from "../../lib/editor-session.ts";

const SAVE_DEBOUNCE_MS = 500;
const goal = ref("");
const dailyGoal = ref("");
const savedGoals = ref({ manuscript: 0, daily: 0 });
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const status = ref("");
const hasProject = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | undefined;

async function loadSettings(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const response = await fetch("/api/editor/project-settings");
    if (response.status === 409) {
      hasProject.value = false;
      return;
    }
    if (!response.ok) throw new Error(await response.text());
    const project: ActiveProjectDetails = await response.json();
    savedGoals.value = {
      manuscript: project.settings.user_settings.manuscriptWordGoal,
      daily: project.settings.user_settings.dailyWordGoal,
    };
    goal.value = String(savedGoals.value.manuscript);
    dailyGoal.value = String(savedGoals.value.daily);
    hasProject.value = true;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "Could not load project settings.";
  } finally {
    loading.value = false;
  }
}

function scheduleGoalSave(): void {
  clearTimeout(saveTimer);
  error.value = "";
  status.value = "";
  saveTimer = setTimeout(() => void saveGoal(), SAVE_DEBOUNCE_MS);
}

function saveGoalNow(): void {
  clearTimeout(saveTimer);
  void saveGoal();
}

async function saveGoal(): Promise<void> {
  const manuscriptWordGoal = Number(goal.value);
  const dailyWordGoal = Number(dailyGoal.value);
  if (!Number.isSafeInteger(manuscriptWordGoal) || manuscriptWordGoal < 1) {
    error.value = "Enter a positive whole-number manuscript goal.";
    status.value = "";
    return;
  }
  if (!Number.isSafeInteger(dailyWordGoal) || dailyWordGoal < 1) {
    error.value = "Enter a positive whole-number daily goal.";
    status.value = "";
    return;
  }
  if (
    manuscriptWordGoal === savedGoals.value.manuscript &&
    dailyWordGoal === savedGoals.value.daily || saving.value
  ) return;

  saving.value = true;
  error.value = "";
  status.value = "Saving…";
  try {
    const response = await fetch("/api/editor/project-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_settings: { manuscriptWordGoal, dailyWordGoal },
      }),
    });
    if (response.status === 409) {
      hasProject.value = false;
      return;
    }
    if (!response.ok) throw new Error(await response.text());
    const project: ActiveProjectDetails = await response.json();
    savedGoals.value = {
      manuscript: project.settings.user_settings.manuscriptWordGoal,
      daily: project.settings.user_settings.dailyWordGoal,
    };
    status.value = manuscriptWordGoal === Number(goal.value) &&
        dailyWordGoal === Number(dailyGoal.value)
      ? "Project goals saved."
      : "";
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "Could not save project settings.";
    status.value = "";
  } finally {
    saving.value = false;
    if (
      Number(goal.value) !== savedGoals.value.manuscript ||
      Number(dailyGoal.value) !== savedGoals.value.daily
    ) scheduleGoalSave();
  }
}

onMounted(() => void loadSettings());
onUnmounted(() => clearTimeout(saveTimer));
</script>

<template>
  <div v-if="loading" class="message" role="status">Loading project settings…</div>
  <div v-else-if="!hasProject" class="message" data-project-required>
    <p>Open a project to configure its word goals.</p>
    <Button href="/" variant="primary">Return to Editor</Button>
  </div>
  <form v-else class="form" @submit.prevent="saveGoalNow">
    <div class="group">
      <label for="manuscript-word-goal" class="label">
        <strong>Manuscript Word Goal</strong>
        <span class="help">
          Set the word-count target for the entire manuscript in this project.
        </span>
      </label>
      <input
        id="manuscript-word-goal"
        class="input"
        type="number"
        min="1"
        step="1000"
        required
        v-model="goal"
        @input="scheduleGoalSave"
        @change="saveGoalNow"
      />
    </div>

    <div class="group">
      <label for="daily-word-goal" class="label">
        <strong>Daily Writing Goal</strong>
        <span class="help">Set the number of words to aim for each day in this project.</span>
      </label>
      <input
        id="daily-word-goal"
        class="input"
        type="number"
        min="1"
        max="100000"
        step="100"
        required
        v-model="dailyGoal"
        @input="scheduleGoalSave"
        @change="saveGoalNow"
      />
    </div>

    <div v-if="error" class="error" role="alert">{{ error }}</div>
    <div class="status" aria-live="polite">{{ status }}</div>
    <div class="actions">
      <Button href="/" variant="primary">Return to Editor</Button>
    </div>
  </form>
</template>

<style scoped>
.form,
.group,
.label {
  display: flex;
  flex-direction: column;
}

.form {
  gap: 1.25rem;
}

.group,
.label {
  gap: 0.5rem;
}

.label strong {
  color: var(--text);
  font-size: 1rem;
}

.help,
.message {
  color: var(--muted);
  line-height: 1.6;
}

.status {
  color: var(--success);
  min-height: 1.25rem;
}

.error {
  color: var(--danger);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
</style>

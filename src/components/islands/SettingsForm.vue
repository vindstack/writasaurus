<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import Button from "../Button.vue";
import styles from "./SettingsForm.module.css";
import {
  applyFontPreference,
  type FontOption,
  getDailyWordGoalPreference,
  getFontPreference,
  getWordsPerPagePreference,
  getWritingAssistancePreference,
  saveDailyWordGoalPreference,
  saveFontPreference,
  saveWordsPerPagePreference,
  saveWritingAssistancePreference,
} from "../../lib/settings.ts";
import { usePageEffects } from "../../composables/usePageEffects.ts";

defineProps<{ isDesktop: boolean }>();

const font = ref<string>("alegreya");
const wordsPerPage = ref("300");
const dailyGoal = ref("1500");
const writingAssistance = ref(true);
const status = ref("");
let timeout: ReturnType<typeof setTimeout> | undefined;

function parsePositive(value: string): number | null {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function showStatus(message: string): void {
  status.value = message;
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    status.value = "";
  }, 2500);
}

function onNumberInput(
  field: typeof wordsPerPage,
  event: Event,
  save: (value: number) => void,
): void {
  field.value = (event.currentTarget as HTMLInputElement).value;
  const value = parsePositive(field.value);
  if (value !== null) save(value);
}

function onNumberChange(
  field: typeof wordsPerPage,
  event: Event,
  save: (value: number) => void,
  read: () => number,
  message: string,
): void {
  const value = parsePositive((event.currentTarget as HTMLInputElement).value);
  if (value !== null) {
    save(value);
    showStatus(message);
  } else {
    field.value = String(read());
  }
}

usePageEffects();
onMounted(() => {
  const saved = getFontPreference();
  font.value = saved;
  applyFontPreference(saved);
  wordsPerPage.value = String(getWordsPerPagePreference());
  dailyGoal.value = String(getDailyWordGoalPreference());
  writingAssistance.value = getWritingAssistancePreference();
});
onUnmounted(() => clearTimeout(timeout));
</script>

<template>
  <div :class="styles.form">
    <div :class="styles.group">
      <label for="font-select" :class="styles.label">
        <strong>Editor Font</strong>
        <span :class="styles.help">
          Choose the typeface used in the editor and chapter titles.
        </span>
      </label>
      <select
        id="font-select"
        :class="styles.select"
        v-model="font"
        @change="(event) => {
          const selected = (event.currentTarget as HTMLSelectElement).value as FontOption;
          saveFontPreference(selected);
          applyFontPreference(selected);
          showStatus('Font preference saved.');
        }"
      >
        <optgroup label="Serif">
          <option value="alegreya">Alegreya</option>
          <option value="serif">Standard Serif</option>
          <option value="georgia">Georgia</option>
          <option value="times">Times New Roman</option>
          <option value="garamond">Garamond</option>
        </optgroup>
        <optgroup label="System">
          <option value="system">System Font</option>
        </optgroup>
        <optgroup label="Sans-Serif">
          <option value="sans-serif">Standard Sans-Serif</option>
          <option value="arial">Arial</option>
          <option value="helvetica">Helvetica</option>
          <option value="verdana">Verdana</option>
          <option value="trebuchet">Trebuchet MS</option>
        </optgroup>
      </select>
    </div>

    <div :class="styles.preview">
      <span :class="styles.previewLabel">Preview</span>
      <div id="font-preview" :class="styles.previewBox">
        <h3 :class="styles.previewHeading">Chapter One: The Horizon</h3>
        <p :class="styles.previewBody">
          The morning sun crested the ridges, illuminating the pages of a new story. Every word,
          sentence, and chapter will appear in your chosen typeface.
        </p>
      </div>
    </div>

    <div :class="styles.group">
      <label for="words-per-page-input" :class="styles.label">
        <strong>Words per Page</strong>
        <span :class="styles.help">
          Average word count used to calculate estimated page counts (default: 300).
        </span>
      </label>
      <input
        id="words-per-page-input"
        :class="styles.input"
        type="number"
        min="50"
        max="2000"
        step="10"
        v-model="wordsPerPage"
        @input="onNumberInput(wordsPerPage, $event, saveWordsPerPagePreference)"
        @change="onNumberChange(
          wordsPerPage,
          $event,
          saveWordsPerPagePreference,
          getWordsPerPagePreference,
          'Words per page saved.',
        )"
      />
    </div>

    <div :class="styles.group">
      <label for="daily-word-goal-input" :class="styles.label">
        <strong>Daily Writing Goal</strong>
        <span :class="styles.help">Number of words to aim for each day (default: 1,500).</span>
      </label>
      <input
        id="daily-word-goal-input"
        :class="styles.input"
        type="number"
        min="1"
        max="100000"
        step="100"
        v-model="dailyGoal"
        @input="onNumberInput(dailyGoal, $event, saveDailyWordGoalPreference)"
        @change="onNumberChange(
          dailyGoal,
          $event,
          saveDailyWordGoalPreference,
          getDailyWordGoalPreference,
          'Daily writing goal saved.',
        )"
      />
    </div>

    <div v-if="isDesktop" :class="styles.group">
      <label for="writing-assistance-input" :class="styles.label">
        <strong>Writing Assistance</strong>
        <span :class="styles.help">
          Use the bundled offline US-English spelling and grammar checker.
        </span>
      </label>
      <label :class="styles.checkbox">
        <input
          id="writing-assistance-input"
          type="checkbox"
          v-model="writingAssistance"
          @change="saveWritingAssistancePreference(writingAssistance)"
        />
        Enable writing assistance
      </label>
    </div>

    <div :class="styles.status" id="settings-status" aria-live="polite">{{ status }}</div>

    <div :class="styles.actions">
      <Button href="/" variant="primary" title="Return to Editor (Ctrl+Shift+E)">
        ← Return to Editor
      </Button>
    </div>
  </div>
</template>

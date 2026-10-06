<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import Button from "../Button.vue";
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
  <div class="form">
    <div class="group">
      <label for="font-select" class="label">
        <strong>Editor Font</strong>
        <span class="help">
          Choose the typeface used in the editor and chapter titles.
        </span>
      </label>
      <select
        id="font-select"
        class="select"
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

    <div class="preview">
      <span class="previewLabel">Preview</span>
      <div id="font-preview" class="previewBox">
        <h3 class="previewHeading">Chapter One: The Horizon</h3>
        <p class="previewBody">
          The morning sun crested the ridges, illuminating the pages of a new story. Every word,
          sentence, and chapter will appear in your chosen typeface.
        </p>
      </div>
    </div>

    <div class="group">
      <label for="words-per-page-input" class="label">
        <strong>Words per Page</strong>
        <span class="help">
          Average word count used to calculate estimated page counts (default: 300).
        </span>
      </label>
      <input
        id="words-per-page-input"
        class="input"
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

    <div class="group">
      <label for="daily-word-goal-input" class="label">
        <strong>Daily Writing Goal</strong>
        <span class="help">Number of words to aim for each day (default: 1,500).</span>
      </label>
      <input
        id="daily-word-goal-input"
        class="input"
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

    <div v-if="isDesktop" class="group">
      <label for="writing-assistance-input" class="label">
        <strong>Writing Assistance</strong>
        <span class="help">
          Use the bundled offline US-English spelling and grammar checker.
        </span>
      </label>
      <label class="checkbox">
        <input
          id="writing-assistance-input"
          type="checkbox"
          v-model="writingAssistance"
          @change="saveWritingAssistancePreference(writingAssistance)"
        />
        Enable writing assistance
      </label>
    </div>

    <div class="status" id="settings-status" aria-live="polite">{{ status }}</div>

    <div class="actions">
      <Button href="/" variant="primary" title="Return to Editor (Ctrl+Shift+E)">
        ← Return to Editor
      </Button>
    </div>
  </div>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.label strong {
  color: var(--text);
  font-size: 1rem;
}

.help {
  color: var(--muted);
  font-size: 0.85rem;
}

.checkbox {
  align-items: center;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  gap: 0.5rem;
}

.checkbox input {
  accent-color: var(--accent);
  block-size: 1rem;
  inline-size: 1rem;
}

.select,
.input {
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  box-sizing: border-box;
  color: var(--text);
  font: inherit;
  font-size: 1rem;
  outline: none;
  padding: 0.65rem 0.85rem;
  width: 100%;
}

.select {
  cursor: pointer;
}

.select:focus-visible,
.input:focus-visible {
  border-color: var(--accent);
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.previewLabel {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.previewBox {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
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
  gap: 0.75rem;
  padding: 1.25rem;
  transition: font-family 0.15s ease;
}

.previewHeading {
  color: var(--text);
  font-family: inherit;
  font-size: 1.35rem;
  font-weight: 700;
}

.previewBody {
  color: var(--text);
  font-family: inherit;
  font-size: 1.05rem;
  line-height: 1.7;
}

.status {
  color: var(--muted);
  font-size: 0.85rem;
  min-height: 1.25rem;
}

.actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 0.5rem;
}
</style>

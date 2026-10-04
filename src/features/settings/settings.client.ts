import {
  applyFontPreference,
  applyThemePreference,
  type FontOption,
  getDailyWordGoalPreference,
  getFontPreference,
  getThemePreference,
  getWordsPerPagePreference,
  getWritingAssistancePreference,
  saveDailyWordGoalPreference,
  saveFontPreference,
  saveWordsPerPagePreference,
  saveWritingAssistancePreference,
} from "../../../lib/settings.ts";
import { registerReturnToEditorShortcut } from "../../../lib/shortcuts.ts";

applyThemePreference(getThemePreference());

const fontSelect = document.querySelector<HTMLSelectElement>("#font-select");
const wordsPerPageInput = document.querySelector<HTMLInputElement>("#words-per-page-input");
const dailyWordGoalInput = document.querySelector<HTMLInputElement>("#daily-word-goal-input");
const writingAssistanceInput = document.querySelector<HTMLInputElement>(
  "#writing-assistance-input",
);
const status = document.querySelector<HTMLElement>("#settings-status");

const currentFont = getFontPreference();
applyFontPreference(currentFont);

let timeoutId: ReturnType<typeof setTimeout> | undefined;

function showStatus(message: string): void {
  if (status) {
    status.textContent = message;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      status.textContent = "";
    }, 2500);
  }
}

if (fontSelect) {
  fontSelect.value = currentFont;

  fontSelect.addEventListener("change", () => {
    const selected = fontSelect.value as FontOption;
    saveFontPreference(selected);
    applyFontPreference(selected);
    showStatus("Font preference saved.");
  });
}

if (wordsPerPageInput) {
  wordsPerPageInput.value = String(getWordsPerPagePreference());

  wordsPerPageInput.addEventListener("input", () => {
    const value = parseInt(wordsPerPageInput.value, 10);
    if (Number.isFinite(value) && value > 0) {
      saveWordsPerPagePreference(value);
    }
  });

  wordsPerPageInput.addEventListener("change", () => {
    const value = parseInt(wordsPerPageInput.value, 10);
    if (Number.isFinite(value) && value > 0) {
      saveWordsPerPagePreference(value);
      showStatus("Words per page saved.");
    } else {
      wordsPerPageInput.value = String(getWordsPerPagePreference());
    }
  });
}

if (dailyWordGoalInput) {
  dailyWordGoalInput.value = String(getDailyWordGoalPreference());

  dailyWordGoalInput.addEventListener("input", () => {
    const value = parseInt(dailyWordGoalInput.value, 10);
    if (Number.isFinite(value) && value > 0) {
      saveDailyWordGoalPreference(value);
    }
  });

  dailyWordGoalInput.addEventListener("change", () => {
    const value = parseInt(dailyWordGoalInput.value, 10);
    if (Number.isFinite(value) && value > 0) {
      saveDailyWordGoalPreference(value);
      showStatus("Daily writing goal saved.");
    } else {
      dailyWordGoalInput.value = String(getDailyWordGoalPreference());
    }
  });
}

if (writingAssistanceInput) {
  writingAssistanceInput.checked = getWritingAssistancePreference();
  writingAssistanceInput.addEventListener("change", () => {
    saveWritingAssistancePreference(writingAssistanceInput.checked);
    showStatus(`Writing assistance ${writingAssistanceInput.checked ? "enabled" : "disabled"}.`);
  });
}

registerReturnToEditorShortcut();

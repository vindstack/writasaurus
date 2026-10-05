import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { Button } from "../components/Button.tsx";
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
} from "../lib/settings.ts";
import { usePageEffects } from "../lib/use-page-effects.ts";
// @ts-types="../vite-env.d.ts"
import styles from "./SettingsForm.module.css";

interface SettingsFormProps {
  isDesktop: boolean;
}

function parsePositive(value: string): number | null {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function SettingsForm({ isDesktop }: SettingsFormProps) {
  const font = useSignal<string>("alegreya");
  const wordsPerPage = useSignal("300");
  const dailyGoal = useSignal("1500");
  const writingAssistance = useSignal(true);
  const status = useSignal("");
  const timeout = useRef<ReturnType<typeof setTimeout>>();

  usePageEffects();

  useEffect(() => {
    const saved = getFontPreference();
    font.value = saved;
    applyFontPreference(saved);
    wordsPerPage.value = String(getWordsPerPagePreference());
    dailyGoal.value = String(getDailyWordGoalPreference());
    writingAssistance.value = getWritingAssistancePreference();
    return () => clearTimeout(timeout.current);
  }, []);

  function showStatus(message: string): void {
    status.value = message;
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      status.value = "";
    }, 2500);
  }

  function numberHandlers(
    field: { value: string },
    save: (value: number) => void,
    read: () => number,
    message: string,
  ) {
    return {
      onInput: (event: Event) => {
        field.value = (event.currentTarget as HTMLInputElement).value;
        const value = parsePositive(field.value);
        if (value !== null) save(value);
      },
      onChange: (event: Event) => {
        const value = parsePositive((event.currentTarget as HTMLInputElement).value);
        if (value !== null) {
          save(value);
          showStatus(message);
        } else {
          field.value = String(read());
        }
      },
    };
  }

  return (
    <div class={styles.form}>
      <div class={styles.group}>
        <label for="font-select" class={styles.label}>
          <strong>Editor Font</strong>
          <span class={styles.help}>
            Choose the typeface used in the editor and chapter titles.
          </span>
        </label>
        <select
          id="font-select"
          class={styles.select}
          value={font.value}
          onChange={(event) => {
            const selected = event.currentTarget.value as FontOption;
            font.value = selected;
            saveFontPreference(selected);
            applyFontPreference(selected);
            showStatus("Font preference saved.");
          }}
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

      <div class={styles.preview}>
        <span class={styles.previewLabel}>Preview</span>
        <div id="font-preview" class={styles.previewBox}>
          <h3 class={styles.previewHeading}>Chapter One: The Horizon</h3>
          <p class={styles.previewBody}>
            The morning sun crested the ridges, illuminating the pages of a new story. Every word,
            sentence, and chapter will appear in your chosen typeface.
          </p>
        </div>
      </div>

      <div class={styles.group}>
        <label for="words-per-page-input" class={styles.label}>
          <strong>Words per Page</strong>
          <span class={styles.help}>
            Average word count used to calculate estimated page counts (default: 300).
          </span>
        </label>
        <input
          type="number"
          id="words-per-page-input"
          class={styles.input}
          min="50"
          max="2000"
          step="10"
          value={wordsPerPage.value}
          {...numberHandlers(
            wordsPerPage,
            saveWordsPerPagePreference,
            getWordsPerPagePreference,
            "Words per page saved.",
          )}
        />
      </div>

      <div class={styles.group}>
        <label for="daily-word-goal-input" class={styles.label}>
          <strong>Daily Writing Goal</strong>
          <span class={styles.help}>Number of words to aim for each day (default: 1,500).</span>
        </label>
        <input
          type="number"
          id="daily-word-goal-input"
          class={styles.input}
          min="1"
          max="100000"
          step="100"
          value={dailyGoal.value}
          {...numberHandlers(
            dailyGoal,
            saveDailyWordGoalPreference,
            getDailyWordGoalPreference,
            "Daily writing goal saved.",
          )}
        />
      </div>

      {isDesktop && (
        <div class={styles.group}>
          <label for="writing-assistance-input" class={styles.label}>
            <strong>Writing Assistance</strong>
            <span class={styles.help}>
              Use the bundled offline US-English spelling and grammar checker.
            </span>
          </label>
          <label class={styles.checkbox}>
            <input
              type="checkbox"
              id="writing-assistance-input"
              checked={writingAssistance.value}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                writingAssistance.value = checked;
                saveWritingAssistancePreference(checked);
                showStatus(`Writing assistance ${checked ? "enabled" : "disabled"}.`);
              }}
            />
            Enable writing assistance
          </label>
        </div>
      )}

      <div class={styles.status} id="settings-status" aria-live="polite">{status}</div>

      <div class={styles.actions}>
        <Button href="/" variant="primary" title="Return to Editor (Ctrl+Shift+E)">
          ← Return to Editor
        </Button>
      </div>
    </div>
  );
}

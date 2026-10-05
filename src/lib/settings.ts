export type FontOption =
  | "alegreya"
  | "system"
  | "serif"
  | "georgia"
  | "times"
  | "garamond"
  | "sans-serif"
  | "arial"
  | "helvetica"
  | "verdana"
  | "trebuchet";

export interface FontDefinition {
  id: FontOption;
  name: string;
  category: "system" | "serif" | "sans";
  family: string;
}

export const FONT_OPTIONS: FontDefinition[] = [
  {
    id: "alegreya",
    name: "Alegreya",
    category: "serif",
    family:
      '"Alegreya", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  {
    id: "system",
    name: "System Font",
    category: "system",
    family:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  {
    id: "serif",
    name: "Standard Serif",
    category: "serif",
    family: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  {
    id: "georgia",
    name: "Georgia",
    category: "serif",
    family: 'Georgia, "Times New Roman", serif',
  },
  {
    id: "times",
    name: "Times New Roman",
    category: "serif",
    family: '"Times New Roman", Times, Georgia, serif',
  },
  {
    id: "garamond",
    name: "Garamond",
    category: "serif",
    family: 'Garamond, "Baskerville", "Times New Roman", serif',
  },
  {
    id: "sans-serif",
    name: "Standard Sans-Serif",
    category: "sans",
    family:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: "arial",
    name: "Arial",
    category: "sans",
    family: "Arial, Helvetica, sans-serif",
  },
  {
    id: "helvetica",
    name: "Helvetica",
    category: "sans",
    family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    id: "verdana",
    name: "Verdana",
    category: "sans",
    family: "Verdana, Geneva, sans-serif",
  },
  {
    id: "trebuchet",
    name: "Trebuchet MS",
    category: "sans",
    family: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
  },
];

export const FONT_MAP: Record<FontOption, FontDefinition> = Object.fromEntries(
  FONT_OPTIONS.map((f) => [f.id, f]),
) as Record<FontOption, FontDefinition>;

export const DEFAULT_FONT: FontOption = "alegreya";
export const SETTINGS_KEY = "writasaurus-settings-font";
export type ThemePreference = "light" | "dark" | "auto";
export const THEME_SETTINGS_KEY = "writasaurus-settings-theme";

export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_SETTINGS_KEY);
    if (saved === "light" || saved === "dark" || saved === "auto") return saved;
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return "auto";
}

export function saveThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_SETTINGS_KEY, theme);
  } catch (err) {
    console.warn("Could not save theme preference", err);
  }
}

export function applyThemePreference(theme: ThemePreference): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
}

export const DEFAULT_WORDS_PER_PAGE = 300;
export const SETTINGS_WORDS_PER_PAGE_KEY = "writasaurus-settings-words-per-page";
export const DEFAULT_DAILY_WORD_GOAL = 1500;
export const SETTINGS_DAILY_WORD_GOAL_KEY = "writasaurus-settings-daily-word-goal";
export const DAILY_WRITING_PROGRESS_KEY = "writasaurus-daily-writing-progress";
export const SETTINGS_WRITING_ASSISTANCE_KEY = "writasaurus-settings-writing-assistance";
export const WRITING_ASSISTANCE_WORDS_KEY = "writasaurus-writing-assistance-words";
export const WRITING_ASSISTANCE_IGNORES_KEY = "writasaurus-writing-assistance-ignores";

interface DailyWritingProgress {
  date: string;
  startingWords: Record<string, number>;
}

export function getFontPreference(): FontOption {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved && saved in FONT_MAP) {
      return saved as FontOption;
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return DEFAULT_FONT;
}

export function saveFontPreference(font: FontOption): void {
  try {
    localStorage.setItem(SETTINGS_KEY, font);
  } catch (err) {
    console.warn("Could not save font preference", err);
  }
}

export function applyFontPreference(font: FontOption): void {
  const definition = FONT_MAP[font] ?? FONT_MAP[DEFAULT_FONT];
  if (typeof document !== "undefined") {
    document.documentElement.dataset.font = definition.id;
    document.documentElement.style.setProperty("--editor-font", definition.family);
  }
}

export function getWordsPerPagePreference(): number {
  try {
    const saved = localStorage.getItem(SETTINGS_WORDS_PER_PAGE_KEY);
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return DEFAULT_WORDS_PER_PAGE;
}

export function saveWordsPerPagePreference(wordsPerPage: number): void {
  try {
    if (Number.isFinite(wordsPerPage) && wordsPerPage > 0) {
      localStorage.setItem(
        SETTINGS_WORDS_PER_PAGE_KEY,
        String(Math.round(wordsPerPage)),
      );
    }
  } catch (err) {
    console.warn("Could not save words per page preference", err);
  }
}

export function getDailyWordGoalPreference(): number {
  try {
    const saved = localStorage.getItem(SETTINGS_DAILY_WORD_GOAL_KEY);
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return DEFAULT_DAILY_WORD_GOAL;
}

export function saveDailyWordGoalPreference(dailyWordGoal: number): void {
  try {
    if (Number.isFinite(dailyWordGoal) && dailyWordGoal > 0) {
      localStorage.setItem(
        SETTINGS_DAILY_WORD_GOAL_KEY,
        String(Math.round(dailyWordGoal)),
      );
    }
  } catch (err) {
    console.warn("Could not save daily word goal preference", err);
  }
}

function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function getDailyWritingProgress(): DailyWritingProgress {
  const date = today();
  try {
    const saved = localStorage.getItem(DAILY_WRITING_PROGRESS_KEY);
    const progress = saved ? JSON.parse(saved) as DailyWritingProgress : null;
    if (
      progress?.date === date && progress.startingWords &&
      Object.values(progress.startingWords).every((words) => Number.isFinite(words) && words >= 0)
    ) {
      return progress;
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return { date, startingWords: {} };
}

/**
 * Returns the current manuscript's net word-count increase since it was first
 * opened today. Deleting and later replacing words therefore does not inflate
 * the day's progress.
 */
export function getDailyWrittenWords(manuscriptId: string, totalWords: number): number {
  if (!manuscriptId || !Number.isFinite(totalWords) || totalWords < 0) return 0;
  try {
    const progress = getDailyWritingProgress();
    const startingWords = progress.startingWords[manuscriptId];
    if (startingWords === undefined) {
      progress.startingWords[manuscriptId] = totalWords;
      localStorage.setItem(DAILY_WRITING_PROGRESS_KEY, JSON.stringify(progress));
      return 0;
    }
    return Math.max(totalWords - startingWords, 0);
  } catch (err) {
    console.warn("Could not read daily writing progress", err);
    return 0;
  }
}

export function getWritingAssistancePreference(): boolean {
  try {
    return localStorage.getItem(SETTINGS_WRITING_ASSISTANCE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveWritingAssistancePreference(enabled: boolean): void {
  try {
    localStorage.setItem(SETTINGS_WRITING_ASSISTANCE_KEY, String(enabled));
  } catch (err) {
    console.warn("Could not save writing assistance preference", err);
  }
}

function getWritingAssistanceList(key: string): string[] {
  try {
    const saved = localStorage.getItem(key);
    const values = saved ? JSON.parse(saved) : [];
    return Array.isArray(values) && values.every((value) => typeof value === "string")
      ? values
      : [];
  } catch {
    return [];
  }
}

function saveWritingAssistanceList(key: string, values: readonly string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify([...new Set(values)]));
  } catch (err) {
    console.warn("Could not save writing assistance preference", err);
  }
}

export function getWritingAssistanceWords(): string[] {
  return getWritingAssistanceList(WRITING_ASSISTANCE_WORDS_KEY);
}

export function saveWritingAssistanceWords(words: readonly string[]): void {
  saveWritingAssistanceList(WRITING_ASSISTANCE_WORDS_KEY, words);
}

export function getWritingAssistanceIgnores(): string[] {
  return getWritingAssistanceList(WRITING_ASSISTANCE_IGNORES_KEY);
}

export function saveWritingAssistanceIgnores(ignores: readonly string[]): void {
  saveWritingAssistanceList(WRITING_ASSISTANCE_IGNORES_KEY, ignores);
}

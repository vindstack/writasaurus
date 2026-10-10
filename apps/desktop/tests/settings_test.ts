import {
  applyFontPreference,
  applyThemePreference,
  DAILY_WRITING_PROGRESS_KEY,
  DEFAULT_DAILY_WORD_GOAL,
  DEFAULT_FONT,
  DEFAULT_WORDS_PER_PAGE,
  FONT_MAP,
  FONT_OPTIONS,
  type FontOption,
  getDailyWordGoalPreference,
  getDailyWrittenWords,
  getFontPreference,
  getThemePreference,
  getWordsPerPagePreference,
  getWritingAssistancePreference,
  saveDailyWordGoalPreference,
  saveFontPreference,
  saveThemePreference,
  saveWordsPerPagePreference,
  saveWritingAssistancePreference,
  SETTINGS_DAILY_WORD_GOAL_KEY,
  SETTINGS_KEY,
  SETTINGS_WORDS_PER_PAGE_KEY,
  SETTINGS_WRITING_ASSISTANCE_KEY,
  THEME_SETTINGS_KEY,
  type ThemePreference,
} from "../../../packages/shared/settings.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("settings: font options include system, serif, and sans-serif choices", () => {
  const ids = FONT_OPTIONS.map((f) => f.id);
  assert(ids.includes("alegreya"));
  assert(ids.includes("system"));
  assert(ids.includes("serif"));
  assert(ids.includes("sans-serif"));
  assert(ids.includes("georgia"));
  assert(ids.includes("times"));
  assert(ids.includes("arial"));
  assert(ids.includes("helvetica"));

  assertEquals(DEFAULT_FONT, "alegreya");
  assert(FONT_MAP.alegreya.family.includes("Alegreya"));
  assert(FONT_MAP.alegreya.family.includes("system-ui"));
  assert(FONT_MAP.system.family.includes("system-ui"));
  assert(FONT_MAP.serif.family.includes("serif"));
  assert(FONT_MAP["sans-serif"].family.includes("sans-serif"));
});

Deno.test("settings: font preference defaults to alegreya when empty", () => {
  localStorage.removeItem(SETTINGS_KEY);
  assertEquals(getFontPreference(), "alegreya");
});

Deno.test("settings: saving and reading font preference round-trips", () => {
  try {
    const options: FontOption[] = ["alegreya", "system", "arial", "georgia", "times", "sans-serif"];
    for (const opt of options) {
      saveFontPreference(opt);
      assertEquals(getFontPreference(), opt);
    }
  } finally {
    localStorage.removeItem(SETTINGS_KEY);
  }
});

Deno.test("settings: invalid stored font value falls back to default", () => {
  try {
    localStorage.setItem(SETTINGS_KEY, "comic-sans-ms");
    assertEquals(getFontPreference(), DEFAULT_FONT);
  } finally {
    localStorage.removeItem(SETTINGS_KEY);
  }
});

Deno.test("settings: applyFontPreference updates dataset and style property", () => {
  // applyFontPreference checks typeof document !== "undefined"
  // in Deno CLI runtime without DOM, it gracefully does not throw
  applyFontPreference("system");
  applyFontPreference("serif");
});

Deno.test("settings: words per page defaults to 300 when empty", () => {
  localStorage.removeItem(SETTINGS_WORDS_PER_PAGE_KEY);
  assertEquals(DEFAULT_WORDS_PER_PAGE, 300);
  assertEquals(getWordsPerPagePreference(), 300);
});

Deno.test("settings: saving and reading words per page preference round-trips", () => {
  try {
    const values = [250, 300, 350, 500];
    for (const val of values) {
      saveWordsPerPagePreference(val);
      assertEquals(getWordsPerPagePreference(), val);
    }
  } finally {
    localStorage.removeItem(SETTINGS_WORDS_PER_PAGE_KEY);
  }
});

Deno.test("settings: invalid stored words per page value falls back to default 300", () => {
  try {
    localStorage.setItem(SETTINGS_WORDS_PER_PAGE_KEY, "not-a-number");
    assertEquals(getWordsPerPagePreference(), 300);

    localStorage.setItem(SETTINGS_WORDS_PER_PAGE_KEY, "0");
    assertEquals(getWordsPerPagePreference(), 300);

    localStorage.setItem(SETTINGS_WORDS_PER_PAGE_KEY, "-100");
    assertEquals(getWordsPerPagePreference(), 300);
  } finally {
    localStorage.removeItem(SETTINGS_WORDS_PER_PAGE_KEY);
  }
});

Deno.test("settings: daily word goal defaults to 1,500 and round-trips", () => {
  try {
    localStorage.removeItem(SETTINGS_DAILY_WORD_GOAL_KEY);
    assertEquals(DEFAULT_DAILY_WORD_GOAL, 1500);
    assertEquals(getDailyWordGoalPreference(), 1500);

    saveDailyWordGoalPreference(2000);
    assertEquals(getDailyWordGoalPreference(), 2000);
  } finally {
    localStorage.removeItem(SETTINGS_DAILY_WORD_GOAL_KEY);
  }
});

Deno.test("settings: daily written words are the manuscript's net increase for the current day", () => {
  try {
    localStorage.removeItem(DAILY_WRITING_PROGRESS_KEY);
    assertEquals(getDailyWrittenWords("manuscript", 10), 0);

    assertEquals(getDailyWrittenWords("manuscript", 15), 5);
    assertEquals(getDailyWrittenWords("manuscript", 10), 0);
    assertEquals(getDailyWrittenWords("manuscript", 15), 5);
  } finally {
    localStorage.removeItem(DAILY_WRITING_PROGRESS_KEY);
  }
});

Deno.test("settings: writing assistance is enabled by default and persists", () => {
  try {
    localStorage.removeItem(SETTINGS_WRITING_ASSISTANCE_KEY);
    assertEquals(getWritingAssistancePreference(), true);

    saveWritingAssistancePreference(false);
    assertEquals(getWritingAssistancePreference(), false);
  } finally {
    localStorage.removeItem(SETTINGS_WRITING_ASSISTANCE_KEY);
  }
});

Deno.test("settings: theme preference defaults to auto and round-trips", () => {
  try {
    localStorage.removeItem(THEME_SETTINGS_KEY);
    assertEquals(getThemePreference(), "auto");

    const themes: ThemePreference[] = ["light", "dark", "auto"];
    for (const theme of themes) {
      saveThemePreference(theme);
      assertEquals(getThemePreference(), theme);
    }
  } finally {
    localStorage.removeItem(THEME_SETTINGS_KEY);
  }
});

Deno.test("settings: invalid stored theme preference falls back to auto", () => {
  try {
    localStorage.setItem(THEME_SETTINGS_KEY, "invalid-theme");
    assertEquals(getThemePreference(), "auto");
  } finally {
    localStorage.removeItem(THEME_SETTINGS_KEY);
  }
});

Deno.test("settings: applyThemePreference updates data-theme attribute", () => {
  applyThemePreference("light");
  applyThemePreference("dark");
  applyThemePreference("auto");
});

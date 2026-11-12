import { test } from "vitest";
import {
  applyFontPreference,
  DEFAULT_DAILY_WORD_GOAL,
  DEFAULT_FONT,
  DEFAULT_WORDS_PER_PAGE,
  FONT_MAP,
  FONT_OPTIONS,
} from "../../../packages/shared/settings.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

test("settings: font options include system, serif, and sans-serif choices", () => {
  const ids = FONT_OPTIONS.map((font) => font.id);
  for (const id of [
    "alegreya",
    "system",
    "serif",
    "sans-serif",
    "georgia",
    "times",
    "arial",
    "helvetica",
  ]) {
    assert(ids.includes(id as (typeof ids)[number]));
  }

  assert(DEFAULT_FONT === "alegreya");
  assert(DEFAULT_WORDS_PER_PAGE === 300);
  assert(DEFAULT_DAILY_WORD_GOAL === 1500);
  assert(FONT_MAP.alegreya.family.includes("Alegreya"));
  assert(FONT_MAP.alegreya.family.includes("system-ui"));
  assert(FONT_MAP.system.family.includes("system-ui"));
  assert(FONT_MAP.serif.family.includes("serif"));
  assert(FONT_MAP["sans-serif"].family.includes("sans-serif"));
});

test("settings: applying a font preference is safe without a DOM", () => {
  applyFontPreference("system");
  applyFontPreference("serif");
});

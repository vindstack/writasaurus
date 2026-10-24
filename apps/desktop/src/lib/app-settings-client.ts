import { ref, shallowRef } from "vue";
import {
  DEFAULT_FONT,
  DEFAULT_WORDS_PER_PAGE,
  FONT_OPTIONS,
  type FontOption,
} from "../../../../packages/shared/settings.ts";
import type { AppSettings, AppSettingsUpdate } from "./app-settings-types.ts";

const SETTINGS_URL = "/api/editor/settings";
const VALID_FONTS = new Set(FONT_OPTIONS.map((option) => option.id));

export const appSettings = shallowRef<AppSettings | null>(null);
export const appSettingsError = ref("");

let loadingSettings: Promise<AppSettings> | undefined;
let settingsUpdates: Promise<unknown> = Promise.resolve();

async function responseError(response: Response, fallback: string): Promise<Error> {
  const detail = (await response.text()).trim();
  return new Error(detail || `${fallback} (${response.status}).`);
}

function parseAppSettings(value: unknown): AppSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("The Writasaurus settings response is invalid.");
  }
  const settings = value as Record<string, unknown>;
  if (
    settings.version !== 1 ||
    typeof settings.font !== "string" ||
    !VALID_FONTS.has(settings.font as FontOption) ||
    !Number.isSafeInteger(settings.wordsPerPage) ||
    (settings.wordsPerPage as number) < 1 ||
    !Array.isArray(settings.writingAssistanceWords) ||
    !settings.writingAssistanceWords.every((word) => typeof word === "string") ||
    !Array.isArray(settings.writingAssistanceIgnores) ||
    !settings.writingAssistanceIgnores.every((item) => typeof item === "string")
  ) {
    throw new Error("The Writasaurus settings response is invalid.");
  }
  return {
    version: 1,
    font: settings.font as FontOption,
    wordsPerPage: settings.wordsPerPage as number,
    writingAssistanceWords: settings.writingAssistanceWords as string[],
    writingAssistanceIgnores: settings.writingAssistanceIgnores as string[],
  };
}

async function fetchSettings(): Promise<AppSettings> {
  const response = await fetch(SETTINGS_URL, { cache: "no-store" });
  if (!response.ok) throw await responseError(response, "Could not load Writasaurus settings");
  return parseAppSettings(await response.json());
}

export async function loadAppSettings(): Promise<AppSettings> {
  if (appSettings.value) return appSettings.value;
  if (loadingSettings) return await loadingSettings;
  loadingSettings = fetchSettings()
    .then((settings) => {
      appSettings.value = settings;
      appSettingsError.value = "";
      return settings;
    })
    .catch((error: unknown) => {
      appSettingsError.value = error instanceof Error ? error.message : "Could not load settings.";
      throw error;
    })
    .finally(() => {
      loadingSettings = undefined;
    });
  return await loadingSettings;
}

export function updateAppSettings(update: AppSettingsUpdate): Promise<void> {
  const operation = settingsUpdates
    .then(async () => {
      await loadAppSettings();
      const response = await fetch(SETTINGS_URL, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!response.ok) throw await responseError(response, "Could not save Writasaurus settings");
      appSettings.value = parseAppSettings(await response.json());
      appSettingsError.value = "";
    })
    .catch((error: unknown) => {
      appSettingsError.value = error instanceof Error ? error.message : "Could not save settings.";
      throw error;
    });
  settingsUpdates = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export function getFontPreference(): FontOption {
  return appSettings.value?.font ?? DEFAULT_FONT;
}

export function getWordsPerPagePreference(): number {
  return appSettings.value?.wordsPerPage ?? DEFAULT_WORDS_PER_PAGE;
}

export function saveFontPreference(font: FontOption): Promise<void> {
  return updateAppSettings({ font });
}

export function saveWordsPerPagePreference(wordsPerPage: number): Promise<void> {
  if (!Number.isSafeInteger(wordsPerPage) || wordsPerPage < 1) {
    return Promise.reject(new TypeError("Words per page must be a positive whole number."));
  }
  return updateAppSettings({ wordsPerPage });
}

export function getWritingAssistanceWords(): string[] {
  return appSettings.value?.writingAssistanceWords ?? [];
}

export function getWritingAssistanceIgnores(): string[] {
  return appSettings.value?.writingAssistanceIgnores ?? [];
}

export function saveWritingAssistanceWords(words: readonly string[]): Promise<void> {
  return updateAppSettings({ writingAssistanceWords: [...new Set(words)] });
}

export function saveWritingAssistanceIgnores(ignores: readonly string[]): Promise<void> {
  return updateAppSettings({ writingAssistanceIgnores: [...new Set(ignores)] });
}

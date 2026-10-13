import { ref, shallowRef } from "vue";
import {
  DEFAULT_DAILY_WORD_GOAL,
  DEFAULT_FONT,
  DEFAULT_WORDS_PER_PAGE,
  FONT_OPTIONS,
  type FontOption,
} from "../../../../packages/shared/settings.ts";
import type { AppSettings, AppSettingsUpdate, DailyWritingProgress } from "./app-settings-types.ts";

const SETTINGS_URL = "/api/editor/settings";
const DAILY_PROGRESS_URL = "/api/editor/daily-progress";
const LICENSE_TOKEN_URL = "/api/editor/license-token";
const VALID_FONTS = new Set(FONT_OPTIONS.map((option) => option.id));

export const appSettings = shallowRef<AppSettings | null>(null);
export const appSettingsError = ref("");

export class LicenseStorageError extends Error {}

let loadingSettings: Promise<AppSettings> | undefined;
let settingsUpdates: Promise<unknown> = Promise.resolve();
const progressRequests = new Map<string, Promise<number>>();

function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const detail = (await response.text()).trim();
  return new Error(detail || `${fallback} (${response.status}).`);
}

function parseDailyWritingProgress(value: unknown): DailyWritingProgress {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("The Writasaurus daily writing progress is invalid.");
  }
  const progress = value as Record<string, unknown>;
  if (
    typeof progress.date !== "string" ||
    (progress.date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(progress.date)) ||
    typeof progress.startingWords !== "object" || progress.startingWords === null ||
    Array.isArray(progress.startingWords)
  ) {
    throw new Error("The Writasaurus daily writing progress is invalid.");
  }
  const startingWords = progress.startingWords as Record<string, unknown>;
  if (
    Object.entries(startingWords).some(([key, words]) =>
      key.length === 0 || !Number.isSafeInteger(words) || (words as number) < 0
    )
  ) {
    throw new Error("The Writasaurus daily writing progress is invalid.");
  }
  return {
    date: progress.date,
    startingWords: startingWords as Record<string, number>,
  };
}

function parseAppSettings(value: unknown): AppSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("The Writasaurus settings response is invalid.");
  }
  const settings = value as Record<string, unknown>;
  const progress = settings.dailyWritingProgress;
  if (
    settings.version !== 1 || typeof settings.font !== "string" ||
    !VALID_FONTS.has(settings.font as FontOption) ||
    !Number.isSafeInteger(settings.wordsPerPage) || (settings.wordsPerPage as number) < 1 ||
    !Number.isSafeInteger(settings.dailyWordGoal) || (settings.dailyWordGoal as number) < 1 ||
    !Array.isArray(settings.writingAssistanceWords) ||
    !settings.writingAssistanceWords.every((word) => typeof word === "string") ||
    !Array.isArray(settings.writingAssistanceIgnores) ||
    !settings.writingAssistanceIgnores.every((item) => typeof item === "string")
  ) {
    throw new Error("The Writasaurus settings response is invalid.");
  }
  const dailyWritingProgress = parseDailyWritingProgress(progress);
  return {
    version: 1,
    font: settings.font as FontOption,
    wordsPerPage: settings.wordsPerPage as number,
    dailyWordGoal: settings.dailyWordGoal as number,
    dailyWritingProgress,
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
  loadingSettings = fetchSettings().then((settings) => {
    appSettings.value = settings;
    appSettingsError.value = "";
    return settings;
  }).catch((error: unknown) => {
    appSettingsError.value = error instanceof Error ? error.message : "Could not load settings.";
    throw error;
  }).finally(() => {
    loadingSettings = undefined;
  });
  return await loadingSettings;
}

export function updateAppSettings(update: AppSettingsUpdate): Promise<void> {
  const operation = settingsUpdates.then(async () => {
    await loadAppSettings();
    const response = await fetch(SETTINGS_URL, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!response.ok) throw await responseError(response, "Could not save Writasaurus settings");
    appSettings.value = parseAppSettings(await response.json());
    appSettingsError.value = "";
  }).catch((error: unknown) => {
    appSettingsError.value = error instanceof Error ? error.message : "Could not save settings.";
    throw error;
  });
  settingsUpdates = operation.then(() => undefined, () => undefined);
  return operation;
}

export function getFontPreference(): FontOption {
  return appSettings.value?.font ?? DEFAULT_FONT;
}

export function getWordsPerPagePreference(): number {
  return appSettings.value?.wordsPerPage ?? DEFAULT_WORDS_PER_PAGE;
}

export function getDailyWordGoalPreference(): number {
  return appSettings.value?.dailyWordGoal ?? DEFAULT_DAILY_WORD_GOAL;
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

export function saveDailyWordGoalPreference(dailyWordGoal: number): Promise<void> {
  if (!Number.isSafeInteger(dailyWordGoal) || dailyWordGoal < 1) {
    return Promise.reject(new TypeError("Daily word goal must be a positive whole number."));
  }
  return updateAppSettings({ dailyWordGoal });
}

export function getDailyWrittenWords(manuscriptId: string, totalWords: number): number {
  const progress = appSettings.value?.dailyWritingProgress;
  if (!progress || progress.date !== today()) return 0;
  const startingWords = progress.startingWords[manuscriptId];
  return startingWords === undefined ? 0 : Math.max(totalWords - startingWords, 0);
}

export function ensureDailyWritingProgress(
  manuscriptId: string,
  totalWords: number,
): Promise<number> {
  const requestKey = `${today()}:${manuscriptId}`;
  const existing = progressRequests.get(requestKey);
  if (existing) return existing;

  const progress = appSettings.value?.dailyWritingProgress;
  if (progress?.date === today() && progress.startingWords[manuscriptId] !== undefined) {
    return Promise.resolve(getDailyWrittenWords(manuscriptId, totalWords));
  }

  const request = loadAppSettings().then(() =>
    fetch(DAILY_PROGRESS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manuscriptId, totalWords }),
    })
  ).then(async (response) => {
    if (!response.ok) {
      throw await responseError(response, "Could not update daily writing progress");
    }
    const result: unknown = await response.json();
    if (
      typeof result !== "object" || result === null ||
      !("progress" in result) || typeof result.progress !== "object" ||
      result.progress === null || !("date" in result.progress) ||
      typeof result.progress.date !== "string" || !("startingWords" in result.progress) ||
      typeof result.progress.startingWords !== "object" ||
      result.progress.startingWords === null ||
      !("writtenWords" in result) || typeof result.writtenWords !== "number"
    ) {
      throw new Error("The daily writing progress response is invalid.");
    }
    const current = appSettings.value;
    if (current) {
      appSettings.value = {
        ...current,
        dailyWritingProgress: parseDailyWritingProgress(result.progress),
      };
    }
    appSettingsError.value = "";
    return result.writtenWords;
  }).catch((error: unknown) => {
    appSettingsError.value = error instanceof Error
      ? error.message
      : "Could not update daily writing progress.";
    throw error;
  }).finally(() => {
    progressRequests.delete(requestKey);
  });
  progressRequests.set(requestKey, request);
  return request;
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

async function licenseTokenRequest(
  method: "GET" | "PUT" | "DELETE",
  token?: string,
): Promise<string | null> {
  const response = await fetch(LICENSE_TOKEN_URL, {
    method,
    ...(method === "PUT"
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }
      : {}),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new LicenseStorageError(
      (await response.text()).trim() || `Could not access the saved license (${response.status}).`,
    );
  }
  if (method !== "GET") return null;
  const result: unknown = await response.json();
  if (
    typeof result !== "object" || result === null ||
    !("token" in result) || !(result.token === null || typeof result.token === "string")
  ) {
    throw new Error("The saved license response is invalid.");
  }
  return result.token;
}

export function getSavedLicenseToken(): Promise<string | null> {
  return licenseTokenRequest("GET");
}

export async function saveLicenseToken(token: string): Promise<void> {
  await licenseTokenRequest("PUT", token);
}

export async function clearSavedLicenseToken(): Promise<void> {
  await licenseTokenRequest("DELETE");
}

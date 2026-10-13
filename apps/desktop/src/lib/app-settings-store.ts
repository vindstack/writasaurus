import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import {
  DEFAULT_DAILY_WORD_GOAL,
  DEFAULT_FONT,
  DEFAULT_WORDS_PER_PAGE,
  FONT_OPTIONS,
  type FontOption,
} from "../../../../packages/shared/settings.ts";
import { applicationDataDirectory } from "./desktop.ts";
import type { AppSettings, AppSettingsUpdate, DailyWritingProgress } from "./app-settings-types.ts";

interface StoredAppSettings extends AppSettings {
  licenseToken: string | null;
}

const SETTINGS_FILE = "settings.json";
const LICENSE_TOKEN_MAX_LENGTH = 16_384;
const VALID_FONTS = new Set(FONT_OPTIONS.map((option) => option.id));
let writes = Promise.resolve();

function requireDirectory(directory = applicationDataDirectory()): string {
  if (!directory) throw new Error("Could not locate the Writasaurus application data directory.");
  return directory;
}

function settingsPath(directory?: string): string {
  directory = requireDirectory(directory);
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  return `${directory.replace(/[\\/]+$/, "")}${separator}${SETTINGS_FILE}`;
}

function defaultSettings(): StoredAppSettings {
  return {
    version: 1,
    font: DEFAULT_FONT,
    wordsPerPage: DEFAULT_WORDS_PER_PAGE,
    dailyWordGoal: DEFAULT_DAILY_WORD_GOAL,
    dailyWritingProgress: { date: "", startingWords: {} },
    writingAssistanceWords: [],
    writingAssistanceIgnores: [],
    licenseToken: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWordCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Deno.errors.NotFound ||
    typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDailyProgress(value: unknown): value is DailyWritingProgress {
  if (!isRecord(value) || typeof value.date !== "string" || !isRecord(value.startingWords)) {
    return false;
  }
  if (value.date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return false;
  return Object.entries(value.startingWords).every(([key, words]) =>
    key.length > 0 && Number.isSafeInteger(words) && (words as number) >= 0
  );
}

function parseSettings(value: unknown): StoredAppSettings {
  if (
    !isRecord(value) || value.version !== 1 || typeof value.font !== "string" ||
    !VALID_FONTS.has(value.font as FontOption) || !isWordCount(value.wordsPerPage) ||
    !isWordCount(value.dailyWordGoal) || !isDailyProgress(value.dailyWritingProgress) ||
    !isStringList(value.writingAssistanceWords) ||
    !isStringList(value.writingAssistanceIgnores) ||
    !(value.licenseToken === null ||
      typeof value.licenseToken === "string" &&
        value.licenseToken.length <= LICENSE_TOKEN_MAX_LENGTH)
  ) {
    throw new Error("The Writasaurus settings file is invalid.");
  }
  return {
    version: 1,
    font: value.font as FontOption,
    wordsPerPage: value.wordsPerPage,
    dailyWordGoal: value.dailyWordGoal,
    dailyWritingProgress: {
      date: value.dailyWritingProgress.date,
      startingWords: { ...value.dailyWritingProgress.startingWords } as Record<string, number>,
    },
    writingAssistanceWords: [...value.writingAssistanceWords],
    writingAssistanceIgnores: [...value.writingAssistanceIgnores],
    licenseToken: value.licenseToken,
  };
}

async function readStoredSettings(directory?: string): Promise<StoredAppSettings> {
  try {
    return parseSettings(JSON.parse(await Deno.readTextFile(settingsPath(directory))));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return defaultSettings();
    if (error instanceof SyntaxError) {
      throw new Error("The Writasaurus settings file contains invalid JSON.", { cause: error });
    }
    throw error;
  }
}

async function writeStoredSettings(
  settings: StoredAppSettings,
  baseDirectory?: string,
): Promise<void> {
  const directory = requireDirectory(baseDirectory);
  const path = settingsPath(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (Deno.build.os !== "windows") await chmod(directory, 0o700);

  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(settings, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await rename(temporaryPath, path);
    if (Deno.build.os !== "windows") await chmod(path, 0o600);
  } catch (error) {
    try {
      await rm(temporaryPath);
    } catch (cleanupError) {
      if (!isMissingPathError(cleanupError)) {
        console.warn("Could not clean up a temporary Writasaurus settings file.", cleanupError);
      }
    }
    throw error;
  }
}

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writes.then(operation);
  writes = result.then(() => undefined, () => undefined);
  return result;
}

function validateSettingsUpdate(value: unknown): AppSettingsUpdate {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new TypeError("Provide at least one setting to update.");
  }
  const update: AppSettingsUpdate = {};
  for (const [key, field] of Object.entries(value)) {
    switch (key) {
      case "font":
        if (typeof field !== "string" || !VALID_FONTS.has(field as FontOption)) {
          throw new TypeError("Choose a valid editor font.");
        }
        update.font = field as FontOption;
        break;
      case "wordsPerPage":
      case "dailyWordGoal":
        if (!isWordCount(field)) throw new TypeError(`${key} must be a positive whole number.`);
        update[key] = field;
        break;
      case "writingAssistanceWords":
      case "writingAssistanceIgnores":
        if (!isStringList(field)) throw new TypeError(`${key} must be a list of strings.`);
        update[key] = [...new Set(field)];
        break;
      default:
        throw new TypeError(`Unknown setting: ${key}.`);
    }
  }
  return update;
}

export async function getAppSettings(directory?: string): Promise<AppSettings> {
  const { licenseToken: _licenseToken, ...settings } = await readStoredSettings(directory);
  return settings;
}

export async function updateAppSettings(value: unknown, directory?: string): Promise<AppSettings> {
  const update = validateSettingsUpdate(value);
  return await serializeWrite(async () => {
    const current = await readStoredSettings(directory);
    const next = parseSettings({ ...current, ...update });
    await writeStoredSettings(next, directory);
    const { licenseToken: _licenseToken, ...publicSettings } = next;
    return publicSettings;
  });
}

function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export async function getDailyWrittenWords(
  manuscriptId: string,
  totalWords: number,
  directory?: string,
): Promise<{ progress: DailyWritingProgress; writtenWords: number }> {
  if (
    !manuscriptId || manuscriptId.length > 1024 || !Number.isSafeInteger(totalWords) ||
    totalWords < 0
  ) {
    throw new TypeError("Invalid daily writing progress request.");
  }
  return await serializeWrite(async () => {
    const current = await readStoredSettings(directory);
    const date = today();
    const progress = current.dailyWritingProgress.date === date
      ? current.dailyWritingProgress
      : { date, startingWords: {} };
    if (progress.startingWords[manuscriptId] === undefined) {
      progress.startingWords[manuscriptId] = totalWords;
      await writeStoredSettings({ ...current, dailyWritingProgress: progress }, directory);
    }
    return {
      progress,
      writtenWords: Math.max(totalWords - progress.startingWords[manuscriptId], 0),
    };
  });
}

export async function getLicenseToken(directory?: string): Promise<string | null> {
  return (await readStoredSettings(directory)).licenseToken;
}

export async function setLicenseToken(token: unknown, directory?: string): Promise<void> {
  if (typeof token !== "string" || token.length === 0 || token.length > LICENSE_TOKEN_MAX_LENGTH) {
    throw new TypeError("Invalid license token.");
  }
  await serializeWrite(async () => {
    const current = await readStoredSettings(directory);
    await writeStoredSettings({ ...current, licenseToken: token }, directory);
  });
}

export async function clearLicenseToken(directory?: string): Promise<void> {
  await serializeWrite(async () => {
    const current = await readStoredSettings(directory);
    await writeStoredSettings({ ...current, licenseToken: null }, directory);
  });
}

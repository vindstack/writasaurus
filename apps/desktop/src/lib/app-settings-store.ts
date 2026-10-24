import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import {
  DEFAULT_DAILY_WORD_GOAL,
  DEFAULT_FONT,
  DEFAULT_WORDS_PER_PAGE,
  FONT_OPTIONS,
  type FontOption,
} from "../../../../packages/shared/settings.ts";
import { applicationDataDirectory } from "./desktop.ts";
import type { AppSettings, AppSettingsUpdate } from "./app-settings-types.ts";

const SETTINGS_FILE = "settings.json";
const VALID_FONTS = new Set(FONT_OPTIONS.map((option) => option.id));
let writes = Promise.resolve();

function requireDirectory(directory = applicationDataDirectory()): string {
  if (!directory) throw new Error("Could not locate the Writasaurus application data directory.");
  return directory;
}

function settingsPath(directory?: string): string {
  directory = requireDirectory(directory);
  const separator = process.platform === "win32" ? "\\" : "/";
  return `${directory.replace(/[\\/]+$/, "")}${separator}${SETTINGS_FILE}`;
}

function defaultSettings(): AppSettings {
  return {
    version: 1,
    font: DEFAULT_FONT,
    wordsPerPage: DEFAULT_WORDS_PER_PAGE,
    writingAssistanceWords: [],
    writingAssistanceIgnores: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWordCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseSettings(value: unknown): AppSettings {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.font !== "string" ||
    !VALID_FONTS.has(value.font as FontOption) ||
    !isWordCount(value.wordsPerPage) ||
    !isStringList(value.writingAssistanceWords) ||
    !isStringList(value.writingAssistanceIgnores)
  ) {
    throw new Error("The Writasaurus settings file is invalid.");
  }
  return {
    version: 1,
    font: value.font as FontOption,
    wordsPerPage: value.wordsPerPage,
    writingAssistanceWords: [...value.writingAssistanceWords],
    writingAssistanceIgnores: [...value.writingAssistanceIgnores],
  };
}

async function readStoredSettings(directory?: string): Promise<AppSettings> {
  try {
    const stored: unknown = JSON.parse(await readFile(settingsPath(directory), "utf8"));
    const settings = parseSettings(stored);
    if (isRecord(stored) && "licenseToken" in stored) {
      await writeStoredSettings(settings, directory);
    }
    return settings;
  } catch (error) {
    if (isMissingPathError(error)) return defaultSettings();
    if (error instanceof SyntaxError) {
      throw new Error("The Writasaurus settings file contains invalid JSON.", { cause: error });
    }
    throw error;
  }
}

async function writeStoredSettings(settings: AppSettings, baseDirectory?: string): Promise<void> {
  const directory = requireDirectory(baseDirectory);
  const path = settingsPath(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);

  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
    if (process.platform !== "win32") await chmod(path, 0o600);
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
  writes = result.then(
    () => undefined,
    () => undefined,
  );
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
  return await readStoredSettings(directory);
}

export async function updateAppSettings(value: unknown, directory?: string): Promise<AppSettings> {
  const update = validateSettingsUpdate(value);
  return await serializeWrite(async () => {
    const current = await readStoredSettings(directory);
    const next = parseSettings({ ...current, ...update });
    await writeStoredSettings(next, directory);
    return next;
  });
}

export interface LegacyDailySettings {
  dailyWordGoal: number;
  dailyWritingProgress: { date: string; startingWords: Record<string, number> };
}

export async function getLegacyDailySettings(directory?: string): Promise<LegacyDailySettings> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(settingsPath(directory), "utf8"));
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        dailyWordGoal: DEFAULT_DAILY_WORD_GOAL,
        dailyWritingProgress: { date: "", startingWords: {} },
      };
    }
    if (error instanceof SyntaxError) {
      throw new Error("The Writasaurus settings file contains invalid JSON.", { cause: error });
    }
    throw error;
  }
  if (!isRecord(value)) {
    throw new Error("The Writasaurus settings file is invalid.");
  }

  const dailyWordGoal = isWordCount(value.dailyWordGoal)
    ? value.dailyWordGoal
    : DEFAULT_DAILY_WORD_GOAL;
  const progressValue = value.dailyWritingProgress;
  const progressRecord = isRecord(progressValue) ? progressValue : null;
  const startingWords =
    progressRecord && isRecord(progressRecord.startingWords) ? progressRecord.startingWords : null;
  const validProgress =
    progressRecord !== null &&
    typeof progressRecord.date === "string" &&
    (progressRecord.date === "" || /^\d{4}-\d{2}-\d{2}$/.test(progressRecord.date)) &&
    startingWords !== null &&
    Object.entries(startingWords).every(
      ([key, words]) => key.length > 0 && Number.isSafeInteger(words) && (words as number) >= 0,
    );
  return {
    dailyWordGoal,
    dailyWritingProgress:
      validProgress && progressRecord && startingWords
        ? {
            date: typeof progressRecord.date === "string" ? progressRecord.date : "",
            startingWords: { ...startingWords } as Record<string, number>,
          }
        : { date: "", startingWords: {} },
  };
}

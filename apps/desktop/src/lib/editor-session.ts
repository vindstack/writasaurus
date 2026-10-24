import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { clearLastFilePath, loadLastFilePath, saveLastFilePath } from "./desktop.ts";
import { blankManuscript } from "./editor/data.ts";
import { epubFilename, generateEpub, isEpubFilename, parseEpub } from "./epub.ts";
import { DEFAULT_OUTLINE } from "./editor/outline-templates.ts";
import type { Manuscript } from "./editor/types.ts";
import { basename } from "../../../../packages/shared/path.ts";
import { getLegacyDailySettings } from "./app-settings-store.ts";

/**
 * Server-side state for the Desktop app: the manuscript file currently open on disk.
 * It lives for the lifetime of the server process.
 */
const state = { activePath: null as string | null, restoredLastFile: false };
let pendingProjectPath: string | null = null;
let pendingProjectParentPath: string | null = null;

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function getActivePath(): string | null {
  return state.activePath;
}

function activeOutlinePath(): string {
  const activePath = state.activePath;
  if (!activePath || !isEpubFilename(activePath)) {
    throw new Error("Open a project before using Outline.");
  }
  const separator = Math.max(activePath.lastIndexOf("/"), activePath.lastIndexOf("\\"));
  if (separator < 0) throw new Error("The active manuscript has no project directory.");
  const directory = separator === 0 ? "" : activePath.slice(0, separator);
  const pathSeparator = activePath[separator];
  return `${directory}${pathSeparator}Outline.md`;
}

export async function setActivePath(path: string): Promise<void> {
  state.activePath = path;
  await saveLastFilePath(path);
}

export async function closeActiveFile(): Promise<void> {
  state.activePath = null;
  state.restoredLastFile = true;
  await clearLastFilePath();
}

/** Describes the active file and restores the last-opened file on the first call. */
export async function editorStatus() {
  if (state.activePath && !isEpubFilename(state.activePath)) {
    state.activePath = null;
    await clearLastFilePath();
  }

  if (!state.activePath && !state.restoredLastFile) {
    state.restoredLastFile = true;
    const lastPath = await loadLastFilePath();
    if (lastPath && isEpubFilename(lastPath)) {
      state.activePath = lastPath;
    } else if (lastPath) {
      await clearLastFilePath();
    }
  }

  const activePath = state.activePath;
  if (activePath) {
    try {
      const directory = projectDirectory(activePath);
      const drafts = directory ? await projectDrafts(directory) : [];
      const latest = latestDraft(drafts);
      const path = latest && directory ? draftPath(directory, latest.filename) : activePath;
      if (path !== activePath) await setActivePath(path);
      const bytes = await readFile(path);
      const manuscript = await parseEpub(bytes, basename(path));
      return { activeFile: basename(path), activePath: path, manuscript };
    } catch (error) {
      console.warn("Could not read the active file.", error);
      state.activePath = null;
      await clearLastFilePath();
    }
  }

  return {
    activeFile: state.activePath ? basename(state.activePath) : null,
    activePath: state.activePath,
  };
}

export function suggestedName(manuscript: Manuscript, filename: unknown): string {
  return epubFilename({
    ...manuscript,
    filename:
      typeof filename === "string" && filename.trim() ? basename(filename) : manuscript.filename,
  });
}

export async function writeManuscript(path: string, manuscript: Manuscript): Promise<void> {
  await writeFile(path, await generateEpub(manuscript));
}

export async function loadOrCreateOutline(): Promise<string> {
  const path = activeOutlinePath();
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) throw error;
  }

  try {
    await writeFile(path, DEFAULT_OUTLINE, { flag: "wx" });
    return DEFAULT_OUTLINE;
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) return await readFile(path, "utf8");
    throw error;
  }
}

export async function writeOutline(content: string): Promise<void> {
  await writeFile(activeOutlinePath(), content);
}

export interface DraftSummary {
  number: number;
  filename: string;
}

export const DEFAULT_MANUSCRIPT_WORD_GOAL = 80_000;

export interface DailyWritingHistoryEntry {
  date: string;
  words: number;
  goal: number;
}

export interface ProjectDailyWritingProgress {
  date: string;
  startingWords: Record<string, number>;
}

export interface ProjectUserSettings {
  manuscriptWordGoal: number;
  dailyWordGoal: number;
  dailyWritingProgress: ProjectDailyWritingProgress;
  dailyWritingHistory: DailyWritingHistoryEntry[];
  dailyWritingTrackingStarted: string;
}

export interface ProjectSettings {
  drafts: DraftSummary[];
  user_settings: ProjectUserSettings;
}

const PROJECT_SETTINGS_FILENAME = "settings.json";

function draftNumber(filename: string): number | null {
  const match = filename.match(/^draft_(\d+)\.epub$/i);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function draftPath(directory: string, filename: string): string {
  return projectFilePath(directory, filename);
}

function projectFilePath(projectPath: string, filename: string): string {
  const trimmedPath = projectPath.replace(/[\\/]+$/, "");
  const separator = process.platform === "win32" ? "\\" : "/";
  return `${trimmedPath}${separator}${filename}`;
}

function projectDirectory(path: string): string | null {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator < 0 ? null : path.slice(0, separator) || path[separator] || "";
}

async function numberedDrafts(directory: string): Promise<DraftSummary[]> {
  const drafts: DraftSummary[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const number = draftNumber(entry.name);
    if (number !== null) drafts.push({ number, filename: entry.name });
  }
  return drafts.sort((left, right) => left.number - right.number);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  const [year, month, day] = value.split("-").map(Number);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

async function newProjectUserSettings(): Promise<ProjectUserSettings> {
  return {
    manuscriptWordGoal: DEFAULT_MANUSCRIPT_WORD_GOAL,
    dailyWordGoal: (await getLegacyDailySettings()).dailyWordGoal,
    dailyWritingProgress: { date: "", startingWords: {} },
    dailyWritingHistory: [],
    dailyWritingTrackingStarted: today(),
  };
}

function trimHistory(history: DailyWritingHistoryEntry[], referenceDate = today()) {
  const cutoff = new Date(`${referenceDate}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - 29);
  const minimumDate = [
    cutoff.getFullYear(),
    String(cutoff.getMonth() + 1).padStart(2, "0"),
    String(cutoff.getDate()).padStart(2, "0"),
  ].join("-");
  return history
    .filter((entry) => entry.date >= minimumDate)
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function parseProjectSettings(source: string): Promise<ProjectSettings> {
  const parsed: unknown = JSON.parse(source);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("drafts" in parsed) ||
    !Array.isArray(parsed.drafts)
  ) {
    throw new Error("The project settings file is invalid.");
  }
  const drafts: DraftSummary[] = [];
  const numbers = new Set<number>();
  for (const item of parsed.drafts) {
    if (
      !item ||
      typeof item !== "object" ||
      !("number" in item) ||
      !Number.isSafeInteger(item.number) ||
      item.number < 1 ||
      !("filename" in item) ||
      typeof item.filename !== "string" ||
      draftNumber(item.filename) !== item.number ||
      numbers.has(item.number)
    ) {
      throw new Error("The project settings file contains an invalid draft entry.");
    }
    numbers.add(item.number);
    drafts.push({ number: item.number, filename: item.filename });
  }
  const userSettings = "user_settings" in parsed ? parsed.user_settings : {};
  const manuscriptWordGoal =
    userSettings &&
    typeof userSettings === "object" &&
    !Array.isArray(userSettings) &&
    "manuscriptWordGoal" in userSettings
      ? userSettings.manuscriptWordGoal
      : DEFAULT_MANUSCRIPT_WORD_GOAL;
  const dailyWordGoal =
    userSettings &&
    typeof userSettings === "object" &&
    !Array.isArray(userSettings) &&
    "dailyWordGoal" in userSettings
      ? userSettings.dailyWordGoal
      : (await getLegacyDailySettings()).dailyWordGoal;
  const dailyWritingProgress =
    userSettings &&
    typeof userSettings === "object" &&
    !Array.isArray(userSettings) &&
    "dailyWritingProgress" in userSettings
      ? userSettings.dailyWritingProgress
      : { date: "", startingWords: {} };
  const dailyWritingHistory =
    userSettings &&
    typeof userSettings === "object" &&
    !Array.isArray(userSettings) &&
    "dailyWritingHistory" in userSettings
      ? userSettings.dailyWritingHistory
      : [];
  const dailyWritingTrackingStarted =
    userSettings &&
    typeof userSettings === "object" &&
    !Array.isArray(userSettings) &&
    "dailyWritingTrackingStarted" in userSettings
      ? userSettings.dailyWritingTrackingStarted
      : today();
  if (
    !userSettings ||
    typeof userSettings !== "object" ||
    Array.isArray(userSettings) ||
    typeof manuscriptWordGoal !== "number" ||
    !Number.isSafeInteger(manuscriptWordGoal) ||
    manuscriptWordGoal < 1 ||
    typeof dailyWordGoal !== "number" ||
    !Number.isSafeInteger(dailyWordGoal) ||
    dailyWordGoal < 1 ||
    !dailyWritingProgress ||
    typeof dailyWritingProgress !== "object" ||
    Array.isArray(dailyWritingProgress) ||
    !("date" in dailyWritingProgress) ||
    typeof dailyWritingProgress.date !== "string" ||
    (dailyWritingProgress.date !== "" && !isDate(dailyWritingProgress.date)) ||
    !("startingWords" in dailyWritingProgress) ||
    !dailyWritingProgress.startingWords ||
    typeof dailyWritingProgress.startingWords !== "object" ||
    Array.isArray(dailyWritingProgress.startingWords) ||
    !Object.entries(dailyWritingProgress.startingWords).every(
      ([key, words]) => key.length > 0 && Number.isSafeInteger(words) && (words as number) >= 0,
    ) ||
    !Array.isArray(dailyWritingHistory) ||
    !dailyWritingHistory.every(
      (entry) =>
        !!entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        "date" in entry &&
        isDate(entry.date) &&
        "words" in entry &&
        Number.isSafeInteger(entry.words) &&
        entry.words >= 0 &&
        "goal" in entry &&
        Number.isSafeInteger(entry.goal) &&
        entry.goal >= 1,
    ) ||
    new Set(dailyWritingHistory.map((entry) => entry.date)).size !== dailyWritingHistory.length ||
    !isDate(dailyWritingTrackingStarted)
  ) {
    throw new Error("The project settings file contains invalid user settings.");
  }
  return {
    drafts: drafts.sort((left, right) => left.number - right.number),
    user_settings: {
      manuscriptWordGoal,
      dailyWordGoal,
      dailyWritingProgress: {
        date: dailyWritingProgress.date,
        startingWords: { ...dailyWritingProgress.startingWords } as Record<string, number>,
      },
      dailyWritingHistory: trimHistory(dailyWritingHistory),
      dailyWritingTrackingStarted,
    },
  };
}

async function saveProjectSettings(directory: string, settings: ProjectSettings): Promise<void> {
  const path = draftPath(directory, PROJECT_SETTINGS_FILENAME);
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function readProjectSettings(directory: string): Promise<ProjectSettings> {
  const path = draftPath(directory, PROJECT_SETTINGS_FILENAME);
  try {
    const source = await readFile(path, "utf8");
    const settings = await parseProjectSettings(source);
    const stored: unknown = JSON.parse(source);
    const userSettings =
      typeof stored === "object" &&
      stored !== null &&
      "user_settings" in stored &&
      stored.user_settings &&
      typeof stored.user_settings === "object"
        ? (stored.user_settings as Record<string, unknown>)
        : {};
    if (
      [
        "manuscriptWordGoal",
        "dailyWordGoal",
        "dailyWritingProgress",
        "dailyWritingHistory",
        "dailyWritingTrackingStarted",
      ].some((key) => !(key in userSettings)) ||
      settings.user_settings.dailyWritingHistory.length !==
        ("dailyWritingHistory" in userSettings && Array.isArray(userSettings.dailyWritingHistory)
          ? userSettings.dailyWritingHistory.length
          : 0)
    ) {
      await saveProjectSettings(directory, settings);
    }
    return settings;
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) throw error;
  }

  const settings = {
    drafts: await numberedDrafts(directory),
    user_settings: await newProjectUserSettings(),
  };
  await saveProjectSettings(directory, settings);
  return settings;
}

export async function getProjectSettings(directory: string): Promise<ProjectSettings> {
  return await readProjectSettings(directory);
}

export async function updateProjectSettings(
  update: unknown,
  directory: string,
): Promise<ProjectSettings> {
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    throw new TypeError("Provide project settings to update.");
  }
  const fields = Object.keys(update);
  if (
    !fields.length ||
    fields.some((key) => key !== "manuscriptWordGoal" && key !== "dailyWordGoal")
  ) {
    throw new TypeError("Provide valid project settings to update.");
  }
  for (const key of fields) {
    const value = update[key as keyof typeof update];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`${key} must be a positive whole number.`);
    }
  }
  const current = await readProjectSettings(directory);
  const settings = {
    ...current,
    user_settings: { ...current.user_settings, ...update },
  };
  await saveProjectSettings(directory, settings);
  return settings;
}

export interface ActiveProjectDetails {
  settings: ProjectSettings;
  manuscript: {
    id: string;
    title: string;
    totalWords: number;
  };
}

export async function getActiveProjectDetails(): Promise<ActiveProjectDetails | null> {
  const activePath = state.activePath;
  const directory = activePath && isEpubFilename(activePath) ? projectDirectory(activePath) : null;
  if (!activePath || !directory) return null;

  const settings = await getProjectSettings(directory);
  const activeManuscript = await parseEpub(await readFile(activePath), basename(activePath));
  return {
    settings,
    manuscript: {
      id: String(activeManuscript.frontmatter.writasaurusId ?? activeManuscript.filename),
      title: String(activeManuscript.frontmatter.title ?? "Untitled Manuscript"),
      totalWords: activeManuscript.chapters.reduce((total, item) => total + item.wordCount, 0),
    },
  };
}

export async function updateActiveProjectSettings(
  update: unknown,
): Promise<ProjectSettings | null> {
  const activePath = state.activePath;
  const directory = activePath && isEpubFilename(activePath) ? projectDirectory(activePath) : null;
  if (!directory) return null;
  return await updateProjectSettings(update, directory);
}

export async function recordActiveProjectDailyProgress(
  manuscriptId: string,
  totalWords: number,
): Promise<{
  progress: ProjectDailyWritingProgress;
  writtenWords: number;
  dailyWordGoal: number;
  history: DailyWritingHistoryEntry[];
} | null> {
  if (
    !manuscriptId ||
    manuscriptId.length > 1024 ||
    !Number.isSafeInteger(totalWords) ||
    totalWords < 0
  ) {
    throw new TypeError("Invalid daily writing progress request.");
  }
  const activePath = state.activePath;
  const directory = activePath && isEpubFilename(activePath) ? projectDirectory(activePath) : null;
  if (!directory) return null;

  const settings = await getProjectSettings(directory);
  const date = today();
  const progress =
    settings.user_settings.dailyWritingProgress.date === date
      ? settings.user_settings.dailyWritingProgress
      : { date, startingWords: {} };
  if (progress.startingWords[manuscriptId] === undefined) {
    const legacy = await getLegacyDailySettings();
    const legacyStart =
      legacy.dailyWritingProgress.date === date
        ? legacy.dailyWritingProgress.startingWords[manuscriptId]
        : undefined;
    progress.startingWords[manuscriptId] = legacyStart ?? totalWords;
  }
  const writtenWords = Math.max(totalWords - progress.startingWords[manuscriptId], 0);
  const history = [...settings.user_settings.dailyWritingHistory];
  const todayEntry = history.find((entry) => entry.date === date);
  if (todayEntry) {
    todayEntry.words = Math.max(todayEntry.words, writtenWords);
    todayEntry.goal = settings.user_settings.dailyWordGoal;
  } else {
    history.push({
      date,
      words: writtenWords,
      goal: settings.user_settings.dailyWordGoal,
    });
  }
  const trimmedHistory = trimHistory(history);
  const next: ProjectSettings = {
    ...settings,
    user_settings: {
      ...settings.user_settings,
      dailyWritingProgress: progress,
      dailyWritingHistory: trimmedHistory,
    },
  };
  await saveProjectSettings(directory, next);
  return {
    progress,
    writtenWords,
    dailyWordGoal: next.user_settings.dailyWordGoal,
    history: trimmedHistory,
  };
}

async function projectDrafts(directory: string): Promise<DraftSummary[]> {
  return (await readProjectSettings(directory)).drafts;
}

function latestDraft(drafts: DraftSummary[]): DraftSummary | null {
  return drafts.reduce<DraftSummary | null>(
    (latest, draft) => (!latest || draft.number > latest.number ? draft : latest),
    null,
  );
}

export async function listDrafts(): Promise<{ drafts: DraftSummary[]; activeDraft: number }> {
  const activePath = state.activePath;
  if (!activePath) return { drafts: [], activeDraft: 1 };
  const directory = projectDirectory(activePath);
  if (directory === null) {
    return { drafts: [{ number: 1, filename: basename(activePath) }], activeDraft: 1 };
  }
  const drafts = await projectDrafts(directory);
  if (drafts.length) {
    const activeNumber = draftNumber(basename(activePath));
    return {
      drafts,
      activeDraft:
        activeNumber && drafts.some((draft) => draft.number === activeNumber)
          ? activeNumber
          : latestDraft(drafts)!.number,
    };
  }
  throw new Error("The project does not have a draft.");
}

export async function selectDraft(number: number): Promise<Manuscript> {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("Invalid draft number.");
  const activePath = state.activePath;
  if (!activePath) throw new Error("Open a project before selecting a draft.");
  const directory = projectDirectory(activePath);
  if (directory === null) throw new Error("The active manuscript has no project directory.");

  const drafts = await projectDrafts(directory);
  const filename = drafts.find((draft) => draft.number === number)?.filename;
  if (!filename) throw new Error(`Draft ${number} was not found.`);

  const path = draftPath(directory, filename);
  const manuscript = await parseEpub(await readFile(path), filename);
  await setActivePath(path);
  return manuscript;
}

export async function createDraft(
  mode: "blank" | "copy",
  sourceDraft: number,
): Promise<{ manuscript: Manuscript; drafts: DraftSummary[]; activeDraft: number }> {
  const activePath = state.activePath;
  if (!activePath) throw new Error("Open a project before creating a draft.");
  const directory = projectDirectory(activePath);
  if (directory === null) throw new Error("The active manuscript has no project directory.");

  const currentSettings = await getProjectSettings(directory);
  let drafts = currentSettings.drafts;
  if (!drafts.length) throw new Error("The project does not have a draft to copy.");

  const latestNumber = latestDraft(drafts)!.number;
  const number = latestNumber + 1;
  if (!Number.isSafeInteger(number)) throw new Error("No more draft numbers are available.");

  const sourceFilename = drafts.find((draft) => draft.number === sourceDraft)?.filename;
  if (mode === "copy" && !sourceFilename) throw new Error(`Draft ${sourceDraft} was not found.`);
  const sourcePath =
    mode === "copy" && sourceFilename ? draftPath(directory, sourceFilename) : activePath;
  const source = await parseEpub(await readFile(sourcePath), basename(sourcePath));
  const filename = `draft_${number}.epub`;
  const next: Manuscript =
    mode === "copy"
      ? { ...source, filename }
      : {
          ...blankManuscript(String(source.frontmatter.title ?? "Untitled Manuscript")),
          filename,
          frontmatter: {
            ...source.frontmatter,
            writasaurusId: crypto.randomUUID(),
            updatedAt: new Date().toISOString(),
          },
        };

  if (mode === "copy") {
    next.frontmatter = { ...next.frontmatter, writasaurusId: crypto.randomUUID() };
  }

  await writeFile(draftPath(directory, filename), await generateEpub(next), {
    flag: "wx",
  });
  drafts = [...drafts, { number, filename }];
  try {
    await saveProjectSettings(directory, { ...currentSettings, drafts });
  } catch (error) {
    await rm(draftPath(directory, filename));
    throw error;
  }
  const path = draftPath(directory, filename);
  await setActivePath(path);
  return { manuscript: next, drafts, activeDraft: number };
}

export async function projectEpubPath(projectPath: string): Promise<string | null> {
  const drafts = await projectDrafts(projectPath);
  const latest = latestDraft(drafts);
  return latest ? draftPath(projectPath, latest.filename) : null;
}

export async function openProject(projectPath: string): Promise<Manuscript | null> {
  pendingProjectPath = null;
  const epubPath = await projectEpubPath(projectPath);
  if (!epubPath) {
    pendingProjectPath = projectPath;
    return null;
  }

  const parsed = await parseEpub(await readFile(epubPath), basename(epubPath));
  await setActivePath(epubPath);
  return parsed;
}

export async function createProjectEpub(projectPath = pendingProjectPath): Promise<Manuscript> {
  if (!projectPath) throw new Error("No project folder is waiting for an EPUB.");

  const projectName = basename(projectPath) || "Untitled Manuscript";
  const manuscript = { ...blankManuscript(projectName), filename: "draft_1.epub" };
  const epubPath = projectFilePath(projectPath, epubFilename(manuscript));
  await writeFile(epubPath, await generateEpub(manuscript), { flag: "wx" });
  await saveProjectSettings(projectPath, {
    drafts: [{ number: 1, filename: "draft_1.epub" }],
    user_settings: await newProjectUserSettings(),
  });
  await setActivePath(epubPath);
  pendingProjectPath = null;
  return manuscript;
}

export async function createProject(projectName: string): Promise<Manuscript> {
  const name = projectName.trim();
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new Error("Enter a valid project folder name without path separators.");
  }
  if (!pendingProjectParentPath) {
    throw new Error("Choose a parent folder before creating the project.");
  }

  const projectPath = projectFilePath(pendingProjectParentPath, name);
  const manuscript = { ...blankManuscript(name), filename: "draft_1.epub" };
  const epubPath = projectFilePath(projectPath, epubFilename(manuscript));
  const epub = await generateEpub(manuscript);
  await mkdir(projectPath);
  await writeFile(epubPath, epub, { flag: "wx" });
  await saveProjectSettings(projectPath, {
    drafts: [{ number: 1, filename: "draft_1.epub" }],
    user_settings: await newProjectUserSettings(),
  });
  await setActivePath(epubPath);
  pendingProjectPath = null;
  pendingProjectParentPath = null;
  return manuscript;
}

export function setPendingProjectParentPath(path: string): void {
  pendingProjectParentPath = path;
}

export function hasPendingProjectParentPath(): boolean {
  return pendingProjectParentPath !== null;
}

export function cancelPendingProject(): void {
  pendingProjectPath = null;
  pendingProjectParentPath = null;
}

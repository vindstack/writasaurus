import {
  createFile,
  createFolder,
  ensurePermission,
  exists,
  forgetFolder,
  listFiles,
  loadRememberedFolderData,
  pickEpubFile as pickEpubDestination,
  pickFolder,
  queryPermission,
  readBytes,
  readText,
  rememberFolderData,
  writeFile,
  writeExistingFile,
  writeFileHandle,
  type FolderHandle,
} from "@writasaurus/fs";
import { blankManuscript } from "./editor/data.ts";
import { epubFilename, generateEpub, isEpubFilename, parseEpub } from "./epub.ts";
import { DEFAULT_OUTLINE } from "./editor/outline-templates.ts";
import type { Manuscript } from "./editor/types.ts";
import { basename } from "../../../../packages/shared/path.ts";
import { DEFAULT_DAILY_WORD_GOAL } from "../../../../packages/shared/settings.ts";

const PROJECT_KEY = "editor-project";
interface RememberedProject {
  filename: string;
  projectId?: string;
}

export interface ProjectIdentity {
  id: string;
  name: string;
  filename: string;
}

const state: {
  folder: FolderHandle | null;
  filename: string | null;
  projectId: string | null;
} = {
  folder: null,
  filename: null,
  projectId: null,
};
let pendingProject: FolderHandle | null = null;
let pendingProjectParent: FolderHandle | null = null;
let projectWrites = Promise.resolve();

function serializeProjectWrite<T>(operation: () => Promise<T>): Promise<T> {
  const run = () =>
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request("writasaurus-project-write", operation)
      : operation();
  const result = projectWrites.then(run);
  projectWrites = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "NotFoundError"
  );
}

function activeFolder(): FolderHandle {
  if (!state.folder || !state.filename) throw new Error("Open a project first.");
  return state.folder;
}

async function readManuscript(folder: FolderHandle, filename: string): Promise<Manuscript> {
  return await parseEpub(new Uint8Array(await readBytes(folder, filename)), filename);
}

export function getActiveFolder(): FolderHandle | null {
  return state.folder;
}

/** Returns the active draft's filename, not a filesystem path. */
export function getActivePath(): string | null {
  return state.filename;
}

export function getProjectIdentity(): ProjectIdentity | null {
  if (!state.folder || !state.filename || !state.projectId) return null;
  return { id: state.projectId, name: state.folder.name, filename: state.filename };
}

async function setActiveProject(folder: FolderHandle, filename: string): Promise<void> {
  const saved = await loadRememberedFolderData<RememberedProject>(PROJECT_KEY);
  const projectId =
    saved?.data?.projectId && (await folder.isSameEntry(saved.folder))
      ? saved.data.projectId
      : crypto.randomUUID();
  await rememberFolderData(folder, { filename, projectId }, PROJECT_KEY);
  state.folder = folder;
  state.filename = filename;
  state.projectId = projectId;
}

export async function setActivePath(filename: string): Promise<void> {
  const folder = activeFolder();
  if (!isEpubFilename(filename) || basename(filename) !== filename) {
    throw new TypeError("Provide a draft filename.");
  }
  await readBytes(folder, filename);
  await setActiveProject(folder, filename);
}

export async function closeActiveFile(): Promise<void> {
  await forgetFolder(PROJECT_KEY);
  detachActiveProject();
  cancelPendingProject();
}

/** Detaches in-memory state without forgetting the folder, for offline recovery. */
export function detachActiveProject(): void {
  state.folder = null;
  state.filename = null;
  state.projectId = null;
}

export type RestoreProjectResult =
  | { status: "none" }
  | {
      status: "permission";
      permission: PermissionState;
      folder: FolderHandle;
      identity: ProjectIdentity;
    }
  | {
      status: "restored";
      manuscript: Manuscript;
      folder: FolderHandle;
      identity: ProjectIdentity;
    };

/** Call directly from the permission button's user gesture, then retry restoreProject(). */
export async function requestProjectPermission(folder: FolderHandle): Promise<boolean> {
  if (typeof folder.requestPermission !== "function") return true;
  return (await folder.requestPermission({ mode: "readwrite" })) === "granted";
}

/** Pass requestPermission only from a user gesture; denied handles remain remembered. */
export async function restoreProject(requestPermission = false): Promise<RestoreProjectResult> {
  const saved = await loadRememberedFolderData<RememberedProject>(PROJECT_KEY);
  if (!saved) return { status: "none" };
  const { folder, data } = saved;
  if (
    !folder ||
    !data ||
    typeof data.filename !== "string" ||
    basename(data.filename) !== data.filename ||
    !isEpubFilename(data.filename)
  ) {
    throw new Error("The remembered project is invalid.");
  }
  const projectId =
    typeof data.projectId === "string" && data.projectId ? data.projectId : crypto.randomUUID();
  if (projectId !== data.projectId) {
    await rememberFolderData(folder, { filename: data.filename, projectId }, PROJECT_KEY);
  }
  const identity = { id: projectId, name: folder.name, filename: data.filename };
  let permission = await queryPermission(folder);
  if (permission !== "granted" && requestPermission) {
    permission = (await ensurePermission(folder)) ? "granted" : await queryPermission(folder);
  }
  if (permission !== "granted") return { status: "permission", permission, folder, identity };
  const manuscript = await readManuscript(folder, data.filename);
  state.folder = folder;
  state.filename = data.filename;
  state.projectId = projectId;
  return { status: "restored", manuscript, folder, identity };
}

export async function editorStatus() {
  const folder = state.folder;
  const filename = state.filename;
  if (!folder || !filename) return { activeFile: null, activePath: null };
  const manuscript = await readManuscript(folder, filename);
  return { activeFile: filename, activePath: filename, manuscript };
}

export function suggestedName(manuscript: Manuscript, filename: unknown): string {
  return epubFilename({
    ...manuscript,
    filename:
      typeof filename === "string" && filename.trim() ? basename(filename) : manuscript.filename,
  });
}

/** Call directly from a user gesture, before saving or generating the EPUB. */
export function pickEpubFile(filename: string): Promise<FileSystemFileHandle | null> {
  return pickEpubDestination(filename);
}

export async function exportEpub(
  handle: FileSystemFileHandle,
  manuscript: Manuscript,
): Promise<void> {
  await writeFileHandle(handle, new Uint8Array(await generateEpub(manuscript)));
}

export async function writeManuscript(
  folder: FolderHandle,
  filename: string,
  manuscript: Manuscript,
): Promise<void> {
  if (!isEpubFilename(filename) || basename(filename) !== filename)
    throw new TypeError("Invalid EPUB filename.");
  await writeExistingFile(folder, filename, new Uint8Array(await generateEpub(manuscript)));
}

export async function saveCurrentManuscript(manuscript: Manuscript): Promise<void> {
  const folder = activeFolder();
  await writeManuscript(folder, state.filename!, manuscript);
}

/** Creates an EPUB without intentionally overwriting an existing entry. */
export async function createManuscript(
  folder: FolderHandle,
  filename: string,
  manuscript: Manuscript,
): Promise<void> {
  if (!isEpubFilename(filename) || basename(filename) !== filename)
    throw new TypeError("Invalid EPUB filename.");
  await createFile(folder, filename, new Uint8Array(await generateEpub(manuscript)));
}

export async function loadOrCreateOutline(): Promise<string> {
  const folder = activeFolder();
  try {
    return await readText(folder, "Outline.md");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }

  try {
    await createFile(folder, "Outline.md", DEFAULT_OUTLINE);
    return DEFAULT_OUTLINE;
  } catch (error) {
    if (error instanceof DOMException && error.name === "InvalidModificationError") {
      return await readText(folder, "Outline.md");
    }
    throw error;
  }
}

export async function writeOutline(content: string): Promise<void> {
  await writeFile(activeFolder(), "Outline.md", content);
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

async function numberedDrafts(directory: FolderHandle): Promise<DraftSummary[]> {
  const drafts: DraftSummary[] = [];
  for (const entry of await listFiles(directory)) {
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
    dailyWordGoal: DEFAULT_DAILY_WORD_GOAL,
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
      : DEFAULT_DAILY_WORD_GOAL;
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

async function saveProjectSettings(
  directory: FolderHandle,
  settings: ProjectSettings,
): Promise<void> {
  const content = `${JSON.stringify(settings, null, 2)}\n`;
  if (await exists(directory, PROJECT_SETTINGS_FILENAME)) {
    await writeExistingFile(directory, PROJECT_SETTINGS_FILENAME, content);
  } else {
    await createFile(directory, PROJECT_SETTINGS_FILENAME, content);
  }
}

async function readProjectSettings(directory: FolderHandle): Promise<ProjectSettings> {
  let source: string;
  try {
    source = await readText(directory, PROJECT_SETTINGS_FILENAME);
  } catch (error) {
    if (!isMissing(error)) throw error;
    return {
      drafts: await numberedDrafts(directory),
      user_settings: await newProjectUserSettings(),
    };
  }
  return await parseProjectSettings(source);
}

export async function getProjectSettings(directory: FolderHandle): Promise<ProjectSettings> {
  return await readProjectSettings(directory);
}

export async function updateProjectSettings(
  update: unknown,
  directory: FolderHandle,
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
  return await serializeProjectWrite(async () => {
    const current = await readProjectSettings(directory);
    const settings = {
      ...current,
      user_settings: { ...current.user_settings, ...update },
    };
    await saveProjectSettings(directory, settings);
    return settings;
  });
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
  const filename = state.filename;
  const directory = state.folder;
  if (!filename || !directory) return null;

  const settings = await getProjectSettings(directory);
  const activeManuscript = await readManuscript(directory, filename);
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
  const directory = state.folder;
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
  const directory = state.folder;
  if (!directory) return null;

  return await serializeProjectWrite(async () => {
    const settings = await getProjectSettings(directory);
    const date = today();
    const progress =
      settings.user_settings.dailyWritingProgress.date === date
        ? settings.user_settings.dailyWritingProgress
        : { date, startingWords: {} };
    if (progress.startingWords[manuscriptId] === undefined) {
      progress.startingWords[manuscriptId] = totalWords;
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
  });
}

async function projectDrafts(directory: FolderHandle): Promise<DraftSummary[]> {
  return (await readProjectSettings(directory)).drafts;
}

function latestDraft(drafts: DraftSummary[]): DraftSummary | null {
  return drafts.reduce<DraftSummary | null>(
    (latest, draft) => (!latest || draft.number > latest.number ? draft : latest),
    null,
  );
}

export async function listDrafts(): Promise<{ drafts: DraftSummary[]; activeDraft: number }> {
  const filename = state.filename;
  const directory = state.folder;
  if (!filename || !directory) return { drafts: [], activeDraft: 1 };
  const drafts = await projectDrafts(directory);
  if (drafts.length) {
    const activeNumber = draftNumber(filename);
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
  const directory = activeFolder();

  const drafts = await projectDrafts(directory);
  const filename = drafts.find((draft) => draft.number === number)?.filename;
  if (!filename) throw new Error(`Draft ${number} was not found.`);

  const manuscript = await readManuscript(directory, filename);
  await setActiveProject(directory, filename);
  return manuscript;
}

export async function createDraft(
  mode: "blank" | "copy",
  sourceDraft: number,
): Promise<{ manuscript: Manuscript; drafts: DraftSummary[]; activeDraft: number }> {
  if (mode !== "blank" && mode !== "copy") throw new TypeError("Invalid draft mode.");
  const directory = activeFolder();
  const activeFilename = state.filename!;
  return await serializeProjectWrite(async () => {
    const currentSettings = await getProjectSettings(directory);
    let drafts = currentSettings.drafts;
    if (!drafts.length) throw new Error("The project does not have a draft to copy.");

    const latestNumber = latestDraft(drafts)!.number;
    const number = latestNumber + 1;
    if (!Number.isSafeInteger(number)) throw new Error("No more draft numbers are available.");

    const sourceFilename = drafts.find((draft) => draft.number === sourceDraft)?.filename;
    if (mode === "copy" && !sourceFilename) throw new Error(`Draft ${sourceDraft} was not found.`);
    const sourceFilenameToRead =
      mode === "copy" && sourceFilename ? sourceFilename : activeFilename;
    const source = await readManuscript(directory, sourceFilenameToRead);
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

    await createFile(directory, filename, new Uint8Array(await generateEpub(next)));
    drafts = [...drafts, { number, filename }];
    // The File System Access API cannot prove the draft wasn't replaced externally.
    // Leave it for recovery if updating settings fails instead of deleting it.
    await saveProjectSettings(directory, { ...currentSettings, drafts });
    await setActiveProject(directory, filename);
    return { manuscript: next, drafts, activeDraft: number };
  });
}

/** Returns the latest draft filename relative to the project folder. */
export async function projectEpubPath(projectFolder: FolderHandle): Promise<string | null> {
  const drafts = await projectDrafts(projectFolder);
  const latest = latestDraft(drafts);
  return latest?.filename ?? null;
}

export async function openProject(projectFolder: FolderHandle): Promise<Manuscript | null> {
  pendingProject = null;
  const filename = await projectEpubPath(projectFolder);
  if (!filename) {
    pendingProject = projectFolder;
    return null;
  }

  const parsed = await readManuscript(projectFolder, filename);
  await setActiveProject(projectFolder, filename);
  return parsed;
}

/** Call directly from the open button's user gesture, before any asynchronous work. */
export function pickProjectDirectory(): Promise<FolderHandle | null> {
  return pickFolder({ id: "writasaurus-project" });
}

export const pickProjectFolder = pickProjectDirectory;

export async function openProjectDirectory(
  folder: FolderHandle,
  create = false,
): Promise<Manuscript | null> {
  const manuscript = await openProject(folder);
  return manuscript ?? (create ? await createProjectEpub(folder) : null);
}

/** Opens a picker immediately; null means cancelled, while an empty folder is pending. */
export async function pickAndOpenProject(): Promise<
  | { status: "cancelled" }
  | { status: "empty"; folder: FolderHandle }
  | { status: "opened"; folder: FolderHandle; manuscript: Manuscript }
> {
  const folder = await pickProjectDirectory();
  if (!folder) return { status: "cancelled" };
  const manuscript = await openProject(folder);
  return manuscript ? { status: "opened", folder, manuscript } : { status: "empty", folder };
}

export async function createProjectEpub(projectFolder = pendingProject): Promise<Manuscript> {
  if (!projectFolder) throw new Error("No project folder is waiting for an EPUB.");
  return await serializeProjectWrite(async () => {
    let existingSettings = false;
    try {
      await readText(projectFolder, PROJECT_SETTINGS_FILENAME);
      existingSettings = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const current = await readProjectSettings(projectFolder);
    if (current.drafts.length || (await numberedDrafts(projectFolder)).length) {
      throw new Error("The project already has a draft.");
    }
    const manuscript = {
      ...blankManuscript(projectFolder.name || "Untitled Manuscript"),
      filename: "draft_1.epub",
    };
    const filename = "draft_1.epub";
    await createFile(projectFolder, filename, new Uint8Array(await generateEpub(manuscript)));
    const settings = { ...current, drafts: [{ number: 1, filename }] };
    if (existingSettings) {
      await saveProjectSettings(projectFolder, settings);
    } else {
      await createFile(
        projectFolder,
        PROJECT_SETTINGS_FILENAME,
        `${JSON.stringify(settings, null, 2)}\n`,
      );
    }
    await setActiveProject(projectFolder, filename);
    pendingProject = null;
    return manuscript;
  });
}

export function createProject(
  projectName: string,
  parent?: FolderHandle | null,
): Promise<Manuscript>;
export function createProject(parent: FolderHandle, projectName: string): Promise<Manuscript>;
export async function createProject(
  first: string | FolderHandle,
  second?: string | FolderHandle | null,
): Promise<Manuscript> {
  const projectName = typeof first === "string" ? first : second;
  const parent = typeof first === "string" ? (second ?? pendingProjectParent) : first;
  if (typeof projectName !== "string" || typeof parent === "string") {
    throw new TypeError("Provide a project name and parent folder.");
  }
  const name = projectName.trim();
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new Error("Enter a valid project folder name without path separators.");
  }
  if (!parent) {
    throw new Error("Choose a parent folder before creating the project.");
  }

  const folder = await createFolder(parent, name);
  const manuscript = await createProjectEpub(folder);
  pendingProjectParent = null;
  return manuscript;
}

export async function pickProjectParent(): Promise<FolderHandle | null> {
  const folder = await pickFolder({ id: "writasaurus-project-parent" });
  if (folder) pendingProjectParent = folder;
  return folder;
}

export function setPendingProjectParentPath(folder: FolderHandle): void {
  pendingProjectParent = folder;
}

export function hasPendingProjectParentPath(): boolean {
  return pendingProjectParent !== null;
}

export function cancelPendingProject(): void {
  pendingProject = null;
  pendingProjectParent = null;
}

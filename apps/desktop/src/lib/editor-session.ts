import { clearLastFilePath, loadLastFilePath, saveLastFilePath } from "./desktop.ts";
import { blankManuscript } from "./editor/data.ts";
import { epubFilename, generateEpub, isEpubFilename, parseEpub } from "./epub.ts";
import { DEFAULT_OUTLINE } from "./editor/outline-templates.ts";
import type { Manuscript } from "./editor/types.ts";
import { basename } from "../../../../packages/shared/path.ts";

/**
 * Server-side state for the Desktop app: the manuscript file currently open on disk.
 * It lives for the lifetime of the server process.
 */
const state = { activePath: null as string | null, restoredLastFile: false };
let pendingProjectPath: string | null = null;
let pendingProjectParentPath: string | null = null;

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
      const bytes = await Deno.readFile(path);
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
    filename: typeof filename === "string" && filename.trim()
      ? basename(filename)
      : manuscript.filename,
  });
}

export async function writeManuscript(path: string, manuscript: Manuscript): Promise<void> {
  await Deno.writeFile(path, await generateEpub(manuscript));
}

export async function loadOrCreateOutline(): Promise<string> {
  const path = activeOutlinePath();
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  try {
    await Deno.writeTextFile(path, DEFAULT_OUTLINE, { createNew: true });
    return DEFAULT_OUTLINE;
  } catch (error) {
    if (error instanceof Deno.errors.AlreadyExists) return await Deno.readTextFile(path);
    throw error;
  }
}

export async function writeOutline(content: string): Promise<void> {
  await Deno.writeTextFile(activeOutlinePath(), content);
}

export interface DraftSummary {
  number: number;
  filename: string;
}

interface ProjectSettings {
  drafts: DraftSummary[];
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
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  return `${trimmedPath}${separator}${filename}`;
}

function projectDirectory(path: string): string | null {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator < 0 ? null : path.slice(0, separator) || path[separator] || "";
}

async function numberedDrafts(directory: string): Promise<DraftSummary[]> {
  const drafts: DraftSummary[] = [];
  for await (const entry of Deno.readDir(directory)) {
    if (!entry.isFile) continue;
    const number = draftNumber(entry.name);
    if (number !== null) drafts.push({ number, filename: entry.name });
  }
  return drafts.sort((left, right) => left.number - right.number);
}

function parseProjectSettings(source: string): ProjectSettings {
  const parsed: unknown = JSON.parse(source);
  if (
    !parsed || typeof parsed !== "object" || !("drafts" in parsed) ||
    !Array.isArray(parsed.drafts)
  ) {
    throw new Error("The project settings file is invalid.");
  }
  const drafts: DraftSummary[] = [];
  const numbers = new Set<number>();
  for (const item of parsed.drafts) {
    if (
      !item || typeof item !== "object" || !("number" in item) ||
      !Number.isSafeInteger(item.number) || item.number < 1 ||
      !("filename" in item) || typeof item.filename !== "string" ||
      draftNumber(item.filename) !== item.number || numbers.has(item.number)
    ) {
      throw new Error("The project settings file contains an invalid draft entry.");
    }
    numbers.add(item.number);
    drafts.push({ number: item.number, filename: item.filename });
  }
  return { drafts: drafts.sort((left, right) => left.number - right.number) };
}

async function saveProjectSettings(directory: string, settings: ProjectSettings): Promise<void> {
  await Deno.writeTextFile(
    draftPath(directory, PROJECT_SETTINGS_FILENAME),
    `${JSON.stringify(settings, null, 2)}\n`,
  );
}

async function projectDrafts(directory: string): Promise<DraftSummary[]> {
  const path = draftPath(directory, PROJECT_SETTINGS_FILENAME);
  try {
    return parseProjectSettings(await Deno.readTextFile(path)).drafts;
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  const drafts = await numberedDrafts(directory);
  await saveProjectSettings(directory, { drafts });
  return drafts;
}

function latestDraft(drafts: DraftSummary[]): DraftSummary | null {
  return drafts.reduce<DraftSummary | null>(
    (latest, draft) => !latest || draft.number > latest.number ? draft : latest,
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
      activeDraft: activeNumber && drafts.some((draft) => draft.number === activeNumber)
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
  const manuscript = await parseEpub(await Deno.readFile(path), filename);
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

  let drafts = await projectDrafts(directory);
  if (!drafts.length) throw new Error("The project does not have a draft to copy.");

  const latestNumber = latestDraft(drafts)!.number;
  const number = latestNumber + 1;
  if (!Number.isSafeInteger(number)) throw new Error("No more draft numbers are available.");

  const sourceFilename = drafts.find((draft) => draft.number === sourceDraft)?.filename;
  if (mode === "copy" && !sourceFilename) throw new Error(`Draft ${sourceDraft} was not found.`);
  const sourcePath = mode === "copy" && sourceFilename
    ? draftPath(directory, sourceFilename)
    : activePath;
  const source = await parseEpub(await Deno.readFile(sourcePath), basename(sourcePath));
  const filename = `draft_${number}.epub`;
  const next: Manuscript = mode === "copy" ? { ...source, filename } : {
    ...blankManuscript(String(source.frontmatter.title ?? "Untitled Manuscript")),
    filename,
    frontmatter: {
      ...source.frontmatter,
      updatedAt: new Date().toISOString(),
    },
  };

  await Deno.writeFile(draftPath(directory, filename), await generateEpub(next), {
    createNew: true,
  });
  drafts = [...drafts, { number, filename }];
  try {
    await saveProjectSettings(directory, { drafts });
  } catch (error) {
    await Deno.remove(draftPath(directory, filename));
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

  const parsed = await parseEpub(await Deno.readFile(epubPath), basename(epubPath));
  await setActivePath(epubPath);
  return parsed;
}

export async function createProjectEpub(projectPath = pendingProjectPath): Promise<Manuscript> {
  if (!projectPath) throw new Error("No project folder is waiting for an EPUB.");

  const projectName = basename(projectPath) || "Untitled Manuscript";
  const manuscript = { ...blankManuscript(projectName), filename: "draft_1.epub" };
  const epubPath = projectFilePath(projectPath, epubFilename(manuscript));
  await Deno.writeFile(epubPath, await generateEpub(manuscript), { createNew: true });
  await saveProjectSettings(projectPath, { drafts: [{ number: 1, filename: "draft_1.epub" }] });
  await setActivePath(epubPath);
  pendingProjectPath = null;
  return manuscript;
}

export async function createProject(
  projectName: string,
): Promise<Manuscript> {
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
  await Deno.mkdir(projectPath);
  await Deno.writeFile(epubPath, epub, { createNew: true });
  await saveProjectSettings(projectPath, { drafts: [{ number: 1, filename: "draft_1.epub" }] });
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

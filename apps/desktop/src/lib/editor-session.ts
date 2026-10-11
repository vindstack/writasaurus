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
      const bytes = await Deno.readFile(activePath);
      const manuscript = await parseEpub(bytes, basename(activePath));
      return { activeFile: basename(activePath), activePath, manuscript };
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

export function firstProjectEpub(
  entries: Array<{ name: string; isFile: boolean }>,
): string | null {
  return entries
    .filter((entry) => entry.isFile && isEpubFilename(entry.name))
    .map((entry) => entry.name)
    .sort()[0] ?? null;
}

function projectFilePath(projectPath: string, filename: string): string {
  const trimmedPath = projectPath.replace(/[\\/]+$/, "");
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  return `${trimmedPath}${separator}${filename}`;
}

export async function projectEpubPath(projectPath: string): Promise<string | null> {
  const entries = [];
  for await (const entry of Deno.readDir(projectPath)) entries.push(entry);
  const filename = firstProjectEpub(entries);
  return filename ? projectFilePath(projectPath, filename) : null;
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
  const manuscript = blankManuscript(projectName);
  const epubPath = projectFilePath(projectPath, epubFilename(manuscript));
  await Deno.writeFile(epubPath, await generateEpub(manuscript), { createNew: true });
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
  const manuscript = blankManuscript(name);
  const epubPath = projectFilePath(projectPath, epubFilename(manuscript));
  const epub = await generateEpub(manuscript);
  await Deno.mkdir(projectPath);
  await Deno.writeFile(epubPath, epub, { createNew: true });
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

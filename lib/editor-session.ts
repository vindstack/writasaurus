import { basename } from "@std/path";
import { clearLastFilePath, loadLastFilePath, saveLastFilePath } from "./desktop.ts";
import { epubFilename, generateEpub, isEpubFilename, parseEpub } from "./epub.ts";
import type { Manuscript } from "../src/features/editor/client/types.ts";

/**
 * Server-side state for the Desktop app: the manuscript file currently open on disk.
 * It lives for the lifetime of the server process.
 */
const state = { activePath: null as string | null, restoredLastFile: false };

export function getActivePath(): string | null {
  return state.activePath;
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

/** Describes the active file, restoring the last-opened file on first call in Desktop mode. */
export async function editorStatus(desktop: boolean) {
  if (desktop && state.activePath && !isEpubFilename(state.activePath)) {
    state.activePath = null;
    await clearLastFilePath();
  }

  if (desktop && !state.activePath && !state.restoredLastFile) {
    state.restoredLastFile = true;
    const lastPath = await loadLastFilePath();
    if (lastPath && isEpubFilename(lastPath)) {
      state.activePath = lastPath;
    } else if (lastPath) {
      await clearLastFilePath();
    }
  }

  const activePath = state.activePath;
  if (desktop && activePath) {
    try {
      const bytes = await Deno.readFile(activePath);
      const manuscript = await parseEpub(bytes, basename(activePath));
      return { isDesktop: true, activeFile: basename(activePath), activePath, manuscript };
    } catch (error) {
      console.warn("Could not read the active file.", error);
      state.activePath = null;
      await clearLastFilePath();
    }
  }

  return {
    isDesktop: desktop,
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

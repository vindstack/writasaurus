import { joinPath, parentAndName, splitPath } from "./paths.ts";

export type FolderHandle = FileSystemDirectoryHandle;
export type PermissionMode = "read" | "readwrite";
export type FileData = string | Blob | BufferSource;

export interface FileEntry {
  path: string;
  name: string;
  size: number;
  lastModified: number;
}

export interface ListOptions {
  recursive?: boolean;
  filter?: (path: string) => boolean;
}

export function isSupported(): boolean {
  return typeof globalThis.showDirectoryPicker === "function";
}

/** Prompts the user to choose a folder. Resolves `null` if the picker is cancelled. */
export async function pickFolder(
  options: { id?: string; mode?: PermissionMode } = {},
): Promise<FolderHandle | null> {
  try {
    return await showDirectoryPicker({ id: options.id, mode: options.mode ?? "readwrite" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

/** Checks permission and, if needed, requests it (requires a user gesture). */
export async function ensurePermission(
  dir: FolderHandle,
  mode: PermissionMode = "readwrite",
): Promise<boolean> {
  if (typeof dir.queryPermission !== "function") return true;
  if ((await dir.queryPermission({ mode })) === "granted") return true;
  return (await dir.requestPermission({ mode })) === "granted";
}

async function resolveFolder(
  dir: FolderHandle,
  segments: string[],
  create = false,
): Promise<FolderHandle> {
  let current = dir;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
}

async function getFile(dir: FolderHandle, path: string, create = false) {
  const { parent, name } = parentAndName(path);
  const folder = await resolveFolder(dir, parent, create);
  return await folder.getFileHandle(name, { create });
}

export async function listFiles(
  dir: FolderHandle,
  options: ListOptions = {},
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  async function walk(folder: FolderHandle, prefix: string) {
    for await (const handle of folder.values()) {
      const path = joinPath(prefix, handle.name);
      if (handle.kind === "directory") {
        if (options.recursive) await walk(handle, path);
        continue;
      }
      if (options.filter && !options.filter(path)) continue;
      const file = await handle.getFile();
      entries.push({ path, name: handle.name, size: file.size, lastModified: file.lastModified });
    }
  }
  await walk(dir, "");
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readText(dir: FolderHandle, path: string): Promise<string> {
  return await (await (await getFile(dir, path)).getFile()).text();
}

export async function readBytes(dir: FolderHandle, path: string): Promise<ArrayBuffer> {
  return await (await (await getFile(dir, path)).getFile()).arrayBuffer();
}

/** Writes a file, creating it and any parent folders as needed. */
export async function writeFile(dir: FolderHandle, path: string, data: FileData): Promise<void> {
  const writable = await (await getFile(dir, path, true)).createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

/** Creates a new file, failing if something already exists at `path`. */
export async function createFile(
  dir: FolderHandle,
  path: string,
  data: FileData = "",
): Promise<void> {
  if (await exists(dir, path)) {
    throw new DOMException(`Entry already exists: ${path}`, "InvalidModificationError");
  }
  await writeFile(dir, path, data);
}

export async function deleteEntry(
  dir: FolderHandle,
  path: string,
  options: { recursive?: boolean } = {},
): Promise<void> {
  const { parent, name } = parentAndName(path);
  const folder = await resolveFolder(dir, parent);
  await folder.removeEntry(name, { recursive: options.recursive ?? false });
}

export async function exists(dir: FolderHandle, path: string): Promise<boolean> {
  const segments = splitPath(path);
  if (segments.length === 0) return true;
  const { parent, name } = parentAndName(path);
  try {
    const folder = await resolveFolder(dir, parent);
    for await (const key of folder.keys()) if (key === name) return true;
    return false;
  } catch (error) {
    if (
      error instanceof DOMException &&
      ["NotFoundError", "TypeMismatchError"].includes(error.name)
    ) {
      return false;
    }
    throw error;
  }
}

/** Renames or moves a file within the folder. Fails if the destination exists. */
export async function renameEntry(dir: FolderHandle, from: string, to: string): Promise<void> {
  if (await exists(dir, to)) {
    throw new DOMException(`Entry already exists: ${to}`, "InvalidModificationError");
  }
  const source = await getFile(dir, from);
  const target = parentAndName(to);
  const targetFolder = await resolveFolder(dir, target.parent, true);
  const movable = source as FileSystemFileHandle & {
    move?: (folder: FolderHandle, name: string) => Promise<void>;
  };
  if (typeof movable.move === "function") {
    await movable.move(targetFolder, target.name);
    return;
  }
  await writeFile(dir, to, await source.getFile());
  await deleteEntry(dir, from);
}

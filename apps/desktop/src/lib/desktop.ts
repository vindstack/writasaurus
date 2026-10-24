import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { getPlatform } from "./platform.ts";

export async function chooseFile(
  action: "open" | "save",
  suggestedName = "manuscript.epub",
  filterName = "EPUB eBook",
  filterExtensions = ["*.epub"],
): Promise<string | null> {
  const platform = getPlatform();
  const options = {
    title: `${action === "open" ? "Open" : "Save"} Manuscript`,
    ...(action === "save" ? { defaultPath: suggestedName } : {}),
    filters: [
      {
        name: filterName,
        extensions: filterExtensions.map((extension) => extension.replace(/^\*?\./, "")),
      },
    ],
  };
  return await (action === "open" ? platform.openFile(options) : platform.saveFile(options));
}

export async function chooseDirectory(action: "open" | "new"): Promise<string | null> {
  return await getPlatform().chooseDirectory({
    title: action === "open" ? "Open Project" : "Create New Project",
  });
}

export function applicationDataDirectory(): string | null {
  const home = process.env.HOME;
  if (process.platform === "linux") {
    const base = process.env.XDG_DATA_HOME || (home ? `${home}/.local/share` : null);
    return base ? `${base}/writasaurus` : null;
  }
  if (process.platform === "darwin") {
    return home ? `${home}/Library/Application Support/writasaurus` : null;
  }
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  return base ? `${base}\\writasaurus` : null;
}

function lastFilePath(): string | null {
  const dir = applicationDataDirectory();
  return dir ? `${dir}/last-file.json` : null;
}

export async function loadLastFilePath(): Promise<string | null> {
  try {
    const path = lastFilePath();
    if (!path) return null;
    const data = JSON.parse(await readFile(path, "utf8"));
    return typeof data?.path === "string" ? data.path : null;
  } catch {
    return null;
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export async function saveLastFilePath(path: string): Promise<void> {
  const statePath = lastFilePath();
  if (!statePath) return;
  const temporaryPath = `${statePath}.${crypto.randomUUID()}.tmp`;
  try {
    const dir = applicationDataDirectory();
    if (dir) await mkdir(dir, { recursive: true });
    await writeFile(temporaryPath, JSON.stringify({ path }), { flag: "wx", mode: 0o600 });
    await rename(temporaryPath, statePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    if (!hasErrorCode(error, "EACCES") && !hasErrorCode(error, "EPERM")) {
      console.warn("Could not remember the last opened file.", error);
    }
  }
}

export async function clearLastFilePath(): Promise<void> {
  try {
    const statePath = lastFilePath();
    if (!statePath) return;
    await rm(statePath);
  } catch (error) {
    if (
      !hasErrorCode(error, "ENOENT") &&
      !hasErrorCode(error, "EACCES") &&
      !hasErrorCode(error, "EPERM")
    ) {
      console.warn("Could not clear the last opened file.", error);
    }
  }
}

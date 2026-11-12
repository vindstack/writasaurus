import { batch, signal } from "@preact/signals";
import { readText } from "@writasaurus/fs";
import { applyFontPreference } from "../../../../../packages/shared/settings.ts";
import { getFontPreference } from "../app-settings-client.ts";
import {
  detachActiveProject,
  getActiveFolder,
  loadOrCreateOutline,
  requestProjectPermission,
  restoreProject,
} from "../editor-session.ts";
import { editorHistory } from "./history.ts";
import {
  activeChapterIndex,
  projectLoaded,
  editorMode,
  hasUnsavedChanges,
  manuscript,
  replaceManuscript,
  replaceOutline,
  saveMessage,
} from "./state.ts";
import type { Manuscript } from "./types.ts";
import { restoreLocal, shouldSkipWelcome } from "./storage.ts";

let permissionFolder: FileSystemDirectoryHandle | null = null;
export const recoveryNotice = signal("");

function sameManuscriptContent(cached: Manuscript, disk: Manuscript): boolean {
  const keys = new Set([...Object.keys(cached.frontmatter), ...Object.keys(disk.frontmatter)]);
  keys.delete("createdAt");
  keys.delete("updatedAt");
  if ([...keys].some((key) => cached.frontmatter[key] !== disk.frontmatter[key])) return false;
  return (
    cached.chapters.length === disk.chapters.length &&
    cached.chapters.every((chapter, index) => {
      const other = disk.chapters[index];
      return (
        chapter.title === other.title &&
        (chapter.type ?? "chapter") === (other.type ?? "chapter") &&
        chapter.content === other.content
      );
    })
  );
}

export async function restoreEditor(): Promise<"opened" | "welcome" | "permission"> {
  applyFontPreference(getFontPreference());
  const saved = restoreLocal();
  let result: Awaited<ReturnType<typeof restoreProject>>;
  try {
    result = await restoreProject();
  } catch (error) {
    if (!saved || (!saved.hasUnsavedChanges && !saved.outlineHasUnsavedChanges)) throw error;
    restoreOffline(saved);
    return "opened";
  }
  if (result.status === "permission") {
    permissionFolder = result.folder;
    return "permission";
  }
  permissionFolder = null;
  if (result.status === "restored") {
    if (
      saved &&
      saved.projectId === result.identity.id &&
      saved.projectFilename === result.identity.filename
    ) {
      if (saved.hasUnsavedChanges && !sameManuscriptContent(saved.manuscript, result.manuscript)) {
        restoreOffline(saved);
        return "opened";
      }
      let diskOutline: string | undefined;
      if (saved.outlineHasUnsavedChanges) {
        try {
          const folder = getActiveFolder();
          if (!folder) throw new Error("Project folder is unavailable.");
          diskOutline = await readText(folder, "Outline.md");
        } catch (error) {
          console.error("Could not compare the cached outline with the project.", error);
          const reason = error instanceof Error ? error.message : "The outline could not be read.";
          restoreOffline(saved, reason);
          return "opened";
        }
        if (saved.outlineContent !== diskOutline) {
          restoreOffline(saved);
          return "opened";
        }
      }
      replaceManuscript(result.manuscript, {
        activeChapter: saved.activeChapter,
        projectLoaded: true,
        hasUnsavedChanges: false,
      });
      if (saved.outlineHasUnsavedChanges || saved.editorMode === "outline") {
        replaceOutline(diskOutline ?? (await loadOrCreateOutline()));
        editorMode.value = saved.editorMode ?? "manuscript";
      }
    } else if (saved && (saved.hasUnsavedChanges || saved.outlineHasUnsavedChanges)) {
      restoreOffline(saved);
    } else {
      replaceManuscript(result.manuscript, { projectLoaded: true });
    }
    editorHistory.clear();
    return "opened";
  }
  if (saved && (saved.hasUnsavedChanges || saved.outlineHasUnsavedChanges)) {
    restoreOffline(saved);
    return "opened";
  }
  return shouldSkipWelcome() ? "opened" : "welcome";
}

export function recoverCachedEditor(): boolean {
  const saved = restoreLocal();
  if (!saved) return false;
  restoreOffline(saved);
  return true;
}

function restoreOffline(
  saved: NonNullable<ReturnType<typeof restoreLocal>>,
  reason?: string,
): void {
  detachActiveProject();
  batch(() => {
    manuscript.value = saved.manuscript;
    activeChapterIndex.value = saved.activeChapter;
    hasUnsavedChanges.value = Boolean(saved.hasUnsavedChanges);
    projectLoaded.value = false;
    recoveryNotice.value = reason
      ? `Could not compare the outline with the project: ${reason} Recovered changes are disconnected to protect the project on disk. Export your manuscript and outline before opening another project.`
      : "Recovered changes are disconnected to protect the project on disk. Export your manuscript and outline before opening another project.";
    saveMessage.value = "Recovered unsaved changes.";
    replaceOutline(saved.outlineContent ?? "", saved.outlineHasUnsavedChanges);
    editorMode.value = saved.editorMode ?? "manuscript";
  });
  editorHistory.clear();
}

/** Call directly from a click handler while transient activation is available. */
export async function reconnectProject(): Promise<boolean> {
  if (!permissionFolder) return false;
  return await requestProjectPermission(permissionFolder);
}

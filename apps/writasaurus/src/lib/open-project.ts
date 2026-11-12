import { isSupported } from "@writasaurus/fs";
import {
  cancelPendingProject,
  createProjectEpub,
  getProjectIdentity,
  openProject,
  pickProjectDirectory,
} from "./editor-session.ts";
import type { Manuscript } from "./editor/types.ts";
import { saveLocal } from "./editor/storage.ts";

export type ProjectRequest = { kind: "cancelled" } | { kind: "opened"; manuscript: Manuscript };

export async function requestProject(beforeOpen?: () => Promise<boolean>): Promise<ProjectRequest> {
  try {
    if (!isSupported()) {
      throw new Error(
        "Your browser does not support project folders. Use a browser with the File System Access API, such as Chrome or Edge.",
      );
    }
    // The picker must run directly in the click or keyboard gesture.
    const folder = await pickProjectDirectory();
    if (!folder || (beforeOpen && !(await beforeOpen()))) return { kind: "cancelled" };
    let manuscript = await openProject(folder);
    if (!manuscript) {
      if (!confirm(`The project "${folder.name}" does not contain an EPUB. Create a new EPUB?`)) {
        cancelPendingProject();
        return { kind: "cancelled" };
      }
      try {
        manuscript = await createProjectEpub(folder);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not create the manuscript.";
        throw new Error(
          `${message} An unfinished draft may remain; inspect the folder before retrying.`,
        );
      }
    }
    const identity = getProjectIdentity();
    saveLocal(manuscript, 0, false, "", false, "manuscript", identity?.id, identity?.filename);
    return { kind: "opened", manuscript };
  } catch (error) {
    console.error("Project operation failed:", error);
    alert(error instanceof Error ? error.message : "The project could not be opened.");
    return { kind: "cancelled" };
  }
}

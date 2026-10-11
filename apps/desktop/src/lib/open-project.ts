import type { Manuscript } from "./editor/types.ts";

export type ProjectRequest =
  | { kind: "cancelled" }
  | { kind: "opened"; manuscript: Manuscript };

async function readManuscript(response: Response): Promise<Manuscript> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Project operation failed: ${response.status}`);
  }
  const result = await response.json();
  return result.manuscript;
}

export async function requestProject(): Promise<ProjectRequest> {
  try {
    const response = await fetch("/api/editor/project/open", { method: "POST" });
    if (response.status === 204) return { kind: "cancelled" };
    if (!response.ok) throw new Error(await response.text());

    const result = await response.json();
    if (result.needsEpub) {
      const createEpub = confirm(
        `The project "${result.projectName}" does not contain an EPUB. Create a new EPUB?`,
      );
      if (!createEpub) {
        const cancelResponse = await fetch("/api/editor/project/cancel", { method: "POST" });
        if (!cancelResponse.ok) {
          throw new Error(`Could not cancel project opening: ${cancelResponse.status}`);
        }
        return { kind: "cancelled" };
      }
      const createResponse = await fetch("/api/editor/project/create-epub", { method: "POST" });
      return { kind: "opened", manuscript: await readManuscript(createResponse) };
    }

    return { kind: "opened", manuscript: result.manuscript };
  } catch (error) {
    console.error("Project operation failed:", error);
    alert(error instanceof Error ? error.message : "The project could not be opened.");
    return { kind: "cancelled" };
  }
}

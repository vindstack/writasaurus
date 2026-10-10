import type { Manuscript } from "./editor/types.ts";

export type OpenRequest =
  | { kind: "cancelled" }
  | { kind: "opened"; manuscript?: Manuscript };

/** Opens a manuscript through the native Desktop dialog. */
export async function requestOpen(): Promise<OpenRequest> {
  try {
    const response = await fetch("/api/editor/open", { method: "POST" });
    if (response.status === 204) return { kind: "cancelled" };
    if (!response.ok) throw new Error(`File open failed: ${response.status}`);
    const result = await response.json();
    return { kind: "opened", manuscript: result.manuscript };
  } catch (error) {
    console.error("Desktop open failed:", error);
    alert("The manuscript could not be opened.");
    return { kind: "cancelled" };
  }
}

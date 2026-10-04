import type { WritableFileHandle } from "./editor/types.ts";

const picker = globalThis as unknown as {
  showOpenFilePicker?: (options: object) => Promise<WritableFileHandle[]>;
};

export const EPUB_TYPES = [{
  description: "EPUB eBook",
  accept: { "application/epub+zip": [".epub"] },
}];

export type OpenRequest =
  | { kind: "cancelled" }
  /** Desktop: the server opened the file and now owns the active path. */
  | { kind: "desktop" }
  /** No usable native picker; the caller should open its file input. */
  | { kind: "input" }
  | { kind: "file"; file: File; handle: WritableFileHandle };

export async function hasWritePermission(
  handle: WritableFileHandle,
  request: boolean,
): Promise<boolean> {
  if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return request && (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

/** Opens a manuscript through the native Desktop dialog or the File System Access API. */
export async function requestOpen(isDesktop: boolean): Promise<OpenRequest> {
  if (isDesktop) {
    try {
      const response = await fetch("/api/editor/open", { method: "POST" });
      if (response.status === 204) return { kind: "cancelled" };
      if (!response.ok) throw new Error(`File open failed: ${response.status}`);
      return { kind: "desktop" };
    } catch (error) {
      console.error("Desktop open failed:", error);
      alert("The manuscript could not be opened.");
      return { kind: "cancelled" };
    }
  }

  if (!picker.showOpenFilePicker) return { kind: "input" };

  try {
    const [handle] = await picker.showOpenFilePicker({ types: EPUB_TYPES, multiple: false });
    if (!handle) return { kind: "cancelled" };
    await hasWritePermission(handle, true);
    return { kind: "file", file: await handle.getFile(), handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return { kind: "cancelled" };
    console.warn("Native open picker failed; falling back to input.", error);
    return { kind: "input" };
  }
}

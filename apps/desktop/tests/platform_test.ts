import { afterEach, expect, test, vi } from "vitest";
import { chooseDirectory, chooseFile } from "../src/lib/desktop.ts";
import { getPlatform, setPlatform } from "../src/lib/platform.ts";

afterEach(() => setPlatform(undefined));

test("platform: open injects the EPUB dialog and returns the selected path", async () => {
  const openFile = vi.fn().mockResolvedValue("/projects/story.epub");
  setPlatform({ openFile });

  await expect(chooseFile("open")).resolves.toBe("/projects/story.epub");
  expect(openFile).toHaveBeenCalledExactlyOnceWith({
    title: "Open Manuscript",
    filters: [{ name: "EPUB eBook", extensions: ["epub"] }],
  });
});

test("platform: save forwards the suggested path and normalizes native filters", async () => {
  const saveFile = vi.fn().mockResolvedValue("/projects/story.pdf");
  setPlatform({ saveFile });

  await expect(
    chooseFile("save", "story.pdf", "Documents", ["*.pdf", ".epub", "txt"]),
  ).resolves.toBe("/projects/story.pdf");
  expect(saveFile).toHaveBeenCalledExactlyOnceWith({
    title: "Save Manuscript",
    defaultPath: "story.pdf",
    filters: [{ name: "Documents", extensions: ["pdf", "epub", "txt"] }],
  });
});

test("platform: project dialogs forward the action-specific title", async () => {
  const directoryDialog = vi.fn().mockResolvedValue("/projects/story");
  setPlatform({ chooseDirectory: directoryDialog });

  await expect(chooseDirectory("open")).resolves.toBe("/projects/story");
  await expect(chooseDirectory("new")).resolves.toBe("/projects/story");
  expect(directoryDialog.mock.calls).toEqual([
    [{ title: "Open Project" }],
    [{ title: "Create New Project" }],
  ]);
});

test("platform: canceled native dialogs return null", async () => {
  setPlatform({
    openFile: async () => null,
    saveFile: async () => null,
    chooseDirectory: async () => null,
  });

  await expect(chooseFile("open")).resolves.toBeNull();
  await expect(chooseFile("save")).resolves.toBeNull();
  await expect(chooseDirectory("open")).resolves.toBeNull();
  await expect(chooseDirectory("new")).resolves.toBeNull();
});

test("platform: unavailable native dialogs reject rather than reporting cancellation", async () => {
  setPlatform(undefined);

  await expect(chooseFile("open")).rejects.toThrow("Native file dialogs are unavailable");
  await expect(chooseFile("save")).rejects.toThrow("Native file dialogs are unavailable");
  await expect(chooseDirectory("open")).rejects.toThrow("Native file dialogs are unavailable");
  await expect(chooseDirectory("new")).rejects.toThrow("Native file dialogs are unavailable");
});

test("platform: native dialog failures propagate without becoming cancellation", async () => {
  const error = new Error("Native dialog failed");
  const fail = vi.fn().mockRejectedValue(error);
  setPlatform({ openFile: fail, saveFile: fail, chooseDirectory: fail });

  await expect(chooseFile("open")).rejects.toBe(error);
  await expect(chooseFile("save")).rejects.toBe(error);
  await expect(chooseDirectory("open")).rejects.toBe(error);
});

test("platform: exit uses the injected callback", () => {
  const exit = vi.fn();
  setPlatform({ exit });

  getPlatform().exit();
  expect(exit).toHaveBeenCalledExactlyOnceWith();
});

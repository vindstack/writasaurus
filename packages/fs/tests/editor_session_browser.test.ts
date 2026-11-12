import { build } from "esbuild";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchBrowser, serveTestApp } from "../../shared/test/browser.ts";

let browser: Browser;
let page: Page;
let server: { url: string; shutdown(): Promise<void> };

beforeAll(async () => {
  const bundle = await build({
    entryPoints: [
      new URL("../../../apps/writasaurus/src/lib/editor-session.ts", import.meta.url).pathname,
    ],
    bundle: true,
    format: "esm",
    write: false,
  });
  server = await serveTestApp((request) =>
    new URL(request.url).pathname === "/session.js"
      ? new Response(bundle.outputFiles[0].text, {
          headers: { "content-type": "text/javascript" },
        })
      : new Response(
          `<script type="module">import * as session from "/session.js"; globalThis.session = session;</script>`,
          { headers: { "content-type": "text/html" } },
        ),
  );
  browser = await launchBrowser();
  page = await browser.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => "session" in globalThis);
});

afterAll(async () => {
  await browser?.close();
  await server?.shutdown();
});

describe("browser project session", () => {
  it("creates, restores the selected draft, and retains settings and progress", async () => {
    const first = await page.evaluate(async () => {
      const session = (globalThis as any).session;
      const root = await navigator.storage.getDirectory();
      await session.createProject("Novel", root);
      await session.writeOutline("My outline");
      await session.updateActiveProjectSettings({ dailyWordGoal: 500 });
      await session.recordActiveProjectDailyProgress("book", 100);
      const progress = await session.recordActiveProjectDailyProgress("book", 140);
      await session.createDraft("copy", 1);
      const draftIdentity = session.getProjectIdentity();
      await session.selectDraft(1);
      return {
        progress,
        drafts: await session.listDrafts(),
        identity: session.getProjectIdentity(),
        draftIdentity,
      };
    });
    expect(first.progress.writtenWords).toBe(40);
    expect(first.progress.dailyWordGoal).toBe(500);
    expect(first.drafts.activeDraft).toBe(1);
    expect(first.drafts.drafts).toHaveLength(2);
    expect(first.identity.id).toBe(first.draftIdentity.id);
    expect(first.identity.filename).not.toBe(first.draftIdentity.filename);

    await page.reload();
    await page.waitForFunction(() => "session" in globalThis);
    const restored = await page.evaluate(async () => {
      const session = (globalThis as any).session;
      const result = await session.restoreProject();
      return {
        status: result.status,
        identity: result.identity,
        filename: session.getActivePath(),
        outline: await session.loadOrCreateOutline(),
        settings: (await session.getActiveProjectDetails()).settings,
      };
    });
    expect(restored.status).toBe("restored");
    expect(restored.identity).toEqual(first.identity);
    expect(restored.filename).toBe("draft_1.epub");
    expect(restored.outline).toBe("My outline");
    expect(restored.settings.user_settings.dailyWordGoal).toBe(500);
    await page.evaluate(() => (globalThis as any).session.closeActiveFile());
  });

  it("does not overwrite existing projects or unindexed draft files", async () => {
    const result = await page.evaluate(async () => {
      const session = (globalThis as any).session;
      const root = await navigator.storage.getDirectory();
      const duplicate = await session.createProject("Novel", root).then(
        () => "ok",
        (error: DOMException) => error.name,
      );
      const folder = await root.getDirectoryHandle("Novel");
      await session.openProject(folder);
      const file = await folder.getFileHandle("draft_3.epub", { create: true });
      const writable = await file.createWritable();
      await writable.write("keep me");
      await writable.close();
      const conflict = await session.createDraft("copy", 2).then(
        () => "ok",
        (error: DOMException) => error.name,
      );
      return { duplicate, conflict, content: await (await file.getFile()).text() };
    });
    expect(result).toEqual({
      duplicate: "InvalidModificationError",
      conflict: "InvalidModificationError",
      content: "keep me",
    });
  });

  it("does not delete a replaced draft when a settings write fails", async () => {
    const result = await page.evaluate(async () => {
      const session = (globalThis as any).session;
      const root = await navigator.storage.getDirectory();
      await session.createProject("Failure", root);
      const folder = session.getActiveFolder();
      const getFileHandle = folder.getFileHandle.bind(folder);
      const settings = await getFileHandle("settings.json");
      const before = await (await settings.getFile()).text();
      folder.getFileHandle = async (name: string, options: FileSystemGetFileOptions) => {
        const handle = await getFileHandle(name, options);
        if (name === "settings.json") {
          handle.createWritable = async () => {
            const draft = await getFileHandle("draft_2.epub");
            const writable = await draft.createWritable();
            await writable.write("external draft");
            await writable.close();
            throw new DOMException("Write failed", "NotAllowedError");
          };
        }
        return handle;
      };
      const error = await session.createDraft("copy", 1).then(
        () => "ok",
        (failure: DOMException) => failure.name,
      );
      delete folder.getFileHandle;
      const draft = await getFileHandle("draft_2.epub");
      return {
        error,
        draftContent: await (await draft.getFile()).text(),
        active: session.getActivePath(),
        settingsBefore: before,
        settingsAfter: await (await (await getFileHandle("settings.json")).getFile()).text(),
      };
    });
    expect(result.error).toBe("NotAllowedError");
    expect(result.draftContent).toBe("external draft");
    expect(result.active).toBe("draft_1.epub");
    expect(result.settingsAfter).toBe(result.settingsBefore);
  });

  it("does not delete a project folder after initialization fails", async () => {
    const result = await page.evaluate(async () => {
      const session = (globalThis as any).session;
      const root = await navigator.storage.getDirectory();
      const getDirectoryHandle = root.getDirectoryHandle.bind(root);
      root.getDirectoryHandle = async (name: string, options: FileSystemGetDirectoryOptions) => {
        const folder = await getDirectoryHandle(name, options);
        if (name === "FailedCreate") {
          folder.getFileHandle = async () => {
            throw new DOMException("Permission revoked", "NotAllowedError");
          };
        }
        return folder;
      };
      const error = await session.createProject("FailedCreate", root).then(
        () => "ok",
        (failure: DOMException) => failure.name,
      );
      root.getDirectoryHandle = getDirectoryHandle;
      const exists = await getDirectoryHandle("FailedCreate").then(
        () => true,
        (failure: DOMException) => failure.name !== "NotFoundError",
      );
      return { error, exists };
    });
    expect(result).toEqual({ error: "NotAllowedError", exists: true });
  });
});

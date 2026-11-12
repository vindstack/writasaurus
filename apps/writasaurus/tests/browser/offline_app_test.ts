import { expect, test } from "vitest";
import { launchBrowser } from "../../../../packages/shared/test/browser.ts";
import { startWebsiteServer } from "../helpers.ts";
import { createProject, withEditorPage } from "./editor_helpers.ts";

test("the built site installs the editor for offline use from the first landing visit", async () => {
  const server = await startWebsiteServer();
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(server.origin);
    expect(await page.getByRole("link", { name: "Try now" }).getAttribute("href")).toBe("/editor");
    await page.evaluate(async () => {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PWA install timed out")), 30000),
        ),
      ]);
    });

    await context.setOffline(true);
    await page.goto(`${server.origin}/editor/welcome`);
    expect(await page.getByRole("button", { name: "Open Existing Project" }).isVisible()).toBe(
      true,
    );
    await page.goto(`${server.origin}/editor/settings`);
    expect(await page.getByRole("heading", { name: "Settings" }).isVisible()).toBe(true);
    await page.goto(`${server.origin}/editor/about`);
    expect(await page.getByRole("heading", { name: "About Writasaurus" }).isVisible()).toBe(true);
    await expect(page.goto(`${server.origin}/account`)).rejects.toThrow();
    await context.close();
  } finally {
    await browser.close();
    await server.shutdown();
  }
}, 120_000);

test("a project can be created, edited, saved and reopened while offline", async () => {
  await withEditorPage(async (page) => {
    await page.evaluate(async () => {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PWA install timed out")), 30000),
        ),
      ]);
    });
    await page.context().setOffline(true);
    await page.reload();
    await createProject(page);
    await page.locator("#editor").fill("Written without a network connection.");
    await page.keyboard.press("Control+s");
    await expect.poll(() => page.locator("#save-status").textContent()).toContain("Saved");
    await page.reload();
    await page.waitForSelector('[data-ready="true"]');
    expect(await page.locator("#editor").textContent()).toContain(
      "Written without a network connection.",
    );
  });
}, 120_000);

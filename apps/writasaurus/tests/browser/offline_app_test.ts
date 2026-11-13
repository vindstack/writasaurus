import { expect, test } from "vitest";
import { launchBrowser } from "../../../../packages/shared/test/browser.ts";
import { startWebsiteServer } from "../helpers.ts";
import { createProject, withEditorPage } from "./editor_helpers.ts";

test("landing CTA is disabled and explains missing native folder access", async () => {
  const server = await startWebsiteServer();
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(window, "showDirectoryPicker", { value: undefined });
      Object.defineProperty(navigator, "getInstalledRelatedApps", {
        value: async () => [{ platform: "webapp", id: new URL("/editor", location.origin).href }],
      });
    });
    await page.goto(server.origin);
    const button = page.locator("[data-install-button]");
    await expect.poll(() => button.getAttribute("aria-disabled")).toBe("true");
    expect(await button.getAttribute("href")).toBeNull();
    expect(await button.getAttribute("aria-describedby")).toBe("install-browser-warning");
    const warning = page.getByRole("alert");
    expect(await warning.isVisible()).toBe(true);
    expect(await warning.textContent()).toContain("Chrome, Edge, or Brave");
    await page.evaluate(() => {
      const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => {
          throw new Error("Unsupported browsers must not prompt installation");
        },
        userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
      });
      window.dispatchEvent(event);
      window.dispatchEvent(new Event("appinstalled"));
    });
    await button.click({ force: true });
    await button.press("Enter");
    expect(await button.textContent()).toContain("Try now");
    expect(new URL(page.url()).pathname).toBe("/");
  } finally {
    await browser.close();
    await server.shutdown();
  }
}, 60_000);

for (const installed of [true, false]) {
  test(`landing CTA detects a ${installed ? "installed" : "missing"} Writasaurus app on reload`, async () => {
    const server = await startWebsiteServer();
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.addInitScript((isInstalled) => {
        Object.defineProperty(navigator, "getInstalledRelatedApps", {
          value: async () => [
            {
              platform: "webapp",
              id: new URL(isInstalled ? "/editor" : "/unrelated", location.origin).href,
            },
          ],
        });
      }, installed);
      for (let visit = 0; visit < 2; visit++) {
        await page.goto(server.origin);
        if (installed) {
          await expect
            .poll(() => page.locator("[data-install-button]").textContent())
            .toBe("Open App");
          expect(await page.locator("[data-install-button]").getAttribute("href")).toBe(
            "web+writasaurus://open",
          );
        } else {
          expect(await page.getByRole("link", { name: "Try now" }).getAttribute("href")).toBe(
            "/editor",
          );
        }
      }
    } finally {
      await browser.close();
      await server.shutdown();
    }
  }, 60_000);
}

test("the built site installs the editor for offline use from the first landing visit", async () => {
  const server = await startWebsiteServer();
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(server.origin);
    expect(await page.getByRole("link", { name: "Try now" }).getAttribute("href")).toBe("/editor");
    await page.evaluate(() => {
      const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => {
          document.body.dataset.installPrompted = "yes";
        },
        userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
      });
      window.dispatchEvent(event);
    });
    expect(await page.getByRole("link", { name: "Install app" }).isVisible()).toBe(true);
    await page.getByRole("link", { name: "Install app" }).click();
    // Simulate appinstalled event
    await page.evaluate(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(
      await page.getByRole("link", { name: "Open App", exact: true }).getAttribute("href"),
    ).toBe("web+writasaurus://open");
    expect(await page.locator("body").getAttribute("data-install-prompted")).toBe("yes");
    expect(new URL(page.url()).pathname).toBe("/");
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

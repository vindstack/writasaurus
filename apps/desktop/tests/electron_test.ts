import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type ElectronApplication } from "playwright";
import { expect, test } from "vitest";
import type { Platform } from "../src/lib/platform.ts";

test("electron: production app loads in a sandbox and wires native dialogs", async () => {
  const directory = await mkdtemp(resolve(".writasaurus-electron-"));
  const root = fileURLToPath(new URL("../", import.meta.url));
  let application: ElectronApplication | undefined;
  const diagnostics: string[] = [];
  try {
    application = await electron.launch({
      args: [root, `--user-data-dir=${directory}/profile`],
      cwd: root,
      timeout: 20_000,
      env: {
        ...process.env,
        HOME: directory,
        XDG_DATA_HOME: directory,
        LOCALAPPDATA: directory,
        APPDATA: directory,
      },
    });
    application.process().stderr?.on("data", (chunk) => diagnostics.push(String(chunk)));
    const page = await application.firstWindow({ timeout: 20_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 20_000 });
    await page.locator('[data-ready="true"], #welcome-project-open').first().waitFor({
      timeout: 20_000,
    });

    expect(await page.title()).toContain("Writasaurus");
    const url = new URL(page.url());
    expect(url.protocol).toBe("http:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(Number(url.port)).toBeGreaterThan(0);
    const window = await application.browserWindow(page);
    const preferences = await window.evaluate((browserWindow) =>
      browserWindow.webContents.getLastWebPreferences(),
    );
    expect(preferences).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    });
    expect(
      await page.evaluate(() => ({
        require: typeof (globalThis as { require?: unknown }).require,
        process: typeof (globalThis as { process?: unknown }).process,
      })),
    ).toEqual({ require: "undefined", process: "undefined" });

    const dialogs = await application.evaluate(async ({ dialog }) => {
      const platform = (
        globalThis as unknown as {
          __WRITASAURUS_PLATFORM__: Platform;
        }
      ).__WRITASAURUS_PLATFORM__;
      const originalOpen = dialog.showOpenDialog;
      const originalSave = dialog.showSaveDialog;
      const openCalls: unknown[] = [];
      const saveCalls: unknown[] = [];
      let canceled = true;
      dialog.showOpenDialog = async (optionsOrWindow: unknown, options?: unknown) => {
        openCalls.push(options ?? optionsOrWindow);
        return { canceled, filePaths: canceled ? [] : ["/projects/selected"] };
      };
      dialog.showSaveDialog = async (optionsOrWindow: unknown, options?: unknown) => {
        saveCalls.push(options ?? optionsOrWindow);
        return { canceled, filePath: canceled ? "" : "/projects/saved.epub" };
      };
      const options = {
        title: "Open Manuscript",
        filters: [{ name: "EPUB eBook", extensions: ["epub"] }],
      };
      const saveOptions = { ...options, title: "Save Manuscript", defaultPath: "story.epub" };
      try {
        const cancellations = [
          await platform.openFile(options),
          await platform.saveFile(saveOptions),
          await platform.chooseDirectory({ title: "Open Project" }),
        ];
        canceled = false;
        const selections = [
          await platform.openFile(options),
          await platform.saveFile(saveOptions),
          await platform.chooseDirectory({ title: "Open Project" }),
        ];
        return { cancellations, selections, openCalls, saveCalls };
      } finally {
        dialog.showOpenDialog = originalOpen;
        dialog.showSaveDialog = originalSave;
      }
    });
    expect(dialogs.cancellations).toEqual([null, null, null]);
    expect(dialogs.selections).toEqual([
      "/projects/selected",
      "/projects/saved.epub",
      "/projects/selected",
    ]);
    expect(dialogs.openCalls[0]).toEqual({
      title: "Open Manuscript",
      filters: [{ name: "EPUB eBook", extensions: ["epub"] }],
      properties: ["openFile"],
    });
    expect(dialogs.openCalls[1]).toEqual({
      title: "Open Project",
      properties: ["openDirectory"],
    });
    expect(dialogs.saveCalls[0]).toEqual({
      title: "Save Manuscript",
      defaultPath: "story.epub",
      filters: [{ name: "EPUB eBook", extensions: ["epub"] }],
    });

    const bar = page.locator("[data-window-titlebar]");
    await expect.poll(() => bar.isVisible()).toBe(true);
    expect(await bar.locator("[data-window-title]").textContent()).toBe(await page.title());
    await page.goto(new URL("/settings", page.url()).href);
    await expect.poll(() => bar.isVisible()).toBe(true);
    await expect
      .poll(() => bar.locator("[data-window-title]").textContent())
      .toBe(await page.title());
    expect(
      await bar.evaluate((element) => getComputedStyle(element).getPropertyValue("app-region")),
    ).toBe("drag");
    const controls = await window.evaluateHandle((browserWindow) => {
      const calls: string[] = [];
      browserWindow.minimize = () => {
        calls.push("minimize");
      };
      browserWindow.maximize = () => {
        calls.push("maximize");
        browserWindow.isMaximized = () => true;
        browserWindow.emit("maximize");
      };
      browserWindow.unmaximize = () => {
        calls.push("restore");
        browserWindow.isMaximized = () => false;
        browserWindow.emit("unmaximize");
      };
      browserWindow.close = () => {
        calls.push("close");
      };
      browserWindow.isMaximized = () => false;
      return calls;
    });
    await page.getByRole("button", { name: "Minimize window", exact: true }).click();
    await page.getByRole("button", { name: "Maximize window", exact: true }).click();
    await page.getByRole("button", { name: "Restore window", exact: true }).waitFor();
    await page.getByRole("button", { name: "Restore window", exact: true }).click();
    await page.getByRole("button", { name: "Maximize window", exact: true }).waitFor();
    await page.getByRole("button", { name: "Close window", exact: true }).click();
    await expect
      .poll(() => controls.jsonValue())
      .toEqual(["minimize", "maximize", "restore", "close"]);
    await controls.dispose();
  } catch (error) {
    throw new Error(`${String(error)}\nElectron stderr:\n${diagnostics.join("")}`, {
      cause: error,
    });
  } finally {
    try {
      await application?.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}, 60_000);

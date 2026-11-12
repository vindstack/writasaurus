import type { Browser, Page } from "playwright";
import { launchBrowser } from "../../../../packages/shared/test/browser.ts";
import { startWebsiteServer } from "../helpers.ts";

/**
 * Use real, serializable OPFS handles for project IO. Only the picker and permission
 * prompts are simulated; the editor reads and writes actual browser-managed files.
 */
export async function withEditorPage(
  run: (page: Page) => Promise<void>,
  options: { directoryPicker?: boolean } = {},
): Promise<void> {
  const server = await startWebsiteServer();
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ acceptDownloads: true, baseURL: server.origin });
    await page.addInitScript(
      ({ directoryPicker }) => {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (
            this === sessionStorage &&
            key === "writasaurus-manuscript-v1:state" &&
            localStorage.getItem("test-fail-cache") === "true"
          ) {
            throw new DOMException("Storage full", "QuotaExceededError");
          }
          return setItem.call(this, key, value);
        };
        const handlePrototype = FileSystemHandle.prototype as FileSystemHandle & {
          queryPermission: () => Promise<PermissionState>;
          requestPermission: () => Promise<PermissionState>;
        };
        handlePrototype.queryPermission = async () =>
          (localStorage.getItem("test-permission") as PermissionState | null) ?? "granted";
        handlePrototype.requestPermission = async () => {
          const result = (localStorage.getItem("test-permission-response") ??
            "granted") as PermissionState;
          localStorage.setItem("test-permission", result);
          localStorage.setItem("test-permission-requested", "true");
          return result;
        };
        const filePrototype = FileSystemFileHandle.prototype;
        const createWritable = filePrototype.createWritable;
        const getFile = filePrototype.getFile;
        filePrototype.getFile = function () {
          if (localStorage.getItem("test-fail-read") === this.name) {
            throw new DOMException("Test outline read denied", "NotAllowedError");
          }
          return getFile.call(this);
        };
        filePrototype.createWritable = function (...args) {
          if (localStorage.getItem("test-fail-write") === this.name) {
            throw new DOMException("Test write denied", "NotAllowedError");
          }
          return createWritable.apply(this, args);
        };
        Object.defineProperty(globalThis, "showDirectoryPicker", {
          configurable: true,
          value: !directoryPicker
            ? undefined
            : async () => {
                const mode = localStorage.getItem("test-picker") ?? "parent";
                if (mode === "cancel") throw new DOMException("Cancelled", "AbortError");
                if (mode === "error") throw new DOMException("Picker denied", "NotAllowedError");
                const root = await navigator.storage.getDirectory();
                const parent = await root.getDirectoryHandle("projects", { create: true });
                return mode === "parent" ? parent : await parent.getDirectoryHandle(mode);
              },
        });
        Object.defineProperty(globalThis, "showSaveFilePicker", {
          configurable: true,
          value: async (options: { suggestedName: string }) => {
            localStorage.setItem("test-export-name", options.suggestedName);
            const mode = localStorage.getItem("test-save-picker") ?? "save";
            if (mode === "cancel") throw new DOMException("Cancelled", "AbortError");
            if (mode === "error") throw new DOMException("Picker denied", "NotAllowedError");
            const root = await navigator.storage.getDirectory();
            return await root.getFileHandle("export.epub", { create: true });
          },
        });
      },
      { directoryPicker: options.directoryPicker ?? true },
    );
    await page.goto(`${server.origin}/editor/welcome`);
    await page.locator('astro-island[component-url*="WelcomeActions"]:not([ssr])').waitFor();
    await run(page);
  } finally {
    await browser?.close();
    await server.shutdown();
  }
}

export async function createProject(page: Page, name = "Test Novel"): Promise<void> {
  await page.locator("#welcome-project-new").click();
  await page.locator("#project-name").fill(name);
  await page.locator("#choose-project-location").click();
  await page.getByTestId("project-parent-path").waitFor();
  await page.locator("#create-project-submit").click();
  await page.waitForSelector('[data-ready="true"]');
  await page.locator("#editor").waitFor();
  await page.waitForFunction(
    () =>
      (document.querySelector("#chapter-title") as HTMLInputElement | null)?.value === "Chapter 1",
  );
}

export async function openSidebar(page: Page): Promise<void> {
  const sidebar = page.getByRole("complementary", { name: "Book sections" });
  if ((await sidebar.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Toggle chapters panel" }).click();
  }
}

export async function projectText(page: Page, filename: string): Promise<string> {
  return await page.evaluate(async (file) => {
    const root = await navigator.storage.getDirectory();
    const parent = await root.getDirectoryHandle("projects");
    const project = await parent.getDirectoryHandle("Test Novel");
    return await (await (await project.getFileHandle(file)).getFile()).text();
  }, filename);
}

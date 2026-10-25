import { test } from "vitest";
import type { Browser } from "playwright";
import { launchBrowser } from "../../../packages/shared/test/browser.ts";
import { startWebsiteServer } from "./helpers.ts";
import { setTestReleaseObjects } from "../src/lib/cloudflare-env.test.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

test("browser: native download forms stream private R2 files with and without JavaScript", async () => {
  const names = ["PUBLIC_SITE_URL"];
  const original = new Map(names.map((name) => [name, process.env[name]]));
  const platforms = {
    linux: { label: "Linux", fileName: "Writasaurus.AppImage" },
    macos: { label: "macOS", fileName: "Writasaurus-macos.tar.gz" },
    windows: { label: "Windows", fileName: "Writasaurus.msi" },
  };
  const prefix = "releases/v1.0.0/";
  const manifest = {
    version: "1.0.0",
    releasedAt: "2026-10-15T00:00:00.000Z",
    artifacts: Object.fromEntries(
      Object.entries(platforms).map(([platform, { label, fileName }]) => [
        platform,
        {
          label,
          fileName,
          objectKey: `${prefix}${fileName}`,
          downloadUrl: `/api/releases/${platform}`,
          sizeBytes: 13,
          sha256: "a".repeat(64),
        },
      ]),
    ),
    checksums: {
      fileName: "SHA256SUMS.txt",
      objectKey: `${prefix}SHA256SUMS.txt`,
      downloadUrl: "/api/releases/checksums",
      sha256: "b".repeat(64),
    },
  };
  const server = await startWebsiteServer();
  const { origin } = server;
  delete process.env.PUBLIC_SITE_URL;
  setTestReleaseObjects({
    "latest.json": new TextEncoder().encode(JSON.stringify(manifest)),
    [`${prefix}Writasaurus.AppImage`]: new TextEncoder().encode("test artifact"),
    [`${prefix}Writasaurus-macos.tar.gz`]: new TextEncoder().encode("test artifact"),
    [`${prefix}Writasaurus.msi`]: new TextEncoder().encode("test artifact"),
    [`${prefix}SHA256SUMS.txt`]: new TextEncoder().encode("test artifact"),
  });
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({ javaScriptEnabled, acceptDownloads: true });
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith(`${origin}/`)) return route.continue();
        return route.abort();
      });
      const page = await context.newPage();
      for (const path of ["/download", "/donation/success"]) {
        for (const [platform, { fileName }] of Object.entries(platforms)) {
          await page.goto(`${origin}${path}`);
          const form = page.locator('form[action="/api/download"]');
          if (path === "/download") {
            await form.locator('input[name="donation"][value="none"]').check();
          }
          await form.locator('select[name="platform"]').selectOption(platform);
          const linuxHelp = form.locator("[data-linux-help]");
          assert(
            (await linuxHelp.isVisible()) === (javaScriptEnabled && platform === "linux"),
            `Expected Linux troubleshooting details to be visible only for Linux (JavaScript ${javaScriptEnabled}).`,
          );
          const consent = form.locator("[data-terms-consent]");
          assert(!(await consent.isChecked()), "Terms acceptance must not be preselected.");
          await form.getByRole("button").click();
          assert(
            await consent.evaluate(
              (input) => input instanceof HTMLInputElement && input.validity.valueMissing,
            ),
            "Native form validation must require terms acceptance.",
          );
          assert(page.url() === `${origin}${path}`);
          await consent.check();
          const pendingDownload = page.waitForEvent("download", { timeout: 10_000 });
          await form.getByRole("button").click();
          const download = await pendingDownload;
          assert(download.url() === `${origin}/api/releases/${platform}`);
          assert(download.suggestedFilename() === fileName);
          assert((await download.failure()) === null);
          await download.delete();
        }
      }
      await context.close();
    }
  } finally {
    setTestReleaseObjects(undefined);
    await browser?.close();
    await server.shutdown();
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}, 60_000);

import { test } from "vitest";
import type { Browser } from "playwright";
import { launchBrowser } from "../../../packages/shared/test/browser.ts";
import { startWebsiteServer } from "./helpers.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

test("browser: native download forms follow public R2 redirects with and without JavaScript", async () => {
  const names = ["PUBLIC_SITE_URL", "WRITASAURUS_R2_PUBLIC_BASE_URL"];
  const original = new Map(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const downloadOrigin = "https://downloads.example.com";
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
          downloadUrl: `${downloadOrigin}/${prefix}${fileName}`,
          sizeBytes: 1,
          sha256: "a".repeat(64),
        },
      ]),
    ),
    checksums: {
      fileName: "SHA256SUMS.txt",
      objectKey: `${prefix}SHA256SUMS.txt`,
      downloadUrl: `${downloadOrigin}/${prefix}SHA256SUMS.txt`,
      sha256: "b".repeat(64),
    },
  };
  const server = await startWebsiteServer();
  const { origin } = server;
  delete process.env.PUBLIC_SITE_URL;
  process.env.WRITASAURUS_R2_PUBLIC_BASE_URL = downloadOrigin;
  globalThis.fetch = (input, init) => {
    if (String(input) === `${downloadOrigin}/latest.json`) {
      assert(init?.cache === "no-store");
      return Promise.resolve(Response.json(manifest));
    }
    return originalFetch(input, init);
  };
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({ javaScriptEnabled, acceptDownloads: true });
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith(`${origin}/`)) return route.continue();
        if (url.startsWith(`${downloadOrigin}/${prefix}`)) {
          return route.fulfill({
            contentType: "application/octet-stream",
            headers: { "content-disposition": `attachment; filename="${url.split("/").at(-1)}"` },
            body: "test artifact",
          });
        }
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
          assert(download.url() === `${downloadOrigin}/${prefix}${fileName}`);
          assert(download.suggestedFilename() === fileName);
          assert((await download.failure()) === null);
          await download.delete();
        }
      }
      await context.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
    await browser?.close();
    await server.shutdown();
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}, 60_000);

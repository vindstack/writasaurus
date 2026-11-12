import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { launchBrowser, serveTestApp } from "../../../../packages/shared/test/browser.ts";
import { markOfflineEditorPage, OFFLINE_EDITOR_PAGES } from "../../pwa/public-pages.ts";

test("landing visit installs an anonymous offline editor without caching account or API", async () => {
  const assetPaths = [
    "/_astro/editor.js",
    "/_astro/dynamic.js",
    "/_astro/editor.wasm",
    "/data/synonyms.json",
  ];
  const workerSource = await readFile(
    new URL("../../pwa/service-worker.js", import.meta.url),
    "utf8",
  );
  const worker = workerSource.replace(
    '"__WRITASAURUS_PWA_CONFIG__"',
    JSON.stringify({
      revision: "test",
      assets: assetPaths.map((path) => [path, createHash("sha256").update(path).digest("hex")]),
      pages: OFFLINE_EDITOR_PAGES,
    }),
  );
  const precacheCookies: string[] = [];
  const server = await serveTestApp((request) => {
    const url = new URL(request.url);
    if (url.pathname === "/writasaurus-editor-sw.js") {
      return new Response(worker, { headers: { "content-type": "text/javascript" } });
    }
    if (assetPaths.includes(url.pathname)) {
      precacheCookies.push(request.headers.get("cookie") ?? "");
      return new Response(url.pathname, {
        headers: { "content-type": "application/octet-stream" },
      });
    }
    if (url.pathname === "/") {
      return new Response(
        `<script>navigator.serviceWorker.register("/writasaurus-editor-sw.js");</script>`,
        { headers: { "content-type": "text/html" } },
      );
    }
    if (OFFLINE_EDITOR_PAGES.includes(url.pathname as (typeof OFFLINE_EDITOR_PAGES)[number])) {
      precacheCookies.push(request.headers.get("cookie") ?? "");
      const response = new Response(
        `<h1>${url.pathname}</h1><script nonce="test-nonce">document.body.dataset.scriptRan="yes"</script>`,
        {
          headers: {
            "content-type": "text/html",
            "content-security-policy": "default-src 'self'; script-src 'nonce-test-nonce'",
          },
        },
      );
      return markOfflineEditorPage(request, response);
    }
    return new Response("private account or API data", {
      headers: { "content-type": "text/html" },
    });
  });
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    await context.addCookies([{ name: "session", value: "private", url: server.url }]);
    const page = await context.newPage();
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    expect(precacheCookies).toHaveLength(assetPaths.length + OFFLINE_EDITOR_PAGES.length);
    expect(precacheCookies.every((cookie) => cookie === "")).toBe(true);

    await page.goto(`${server.url}/account`);
    await page.goto(`${server.url}/api/account`);
    const cachedPaths = await page.evaluate(async () => {
      const keys = await caches.keys();
      const entries = await Promise.all(keys.map(async (key) => (await caches.open(key)).keys()));
      return entries.flat().map((entry) => new URL(entry.url).pathname);
    });
    expect(cachedPaths).not.toContain("/account");
    expect(cachedPaths).not.toContain("/api/account");

    await context.setOffline(true);
    for (const path of OFFLINE_EDITOR_PAGES) {
      const response = await page.goto(`${server.url}${path}`);
      expect(response?.headers()["content-security-policy"]).toContain("'nonce-test-nonce'");
      expect(await page.locator("h1").textContent()).toBe(path);
      expect(await page.locator("body").getAttribute("data-script-ran")).toBe("yes");
    }
    for (const path of assetPaths) {
      expect(await page.evaluate(async (url) => (await fetch(url)).text(), path)).toBe(path);
    }
    await expect(page.goto(`${server.url}/account`)).rejects.toThrow();
    await context.close();
  } finally {
    await browser.close();
    await server.shutdown();
  }
}, 120_000);

test("public page opt-in rejects authenticated, non-editor and non-cacheable responses", () => {
  const html = () => new Response("<h1>shell</h1>", { headers: { "content-type": "text/html" } });
  const request = (path: string, headers: Record<string, string> = {}) =>
    new Request(`https://example.test${path}`, {
      headers: { "x-writasaurus-offline": "precache", ...headers },
    });
  expect(
    markOfflineEditorPage(request("/editor"), html()).headers.get("x-writasaurus-offline"),
  ).toBe("public");
  for (const denied of [
    request("/account"),
    request("/api/editor/settings"),
    request("/editor?user=1"),
    request("/editor", { cookie: "session=private" }),
    request("/editor", { authorization: "Bearer private" }),
  ]) {
    expect(markOfflineEditorPage(denied, html()).headers.has("x-writasaurus-offline")).toBe(false);
  }
  const privateResponse = new Response("private", {
    headers: { "content-type": "text/html", "cache-control": "no-store" },
  });
  expect(
    markOfflineEditorPage(request("/editor"), privateResponse).headers.has("x-writasaurus-offline"),
  ).toBe(false);
});

test("manifest icons are PNGs with the declared install sizes", async () => {
  const assets = new URL("../../pwa/assets/", import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL("writasaurus-editor.webmanifest", assets), "utf8"),
  ) as {
    icons: { src: string; sizes: string; type: string }[];
  };
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
    expect(icon?.type).toBe("image/png");
    const bytes = await readFile(new URL(icon!.src.slice(1), assets));
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
});

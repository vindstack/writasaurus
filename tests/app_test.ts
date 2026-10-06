import { createTestApp } from "./helpers.ts";

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed");
}

const app = createTestApp({ isDesktop: () => true });

Deno.test("renders the editor on the root route as a single island", async () => {
  const response = await app.request("/");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("<title>Writasaurus</title>"));
  assert(page.includes("<astro-island"));
  assert(page.includes('component-url="/_astro/EditorApp.'));
  assert(page.includes('id="editor"'));
  assert(page.includes('id="manuscript-title"'));
  assert(page.includes('id="editor-file-input"'));
  assert(!page.includes("<editor-app"));
  assert(!page.includes("style="));
});

Deno.test("renders welcome page with open manuscript options and return to editor link", async () => {
  const response = await app.request("/welcome");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("Open Manuscript"));
  assert(page.includes("Writasaurus"));
  assert(page.includes("Browse Local File"));
  assert(page.includes("Start New Manuscript"));
  assert(page.includes("Load Sample Novel"));
  assert(page.includes('accept=".epub,application/epub+zip"'));
  assert(!page.includes(".markdown"));
  assert(!page.includes(".txt"));
  assert(page.includes('href="/"'));
  assert(page.includes("Return to Editor"));
  assert(page.includes("<title>Open Manuscript — Writasaurus</title>"));
  assert(page.includes('component-url="/_astro/WelcomeActions.'));
  assert(page.includes('href="/about"'));

  const aliasResponse = await app.request("/open");
  assert(aliasResponse.status === 200);
  const aliasPage = await aliasResponse.text();
  assert(aliasPage.includes("Open Manuscript"));
});

Deno.test("renders about page with description and return to editor link", async () => {
  const response = await app.request("/about");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("About Writasaurus"));
  assert(page.includes("Writasaurus"));
  assert(page.includes('href="/"'));
  assert(page.includes("Return to Editor"));
  assert(page.includes("<title>About — Writasaurus</title>"));
  assert(page.includes("Hello, John Smith!"));
  assert(page.includes("Count: 0"));
  assert(page.includes('component-url="/_astro/AboutCounter.'));
});

Deno.test("renders settings page with font options and return to editor link", async () => {
  const response = await app.request("/settings");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("Settings"));
  assert(page.includes("Writasaurus"));
  assert(page.includes("Editor Font"));
  assert(page.includes("Alegreya"));
  assert(page.includes("System Font"));
  assert(page.includes("Standard Serif"));
  assert(page.includes("Standard Sans-Serif"));
  assert(page.includes("Words per Page"));
  assert(page.includes("words-per-page-input"));
  assert(page.includes('href="/"'));
  assert(page.includes("Return to Editor"));
  assert(page.includes("<title>Settings — Writasaurus</title>"));
  assert(page.includes('component-url="/_astro/SettingsForm.'));
  assert(page.includes("writing-assistance-input"));
});

Deno.test("pages are protected by a nonce-based content security policy", async () => {
  const response = await app.request("/about");
  const policy = response.headers.get("content-security-policy") ?? "";
  const nonce = policy.match(/script-src[^;]*'nonce-([^']+)'/)?.[1];
  assert(nonce);
  assert(!policy.includes("'unsafe-inline'"));
  assert(!policy.includes("upgrade-insecure-requests"));
  const page = await response.text();
  assert(page.includes(`nonce="${nonce}"`));
  assert(!page.includes("style="));
});

Deno.test("stylesheets include view transition rules for smooth page fades", async () => {
  const response = await app.request("/");
  const page = await response.text();
  const hrefs = [...page.matchAll(/href="(\/[^"]+\.css[^"]*)"/g)].map((match) => match[1]);
  assert(hrefs.length > 0);
  const sheets = await Promise.all(
    hrefs.map(async (href) => await (await app.request(href)).text()),
  );
  const inlineStyles = [...page.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (match) => match[1],
  );
  const css = [...inlineStyles, ...sheets].join("\n");
  assert(css.includes("view-transition"));
  assert(css.includes(":active"));
  assert(css.includes(":disabled"));
});

Deno.test("returns 404 for missing routes and protected manifest", async () => {
  const missing = await app.request("/not-found");
  assert(missing.status === 404);

  const manifest = await app.request("/manifest.json");
  assert(manifest.status === 404);
});

Deno.test("renders the marketing homepage and gates its download placeholder", async () => {
  const website = createTestApp({ isDesktop: () => false });
  const response = await website.request("/");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("<title>Writasaurus — A calmer space for long-form writing</title>"));
  assert(page.includes("Make room for the story only you can tell."));
  assert(page.includes("Writasaurus is for personal use"));
  assert(page.includes('href="/agreement"'));
  assert(page.includes('component-url="/_astro/DownloadConsent.'));
  assert(page.includes('data-testid="agreement-acceptance"'));
  assert(!page.includes('component-url="/_astro/EditorApp.'));
  assert(!page.includes('id="editor"'));
});

Deno.test("reports missing release download configuration", async () => {
  const previous = Deno.env.get("WRITASAURUS_RELEASES_PUBLIC_URL");
  Deno.env.delete("WRITASAURUS_RELEASES_PUBLIC_URL");
  try {
    const response = await createTestApp({ isDesktop: () => false }).request(
      "/api/releases/latest",
    );
    assert(response.status === 503);
    const payload = await response.json();
    assert(payload.error === "Release downloads are not configured.");
  } finally {
    if (previous !== undefined) Deno.env.set("WRITASAURUS_RELEASES_PUBLIC_URL", previous);
  }
});

Deno.test("publishes the application license and EPUB ownership terms", async () => {
  const website = createTestApp({ isDesktop: () => false });
  const response = await website.request("/agreement");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("<title>Writasaurus License Agreement</title>"));
  assert(page.includes("your own personal use"));
  assert(page.includes("You may not copy"));
  assert(page.includes("You retain ownership"));
  assert(page.includes("You may keep, use, and distribute"));
  assert(page.includes("has not been reviewed by a lawyer"));
  assert(page.includes('aria-label="Writasaurus home"'));
  assert(page.includes("Back to home"));

  const stylesheets = [...page.matchAll(/href="(\/[^"]+\.css[^"]*)"/g)].map(
    (match) => match[1],
  );
  const css = await Promise.all(
    stylesheets.map(async (href) => await (await website.request(href)).text()),
  );
  assert(css.some((sheet) => sheet.includes("#f5f4ec")));
  assert(css.some((sheet) => sheet.includes("#344f35")));
});

Deno.test("hides Desktop app routes and APIs from the website", async () => {
  const website = createTestApp({ isDesktop: () => false });
  for (
    const path of [
      "/welcome",
      "/open",
      "/settings",
      "/about",
      "/api/editor",
      "/api/editor/status",
    ]
  ) {
    const response = await website.request(path);
    if (response.status !== 404) {
      throw new Error(`Expected ${path} to be hidden from website mode`);
    }
  }

  const post = await website.request("/api/editor/save", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({ content: "private API" }),
  });
  assert(post.status === 404);
});

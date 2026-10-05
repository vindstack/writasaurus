import { createTestApp } from "./helpers.ts";

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed");
}

const app = createTestApp();

Deno.test("renders the editor on the root route as a single island", async () => {
  const response = await app.request("/");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("<title>Writasaurus</title>"));
  assert(page.includes("frsh:island:EditorApp"));
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
  assert(page.includes("frsh:island:WelcomeActions"));
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
  assert(page.includes("frsh:island:AboutCounter"));
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
  assert(page.includes("frsh:island:SettingsForm"));
  assert(!page.includes("writing-assistance-input"));
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
  const css = sheets.join("\n");
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

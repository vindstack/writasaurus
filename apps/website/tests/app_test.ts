import { request } from "./helpers.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("website root always renders the paid marketing page", async () => {
  const response = await request("/");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("A quiet, private space for your next chapter."));
  assert(!page.includes("Download the latest version"));
  assert(!page.includes('data-platform="linux"'));
  assert(!page.includes('data-platform="macos"'));
  assert(!page.includes('data-platform="windows"'));
  assert(!page.includes('src="/latest.json"'));
  assert(page.includes("$59.99 USD"));
  assert(page.includes('href="/checkout"'));
  assert(page.includes('href="/account"'));
  assert(!page.includes('id="editor"'));
  assert(!page.includes('component-url="/_astro/EditorApp.'));
});

Deno.test("desktop editor routes are absent from the website app", async () => {
  for (const path of ["/welcome", "/open", "/settings", "/api/editor/status"]) {
    const response = await request(path);
    assert(response.status === 404, `Expected ${path} to be absent.`);
  }
});

Deno.test("marketing page has nonce-based CSP and terms link", async () => {
  const response = await request("/");
  const policy = response.headers.get("content-security-policy") ?? "";
  const nonce = policy.match(/script-src[^;]*'nonce-([^']+)'/)?.[1];
  assert(nonce);
  const page = await response.text();
  for (const [tag] of page.matchAll(/<(?:script|style)\b[^>]*>/gi)) {
    assert(
      tag.includes(`nonce="${nonce}"`),
      "Expected inline script and style tags to use the CSP nonce",
    );
  }
  assert(page.includes('href="/agreement"'));
});

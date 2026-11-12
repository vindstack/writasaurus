import { test } from "vitest";
import { request } from "./helpers.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

test("website root presents the editor and account", async () => {
  const response = await request("/");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("A quiet, private space for your next chapter."));
  assert(page.includes("Try now"));
  assert(page.includes('href="/editor"'));
  assert(!page.includes("$59.99"));
  assert(!page.includes("license"));
  assert(page.includes('href="/account"'));
  assert(/href="\/account"[^>]*>\s*Sign in\s*<\/a>/.test(page));
  assert(!page.includes("Donor account"));
  assert(!page.includes('id="editor"'));
  assert(!page.includes('component-url="/_astro/EditorApp.'));
  assert(page.includes('src="/princess_and_the_goblin.png"'));
  assert(page.includes('width="997" height="699"'));
  assert(!page.includes("FIELD NOTES"));
});

test("website no longer exposes download, payment, or licensing routes", async () => {
  for (const path of [
    "/checkout",
    "/admin",
    "/api/license/activate",
    "/api/license/refresh",
    "/api/account/refund",
    "/download",
    "/donation/success",
    "/api/download",
    "/api/releases/linux",
    "/api/stripe/webhook",
  ]) {
    const response = await request(path);
    assert(response.status === 404, `Expected ${path} to be absent.`);
  }
});

test("terms describe writing and account email", async () => {
  const response = await request("/agreement");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("You retain ownership"));
  assert(page.includes("Passwordless sign-in codes"));
  assert(!page.includes("Stripe"));
});

test("marketing page has nonce-based CSP and terms link", async () => {
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

test("form redirects allow only the website", async () => {
  const response = await request("/");
  await response.body?.cancel();
  const policy = response.headers.get("content-security-policy") ?? "";
  const formAction = policy.split("; ").find((directive) => directive.startsWith("form-action "));
  assert(formAction === "form-action 'self'");
});

import { test } from "vitest";
import { request } from "./helpers.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

test("website root presents free downloads and optional donations", async () => {
  const response = await request("/");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("A quiet, private space for your next chapter."));
  assert(page.includes("Download for free"));
  assert(page.includes('href="/download"'));
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

test("download forms require explicit acceptance of the terms", async () => {
  for (const path of ["/download", "/donation/success"]) {
    const response = await request(path);
    const page = await response.text();
    const checkbox = page.match(/<input\b[^>]*name="termsAccepted"[^>]*>/)?.[0];
    assert(checkbox);
    assert(checkbox.includes('type="checkbox"'));
    assert(checkbox.includes('value="yes"'));
    assert(checkbox.includes("required"));
    assert(!checkbox.includes("checked"));
    assert(page.includes('href="/agreement"'));
  }
});

test("downloads and donations reject missing or invalid terms acceptance", async () => {
  for (const donation of ["none", "10"]) {
    for (const consent of [undefined, "no", "on", ""]) {
      const body = new URLSearchParams({
        platform: "linux",
        donation,
        email: "writer@example.com",
      });
      if (consent !== undefined) body.set("termsAccepted", consent);
      const response = await request("/api/download", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body,
      });
      assert(response.status === 400);
      assert((await response.text()).includes("must agree to the terms and conditions"));
    }
  }
});

test("website no longer exposes licensing, purchase, or administration routes", async () => {
  for (const path of [
    "/welcome",
    "/open",
    "/settings",
    "/api/editor/status",
    "/checkout",
    "/admin",
    "/api/license/activate",
    "/api/license/refresh",
    "/api/account/refund",
  ]) {
    const response = await request(path);
    assert(response.status === 404, `Expected ${path} to be absent.`);
  }
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

test("download page presents optional email and donation choices", async () => {
  const response = await request("/download");
  assert(response.status === 200);
  const page = await response.text();
  assert(page.includes("Download platform"));
  assert(page.includes("Email address (optional, except for donations)"));
  assert(page.includes('value="none"'));
  assert(/<legend[^>]*>Optional one-time donation \(USD\)<\/legend>/.test(page));
  assert(page.includes('type="radio" name="donation" value="none"'));
  assert(page.includes("Free — enjoy Writasaurus, no donation needed."));
  assert(page.includes('type="radio" name="donation" value="10" checked'));
  assert(page.includes('type="radio" name="donation" value="25"'));
  assert(page.includes('type="radio" name="donation" value="custom"'));
  assert(page.includes('name="marketingEmails"'));
  assert(page.includes('name="marketingEmails" value="yes" checked'));
  assert(page.includes("No email is needed for a free download."));
  assert(page.includes("Downloads are not marked executable automatically."));
  assert(page.includes("sudo apt install libfuse2t64"));
  assert(page.includes("sudo apt install libfuse2"));
  assert(/<details[^>]*data-linux-help[^>]*hidden/.test(page));
});

test("form redirects allow only the website and Stripe", async () => {
  const response = await request("/download");
  await response.body?.cancel();
  const policy = response.headers.get("content-security-policy") ?? "";
  const formAction = policy.split("; ").find((directive) => directive.startsWith("form-action "));
  assert(formAction === "form-action 'self' https://checkout.stripe.com");
});

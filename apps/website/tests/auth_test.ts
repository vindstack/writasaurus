import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { MemoryWebsiteStore, setWebsiteStoreForTests } from "../src/lib/donation-store.ts";
import { POST as requestCode } from "../src/pages/api/auth/request.ts";
import { POST as verifyCode } from "../src/pages/api/auth/verify.ts";
import { removeTestFile, request } from "./helpers.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

class AuthTestStore extends MemoryWebsiteStore {
  refuseCodes = false;

  override createAuthCode(email: string, codeHash: string): Promise<boolean> {
    return this.refuseCodes ? Promise.resolve(false) : super.createAuthCode(email, codeHash);
  }
}

async function withAuth(
  test: (store: AuthTestStore, logFile: string) => Promise<void>,
): Promise<void> {
  const names = [
    "SESSION_SECRET",
    "EMAIL_LOG_FILE",
    "NODE_ENV",
    "PUBLIC_SITE_URL",
    "RESEND_API_KEY",
  ];
  const original = new Map(names.map((name) => [name, process.env[name]]));
  const logFile = `.data/auth-test-${crypto.randomUUID()}.jsonl`;
  const store = new AuthTestStore();
  process.env.SESSION_SECRET = "auth-test-secret-at-least-32-characters-long";
  process.env.EMAIL_LOG_FILE = logFile;
  process.env.PUBLIC_SITE_URL = "http://localhost";
  process.env.NODE_ENV = "test";
  setWebsiteStoreForTests(store);
  try {
    await test(store, logFile);
  } finally {
    setWebsiteStoreForTests(undefined);
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await removeTestFile(logFile);
  }
}

function authRequest(
  path: "request" | "verify",
  values: Record<string, string>,
  json = true,
  throughApp = false,
) {
  const init: RequestInit = {
    method: "POST",
    headers: {
      origin: "http://localhost",
      ...(json ? { accept: "application/json" } : {}),
    },
    body: new URLSearchParams(values),
  };
  if (throughApp) return request(`/api/auth/${path}`, init);
  const handler = path === "request" ? requestCode : verifyCode;
  return handler({ request: new Request(`http://localhost/api/auth/${path}`, init) });
}

async function latestCode(logFile: string): Promise<string> {
  const message = (await readFile(logFile, "utf8")).trim().split("\n").at(-1);
  const code = message?.match(/code is (\d{8})/)?.[1];
  assert(code, "Expected a development passcode email.");
  return code;
}

test("account renders an Astro email-first flow and native code-entry fallback", async () => {
  for (const sent of [false, true]) {
    const response = await request(sent ? "/account?sent=1" : "/account");
    assert(response.status === 200);
    const page = await response.text();
    assert(page.includes("data-sign-in"));
    assert(page.includes('action="/api/auth/request"'));
    assert(page.includes('action="/api/auth/verify"'));
    assert(page.includes('autocomplete="one-time-code"'));
    assert(page.includes('pattern="[0-9]{8}"'));
    assert(page.includes('role="alert"'));
    assert(!page.includes("astro-island"), "Sign-in should not hydrate Vue.");
    assert(/<div\b[^>]*\bdata-email-step\b[^>]*\bhidden\b/.test(page) === sent);
    assert(/<div\b[^>]*\bdata-code-step\b[^>]*\bhidden\b/.test(page) === !sent);
    assert(page.includes("Confirm your email address"));
    const nonce = response.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];
    assert(nonce);
    for (const [tag] of page.matchAll(/<(?:script|style)\b[^>]*>/gi)) {
      assert(tag.includes(`nonce="${nonce}"`));
    }
  }
});

test("enhanced auth validates input and preserves native response contracts", async () => {
  await withAuth(async () => {
    const invalidEmail = await authRequest("request", { email: "invalid" });
    assert(invalidEmail.status === 400);
    assert((await invalidEmail.json()).field === "email");

    const invalidCode = await authRequest("verify", { email: "writer@example.com", code: "12" });
    assert(invalidCode.status === 400);
    assert((await invalidCode.json()).field === "code");

    const invalidVerifyEmail = await authRequest("verify", { email: "invalid", code: "12345678" });
    assert(invalidVerifyEmail.status === 400);
    assert((await invalidVerifyEmail.json()).field === "email");

    const nativeRequest = await authRequest("request", { email: "invalid" }, false);
    assert(nativeRequest.status === 303);
    assert(nativeRequest.headers.get("location") === "http://localhost/account?sent=1");

    const nativeVerify = await authRequest("verify", { email: "invalid", code: "12" }, false);
    assert(nativeVerify.status === 400);
    assert((await nativeVerify.text()).includes("Enter the email address and 8-digit code."));

    const crossOrigin = await request("/api/auth/request", {
      method: "POST",
      headers: { origin: "https://untrusted.example", accept: "application/json" },
      body: new URLSearchParams({ email: "writer@example.com" }),
    });
    assert(crossOrigin.status === 403);
  });
});

test("enhanced sign-in creates a session and codes are single-use", async () => {
  await withAuth(async (_store, logFile) => {
    const sent = await authRequest("request", { email: " Writer@Example.com " }, true, true);
    assert(sent.status === 200);
    assert(sent.headers.get("cache-control") === "no-store");
    const result = await sent.json();
    assert(result.sent === true);
    assert(result.email === "writer@example.com");
    assert(!("code" in result));
    const code = await latestCode(logFile);
    const verified = await authRequest("verify", { email: "writer@example.com", code }, true, true);
    assert(verified.status === 200);
    assert(verified.headers.get("cache-control") === "no-store");
    assert((await verified.json()).verified === true);
    const cookie = verified.headers.get("set-cookie");
    assert(cookie);
    assert(cookie.includes("HttpOnly"));
    assert(cookie.includes("SameSite=Strict"));
    const account = await request("/account", { headers: { cookie: cookie.split(";", 1)[0] } });
    const page = await account.text();
    assert(page.includes("Your account"));
    assert(page.includes("writer@example.com"));
    assert(page.includes("Donation receipts"));
    assert(!page.includes("data-sign-in"));

    const reused = await authRequest("verify", { email: "writer@example.com", code }, true, true);
    assert(reused.status === 400);
    assert(!reused.headers.has("set-cookie"));
    assert((await reused.json()).field === "code");
  });
});

test("verification errors retain attempt and expiry rules; resends replace codes", async () => {
  await withAuth(async (store, logFile) => {
    await authRequest("request", { email: "writer@example.com" });
    const firstCode = await latestCode(logFile);
    await authRequest("request", { email: "writer@example.com" });
    const latest = await latestCode(logFile);
    const active = [...store.codes.values()][0];
    assert(store.codes.size === 1);
    const wrongCode = latest === "00000000" ? "11111111" : "00000000";
    if (latest !== firstCode) {
      const replaced = await authRequest("verify", {
        email: "writer@example.com",
        code: firstCode,
      });
      assert(replaced.status === 400);
      await replaced.body?.cancel();
    }
    active.attempts = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      const invalid = await authRequest("verify", { email: "writer@example.com", code: wrongCode });
      assert(invalid.status === 400);
      assert((await invalid.json()).error.includes("invalid or expired"));
    }
    const exhausted = await authRequest("verify", { email: "writer@example.com", code: latest });
    assert(exhausted.status === 400);
    await exhausted.body?.cancel();

    await authRequest("request", { email: "writer@example.com" });
    const expiredCode = await latestCode(logFile);
    [...store.codes.values()][0].expiresAt = Date.now() - 1;
    const expired = await authRequest("verify", { email: "writer@example.com", code: expiredCode });
    assert(expired.status === 400);
    assert(!expired.headers.has("set-cookie"));
    await expired.body?.cancel();
  });
});

test("enhanced issuance reports refusal without claiming delivery", async () => {
  await withAuth(async (store) => {
    store.refuseCodes = true;
    const limited = await authRequest("request", { email: "writer@example.com" });
    assert(limited.status === 429);
    const result = await limited.json();
    assert(typeof result.error === "string");
    assert(!result.sent);
    assert(store.codes.size === 0);

    const native = await authRequest("request", { email: "writer@example.com" }, false);
    assert(native.status === 303);
  });
});

test("email delivery failures propagate instead of reporting a code was sent", async () => {
  await withAuth(async () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "";
    let failed = false;
    try {
      await authRequest("request", { email: "writer@example.com" });
    } catch (error) {
      assert(error instanceof Error && error.message === "Resend email is not configured.");
      failed = true;
    }
    assert(failed, "A delivery failure must not return a success response.");
  });
});

import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
  isDownloadPlatform,
  isValidEmail,
  parseDonationAmount,
  processStripeEvent,
  startDonationCheckout,
} from "../src/lib/payment-service.ts";
import { MemoryWebsiteStore, setWebsiteStoreForTests } from "../src/lib/donation-store.ts";
import { verifyStripeWebhook } from "../src/lib/stripe.ts";
import { setTestReleaseObjects } from "../src/lib/cloudflare-env.test.ts";
import { removeTestFile, request } from "./helpers.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

test("donation input is validated and normalized to cents", () => {
  assert(parseDonationAmount("none", "") === 0);
  assert(parseDonationAmount("10", "") === 1000);
  assert(parseDonationAmount("25", "") === 2500);
  assert(parseDonationAmount("custom", "12.3") === 1230);
  assert(parseDonationAmount("custom", "12.30") === 1230);
  assert(parseDonationAmount("custom", "1000000") === 100_000_000);
  assert(isDownloadPlatform("linux"));
  assert(!isDownloadPlatform("android"));
  assert(isValidEmail("writer@example.com"));
  assert(isValidEmail(" writer@example.com "));
  assert(!isValidEmail("writer"));

  for (const amount of ["", "0.49", "1.234", "1e3", "-5", "nope"]) {
    let rejected = false;
    try {
      parseDonationAmount("custom", amount);
    } catch (error) {
      rejected = error instanceof TypeError;
    }
    assert(rejected, `Expected ${amount} to be rejected.`);
  }
});

test("Stripe Checkout receives the selected one-time donation amount", async () => {
  const original = {
    secretKey: process.env.STRIPE_SECRET_KEY,
    siteUrl: process.env.PUBLIC_SITE_URL,
    nodeEnv: process.env.NODE_ENV,
  };
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_writasaurus";
  process.env.PUBLIC_SITE_URL = "https://writasaurus.test";
  process.env.NODE_ENV = "production";
  let checkoutParams: URLSearchParams | undefined;
  globalThis.fetch = (input, init) => {
    if (String(input) === "https://api.stripe.com/v1/checkout/sessions") {
      checkoutParams = new URLSearchParams(String(init?.body));
      return Promise.resolve(
        Response.json({ id: "cs_test_session", url: "https://checkout.stripe.com/c/pay/test" }),
      );
    }
    return originalFetch(input, init);
  };
  try {
    const result = await startDonationCheckout("donor@example.com", 2500, "macos");
    assert(!result.mock);
    assert(result.url === "https://checkout.stripe.com/c/pay/test");
    assert(checkoutParams?.get("mode") === "payment");
    assert(checkoutParams?.get("customer_email") === "donor@example.com");
    assert(checkoutParams?.get("line_items[0][price_data][currency]") === "usd");
    assert(checkoutParams?.get("line_items[0][price_data][unit_amount]") === "2500");
    assert(checkoutParams?.get("metadata[donation]") === "true");
    assert(checkoutParams?.get("metadata[amountCents]") === "2500");
    assert(checkoutParams?.get("metadata[platform]") === "macos");
    assert(checkoutParams?.get("success_url")?.includes("/donation/success"));
    assert(checkoutParams?.get("cancel_url") === "https://writasaurus.test/download?cancelled=1");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      STRIPE_SECRET_KEY: original.secretKey,
      PUBLIC_SITE_URL: original.siteUrl,
      NODE_ENV: original.nodeEnv,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Stripe webhook signatures are verified and expire", async () => {
  const secret = "test_webhook_secret";
  const body = JSON.stringify({
    id: "evt_test",
    type: "checkout.session.completed",
    data: { object: {} },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)),
  );
  const signature = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const event = await verifyStripeWebhook(
    body,
    `t=${timestamp},v1=${signature}`,
    secret,
    timestamp,
  );
  assert(event.id === "evt_test");
  let rejected = false;
  try {
    await verifyStripeWebhook(body, `t=${timestamp},v1=${signature}`, secret, timestamp + 301);
  } catch {
    rejected = true;
  }
  assert(rejected, "Expected stale Stripe webhook signatures to be rejected.");
});

test("free downloads and optional donations share normal accounts", async () => {
  const original = {
    provider: process.env.PAYMENT_PROVIDER,
    nodeEnv: process.env.NODE_ENV,
    siteUrl: process.env.PUBLIC_SITE_URL,
    emailLogFile: process.env.EMAIL_LOG_FILE,
    sessionSecret: process.env.SESSION_SECRET,
  };
  const originalFetch = globalThis.fetch;
  const store = new MemoryWebsiteStore();
  const emailLogFile = `.data/test-emails-${crypto.randomUUID()}.jsonl`;
  const release = {
    version: "1.2.3",
    releasedAt: "2026-10-10T00:00:00.000Z",
    artifacts: {
      linux: {
        label: "Linux",
        fileName: "Writasaurus.AppImage",
        objectKey: "releases/v1.2.3/Writasaurus.AppImage",
        downloadUrl: "/api/releases/linux",
        sizeBytes: 1,
        sha256: "a".repeat(64),
      },
      macos: {
        label: "macOS",
        fileName: "Writasaurus-macos.tar.gz",
        objectKey: "releases/v1.2.3/Writasaurus-macos.tar.gz",
        downloadUrl: "/api/releases/macos",
        sizeBytes: 1,
        sha256: "b".repeat(64),
      },
      windows: {
        label: "Windows",
        fileName: "Writasaurus.msi",
        objectKey: "releases/v1.2.3/Writasaurus.msi",
        downloadUrl: "/api/releases/windows",
        sizeBytes: 1,
        sha256: "c".repeat(64),
      },
    },
    checksums: {
      fileName: "SHA256SUMS.txt",
      objectKey: "releases/v1.2.3/SHA256SUMS.txt",
      downloadUrl: "/api/releases/checksums",
      sha256: "d".repeat(64),
    },
  };
  process.env.PAYMENT_PROVIDER = "mock";
  process.env.NODE_ENV = "test";
  process.env.PUBLIC_SITE_URL = "https://writasaurus.test";
  process.env.EMAIL_LOG_FILE = emailLogFile;
  process.env.SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters";
  setWebsiteStoreForTests(store);
  setTestReleaseObjects({
    "latest.json": new TextEncoder().encode(JSON.stringify(release)),
    "releases/v1.2.3/Writasaurus.AppImage": new Uint8Array([1]),
    "releases/v1.2.3/Writasaurus-macos.tar.gz": new Uint8Array([2]),
    "releases/v1.2.3/Writasaurus.msi": new Uint8Array([3]),
    "releases/v1.2.3/SHA256SUMS.txt": new Uint8Array([4]),
  });
  globalThis.fetch = (input, init) => {
    if (String(input) === "https://api.resend.com/emails") {
      return Promise.reject(new Error("Development emails must not call Resend."));
    }
    return originalFetch(input, init);
  };

  try {
    const freeForm = new FormData();
    freeForm.set("platform", "linux");
    freeForm.set("donation", "none");
    freeForm.set("termsAccepted", "yes");
    const freeDownload = await request("/api/download", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: freeForm,
    });
    assert(freeDownload.status === 303);
    assert(freeDownload.headers.get("location") === "http://localhost/api/releases/linux");

    setTestReleaseObjects({
      "latest.json": new TextEncoder().encode(
        JSON.stringify({ ...release, artifacts: { linux: release.artifacts.linux } }),
      ),
      "releases/v1.2.3/Writasaurus.AppImage": new Uint8Array([1]),
      "releases/v1.2.3/SHA256SUMS.txt": new Uint8Array([4]),
    });
    const unavailablePlatform = await request("/api/download", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: new URLSearchParams({
        platform: "windows",
        donation: "none",
        termsAccepted: "yes",
      }),
    });
    assert(unavailablePlatform.status === 404);
    const unavailableDonation = await request("/api/download", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: new URLSearchParams({
        platform: "windows",
        email: "writer@example.com",
        donation: "10",
        termsAccepted: "yes",
      }),
    });
    assert(unavailableDonation.status === 404);
    setTestReleaseObjects({
      "latest.json": new TextEncoder().encode(JSON.stringify(release)),
      "releases/v1.2.3/Writasaurus.AppImage": new Uint8Array([1]),
      "releases/v1.2.3/Writasaurus-macos.tar.gz": new Uint8Array([2]),
      "releases/v1.2.3/Writasaurus.msi": new Uint8Array([3]),
      "releases/v1.2.3/SHA256SUMS.txt": new Uint8Array([4]),
    });

    const noEmailForm = new FormData();
    noEmailForm.set("platform", "windows");
    noEmailForm.set("donation", "10");
    noEmailForm.set("termsAccepted", "yes");
    const noEmail = await request("/api/download", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: noEmailForm,
    });
    assert(noEmail.status === 400);

    const donationForm = new FormData();
    donationForm.set("platform", "windows");
    donationForm.set("email", "writer@example.com");
    donationForm.set("marketingEmails", "yes");
    donationForm.set("donation", "10");
    donationForm.set("termsAccepted", "yes");
    const checkout = await request("/api/download", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: donationForm,
    });
    assert(checkout.status === 303);
    const successUrl = checkout.headers.get("location");
    assert(successUrl && new URL(successUrl, "http://localhost").pathname === "/donation/success");
    assert(
      new URL(successUrl, "http://localhost").searchParams.get("session_id")?.startsWith("mock_"),
    );
    const success = await request(successUrl);
    assert(success.status === 200);
    const successPage = await success.text();
    assert(successPage.includes("Your one-time donation of $10.00 USD is confirmed."));
    assert(successPage.includes("Download Writasaurus"));

    const authRequest = await request("/api/auth/request", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: new URLSearchParams({ email: "writer@example.com" }),
    });
    assert(authRequest.status === 303);
    const emailMessages = (await readFile(emailLogFile, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { text: string });
    const passcode = emailMessages.at(-1)?.text.match(/code is (\d{8})/)?.[1];
    assert(passcode, "Expected a passwordless sign-in code.");

    const verify = await request("/api/auth/verify", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: new URLSearchParams({ email: "writer@example.com", code: passcode }),
    });
    assert(verify.status === 303);
    const sessionCookie = (verify.headers.get("set-cookie") ?? "").split(";", 1)[0];
    const account = await request("/account", { headers: { cookie: sessionCookie } });
    assert(account.status === 200);
    const accountPage = await account.text();
    assert(accountPage.includes("Donation receipts"));
    assert(accountPage.includes("10.00 USD"));
    assert(accountPage.includes('name="marketingEmails" value="yes" checked'));
    assert(!accountPage.includes("Download history"));
    assert(accountPage.includes("Passcode emails needed to sign in are always sent"));

    const preference = await request("/api/account/preferences", {
      method: "POST",
      headers: { cookie: sessionCookie, origin: "http://localhost" },
      body: new URLSearchParams(),
    });
    assert(preference.status === 303);
    const updatedAccount = await request("/account", { headers: { cookie: sessionCookie } });
    assert(!(await updatedAccount.text()).includes('name="marketingEmails" value="yes" checked'));

    const unpaidEmail = "free-writer@example.com";
    const unpaidDownload = await request("/api/download", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: new URLSearchParams({
        platform: "linux",
        donation: "none",
        email: unpaidEmail,
        termsAccepted: "yes",
      }),
    });
    assert(unpaidDownload.status === 303);

    const unpaidSignIn = await request("/api/auth/request", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: new URLSearchParams({ email: unpaidEmail }),
    });
    assert(unpaidSignIn.status === 303);
    const unpaidMessage = JSON.parse(
      (await readFile(emailLogFile, "utf8")).trim().split("\n").at(-1)!,
    ) as { to: string; text: string };
    assert(unpaidMessage.to === unpaidEmail);
    const unpaidCode = unpaidMessage.text.match(/code is (\d{8})/)?.[1];
    assert(unpaidCode, "Expected a passcode despite no donation or marketing opt-in.");
    const unpaidVerify = await request("/api/auth/verify", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: new URLSearchParams({ email: unpaidEmail, code: unpaidCode }),
    });
    assert(unpaidVerify.status === 303);
    const unpaidCookie = (unpaidVerify.headers.get("set-cookie") ?? "").split(";", 1)[0];
    assert(unpaidCookie.startsWith("wr_session="));
    const unpaidAccount = await request("/account", { headers: { cookie: unpaidCookie } });
    assert(unpaidAccount.status === 200);
    const unpaidPage = await unpaidAccount.text();
    assert(unpaidPage.includes("Your account"));
    assert(unpaidPage.includes(unpaidEmail));
    assert(unpaidPage.includes("No donations are associated with this email yet."));
    assert(!unpaidPage.includes("Donor account"));
    assert(!unpaidPage.includes('name="marketingEmails" value="yes" checked'));
    const unpaidPreference = await request("/api/account/preferences", {
      method: "POST",
      headers: { cookie: unpaidCookie, origin: "http://localhost" },
      body: new URLSearchParams({ marketingEmails: "yes" }),
    });
    assert(unpaidPreference.status === 303);
    const optedInAccount = await request("/account", { headers: { cookie: unpaidCookie } });
    assert((await optedInAccount.text()).includes('name="marketingEmails" value="yes" checked'));
  } finally {
    globalThis.fetch = originalFetch;
    setTestReleaseObjects(undefined);
    setWebsiteStoreForTests(undefined);
    await removeTestFile(emailLogFile);
    for (const [name, value] of Object.entries({
      PAYMENT_PROVIDER: original.provider,
      NODE_ENV: original.nodeEnv,
      PUBLIC_SITE_URL: original.siteUrl,
      EMAIL_LOG_FILE: original.emailLogFile,
      SESSION_SECRET: original.sessionSecret,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Stripe donation events are idempotent and update receipt status", async () => {
  const originalFetch = globalThis.fetch;
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_writasaurus";
  const store = new MemoryWebsiteStore();
  setWebsiteStoreForTests(store);
  globalThis.fetch = (input) => {
    if (String(input).startsWith("https://api.stripe.com/v1/payment_intents/")) {
      return Promise.resolve(
        Response.json({ latest_charge: { receipt_url: "https://stripe.example/receipt" } }),
      );
    }
    return originalFetch(input);
  };
  const event: Parameters<typeof processStripeEvent>[0] = {
    id: "evt_donation",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_live_donation",
        payment_status: "paid",
        amount_total: 2500,
        currency: "usd",
        payment_intent: "pi_donation",
        created: Math.floor(Date.now() / 1000),
        customer_email: "donor@example.com",
        metadata: {
          donation: "true",
          email: "donor@example.com",
          amountCents: "2500",
          platform: "macos",
        },
      },
    },
  };
  try {
    await processStripeEvent(event);
    await processStripeEvent(event);
    const donation = await store.getDonationBySession("cs_live_donation");
    assert(donation?.amountTotal === 2500);
    assert(donation.receiptUrl === "https://stripe.example/receipt");
    await processStripeEvent({
      id: "evt_refund",
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_donation" } },
    });
    assert((await store.getDonationBySession("cs_live_donation"))?.status === "refunded");
  } finally {
    globalThis.fetch = originalFetch;
    setWebsiteStoreForTests(undefined);
    if (originalSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalSecretKey;
  }
});

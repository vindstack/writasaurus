import { generateLicenseKey } from "../src/lib/license-crypto.ts";
import {
  isValidEmail,
  isValidLicenseKey,
  normalizeLicenseKey,
} from "../src/lib/payment-service.ts";
import { isAllowedDesktopOrigin, licenseCorsHeaders } from "../src/lib/license-cors.ts";
import { verifyStripeWebhook } from "../src/lib/stripe.ts";
import { signLicenseToken } from "../src/lib/license-crypto.ts";
import { MemoryLicenseStore, setLicenseStoreForTests } from "../src/lib/store.ts";
import { verifyLicenseToken } from "../../../packages/shared/license.ts";
import { request } from "./helpers.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("payment: validates generated license keys and normalized input", () => {
  const key = generateLicenseKey();
  assert(isValidLicenseKey(key));
  assert(isValidLicenseKey(key.toLowerCase().replace("-", " ")));
  assert(normalizeLicenseKey(key) === key.replace("-", ""));
  assert(!isValidLicenseKey("WRIT-not-a-key"));
});

Deno.test("payment: validates purchaser email addresses", () => {
  assert(isValidEmail("writer@example.com"));
  assert(isValidEmail(" writer@example.com "));
  assert(!isValidEmail("writer"));
  assert(!isValidEmail(`${"a".repeat(250)}@example.com`));
});

Deno.test("payment: allows only local desktop origins for activation CORS", () => {
  const local = new Request("https://licenses.example/api/license/activate", {
    headers: { origin: "http://127.0.0.1:8000" },
  });
  const hostile = new Request("https://licenses.example/api/license/activate", {
    headers: { origin: "https://evil.example" },
  });
  assert(isAllowedDesktopOrigin(local));
  assert(!isAllowedDesktopOrigin(hostile));
  assert(
    licenseCorsHeaders(local).get("access-control-allow-origin") === "http://127.0.0.1:8000",
  );
  assert(licenseCorsHeaders(hostile).get("access-control-allow-origin") === null);
});

Deno.test("payment: verifies Stripe webhook signatures and timestamp freshness", async () => {
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

Deno.test("payment: signs tokens accepted only by the matching desktop public key", async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  if (!("privateKey" in keys)) throw new Error("Ed25519 key generation failed.");
  const privateBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
  const encode = (bytes: Uint8Array) => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  };
  const deviceHash = "a".repeat(64);
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  const token = await signLicenseToken({
    licenseId: "56a5c673-1f8c-4a13-b08a-9585cd7e69fe",
    deviceHash,
    exp: expiresAt,
  }, encode(privateBytes));
  const verified = await verifyLicenseToken(token, encode(publicBytes), deviceHash);
  assert(verified?.exp === expiresAt);
  assert(await verifyLicenseToken(token, encode(publicBytes), "b".repeat(64)) === null);
});

Deno.test("payment: mock checkout reveals a key and enables post-purchase downloads", async () => {
  const original = {
    provider: Deno.env.get("PAYMENT_PROVIDER"),
    deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
    encryptionKey: Deno.env.get("LICENSE_ENCRYPTION_KEY"),
    signingPrivateKey: Deno.env.get("LICENSE_SIGNING_PRIVATE_KEY"),
    siteUrl: Deno.env.get("PUBLIC_SITE_URL"),
    resendApiKey: Deno.env.get("RESEND_API_KEY"),
    resendFrom: Deno.env.get("RESEND_FROM_EMAIL"),
    sessionSecret: Deno.env.get("SESSION_SECRET"),
    r2AccountId: Deno.env.get("WRITASAURUS_R2_ACCOUNT_ID"),
    r2AccessKeyId: Deno.env.get("WRITASAURUS_R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: Deno.env.get("WRITASAURUS_R2_SECRET_ACCESS_KEY"),
    r2Bucket: Deno.env.get("WRITASAURUS_R2_BUCKET"),
  };
  let binary = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
    binary += String.fromCharCode(byte);
  }
  const encryptionKey = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const generatedSigningKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  if (!("privateKey" in generatedSigningKeys)) {
    throw new Error("Could not generate test signing keys.");
  }
  const signingPrivateKey = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", generatedSigningKeys.privateKey),
  );
  const signingPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", generatedSigningKeys.publicKey),
  );
  const encode = (bytes: Uint8Array) => {
    let value = "";
    for (const byte of bytes) value += String.fromCharCode(byte);
    return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  };
  Deno.env.set("PAYMENT_PROVIDER", "mock");
  Deno.env.delete("DENO_DEPLOYMENT_ID");
  Deno.env.set("LICENSE_ENCRYPTION_KEY", encryptionKey);
  Deno.env.set("LICENSE_SIGNING_PRIVATE_KEY", encode(signingPrivateKey));
  Deno.env.set("PUBLIC_SITE_URL", "https://writasaurus.test");
  Deno.env.set("RESEND_API_KEY", "test-api-key");
  Deno.env.set("RESEND_FROM_EMAIL", "Writasaurus <test@example.com>");
  Deno.env.set("SESSION_SECRET", "test-session-secret-that-is-at-least-32-characters");
  Deno.env.set("WRITASAURUS_R2_ACCOUNT_ID", "test-account");
  Deno.env.set("WRITASAURUS_R2_ACCESS_KEY_ID", "test-access-key");
  Deno.env.set("WRITASAURUS_R2_SECRET_ACCESS_KEY", "test-secret-key");
  Deno.env.set("WRITASAURUS_R2_BUCKET", "test-bucket");
  setLicenseStoreForTests(new MemoryLicenseStore());
  const originalFetch = globalThis.fetch;
  const sentEmailBodies: string[] = [];
  const release = {
    version: "1.2.3",
    releasedAt: "2026-10-10T00:00:00.000Z",
    artifacts: {
      linux: {
        label: "Linux",
        fileName: "Writasaurus.AppImage",
        objectKey: "releases/v1.2.3/Writasaurus.AppImage",
        downloadUrl: "https://downloads.example/releases/v1.2.3/Writasaurus.AppImage",
        sizeBytes: 1,
        sha256: "a".repeat(64),
      },
      macos: {
        label: "macOS",
        fileName: "Writasaurus-macos.tar.gz",
        objectKey: "releases/v1.2.3/Writasaurus-macos.tar.gz",
        downloadUrl: "https://downloads.example/releases/v1.2.3/Writasaurus-macos.tar.gz",
        sizeBytes: 1,
        sha256: "b".repeat(64),
      },
      windows: {
        label: "Windows",
        fileName: "Writasaurus.msi",
        objectKey: "releases/v1.2.3/Writasaurus.msi",
        downloadUrl: "https://downloads.example/releases/v1.2.3/Writasaurus.msi",
        sizeBytes: 1,
        sha256: "c".repeat(64),
      },
    },
    checksums: {
      fileName: "SHA256SUMS.txt",
      objectKey: "releases/v1.2.3/SHA256SUMS.txt",
      downloadUrl: "https://downloads.example/releases/v1.2.3/SHA256SUMS.txt",
      sha256: "d".repeat(64),
    },
  };
  globalThis.fetch = (input, init) => {
    if (String(input) === "https://api.resend.com/emails") {
      if (typeof init?.body === "string") {
        sentEmailBodies.push(JSON.parse(init.body).text);
      }
      return Promise.resolve(Response.json({ id: "test-email" }));
    }
    if (String(input) === "https://writasaurus.test/latest.json") {
      return Promise.resolve(Response.json(release));
    }
    return originalFetch(input, init);
  };

  try {
    const form = new FormData();
    form.set("email", "writer@example.com");
    const checkout = await request("/api/checkout", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: form,
    });
    assert(checkout.status === 303);
    const successUrl = checkout.headers.get("location");
    assert(successUrl);
    assert(successUrl.includes("/checkout/success?session_id=mock_"));
    const success = await request(successUrl);
    assert(success.status === 200);
    const firstPage = await success.text();
    const key = firstPage.match(/<code>(WRIT-[A-F0-9]{48})<\/code>/)?.[1];
    assert(key, "Expected the mock purchase key on the first success page.");
    assert(firstPage.includes("Download Writasaurus"));
    for (const platform of ["linux", "macos", "windows"]) {
      assert(
        firstPage.includes(`value="${platform}"`),
        `Expected the post-purchase page to offer ${platform}.`,
      );
    }
    const purchaseCookie = (success.headers.get("set-cookie") ?? "").split(";", 1)[0];
    assert(purchaseCookie.startsWith("wr_purchase="));
    for (
      const [platform, fileName] of Object.entries({
        linux: "Writasaurus.AppImage",
        macos: "Writasaurus-macos.tar.gz",
        windows: "Writasaurus.msi",
      })
    ) {
      const downloadForm = new FormData();
      downloadForm.set("platform", platform);
      const download = await request("/api/download", {
        method: "POST",
        headers: { cookie: purchaseCookie, origin: "http://localhost" },
        body: downloadForm,
      });
      assert(download.status === 303, `Expected immediate ${platform} download to redirect.`);
      const downloadUrl = new URL(download.headers.get("location") ?? "");
      assert(downloadUrl.pathname.endsWith(encodeURIComponent(fileName)));
      assert(downloadUrl.searchParams.has("X-Amz-Signature"));
    }

    const authRequestForm = new FormData();
    authRequestForm.set("email", "writer@example.com");
    const authRequest = await request("/api/auth/request", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: authRequestForm,
    });
    assert(authRequest.status === 303);
    const passcode = sentEmailBodies.at(-1)?.match(/account is (\d{8})/)?.[1];
    assert(passcode, "Expected a sign-in code to be emailed after purchase.");
    const authVerifyForm = new FormData();
    authVerifyForm.set("email", "writer@example.com");
    authVerifyForm.set("code", passcode);
    const authVerify = await request("/api/auth/verify", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: authVerifyForm,
    });
    assert(authVerify.status === 303);
    const sessionCookie = (authVerify.headers.get("set-cookie") ?? "").split(";", 1)[0];
    assert(sessionCookie.startsWith("wr_session="));
    const account = await request("/account", { headers: { cookie: sessionCookie } });
    assert(account.status === 200);
    const accountPage = await account.text();
    for (const platform of ["linux", "macos", "windows"]) {
      assert(
        accountPage.includes(`value="${platform}"`),
        `Expected the post-purchase account to offer a ${platform} download.`,
      );
    }

    const artifactNames = {
      linux: "Writasaurus.AppImage",
      macos: "Writasaurus-macos.tar.gz",
      windows: "Writasaurus.msi",
    } as const;
    for (const [platform, fileName] of Object.entries(artifactNames)) {
      const downloadForm = new FormData();
      downloadForm.set("platform", platform);
      const download = await request("/api/download", {
        method: "POST",
        headers: { cookie: sessionCookie, origin: "http://localhost" },
        body: downloadForm,
      });
      assert(download.status === 303, `Expected ${platform} download to redirect.`);
      const downloadUrl = new URL(download.headers.get("location") ?? "");
      assert(downloadUrl.pathname.endsWith(encodeURIComponent(fileName)));
      assert(downloadUrl.searchParams.has("X-Amz-Signature"));
    }

    const deviceHash = "a".repeat(64);
    const activation = await request("/api/license/activate", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:8001",
        "content-type": "application/json",
      },
      body: JSON.stringify({ key, deviceHash }),
    });
    if (activation.status !== 200) {
      throw new Error(await activation.text());
    }
    const activated = await activation.json();
    assert(
      await verifyLicenseToken(activated.token, encode(signingPublicKey), deviceHash),
      "Desktop public key should verify the activation token.",
    );

    const repeated = await request(successUrl);
    const repeatedPage = await repeated.text();
    assert(!repeatedPage.includes(`<code>${key}</code>`));
    assert(repeatedPage.includes("already been revealed"));
  } finally {
    globalThis.fetch = originalFetch;
    setLicenseStoreForTests(undefined);
    for (
      const [name, value] of Object.entries({
        PAYMENT_PROVIDER: original.provider,
        DENO_DEPLOYMENT_ID: original.deploymentId,
        LICENSE_ENCRYPTION_KEY: original.encryptionKey,
        LICENSE_SIGNING_PRIVATE_KEY: original.signingPrivateKey,
        PUBLIC_SITE_URL: original.siteUrl,
        RESEND_API_KEY: original.resendApiKey,
        RESEND_FROM_EMAIL: original.resendFrom,
        SESSION_SECRET: original.sessionSecret,
        WRITASAURUS_R2_ACCOUNT_ID: original.r2AccountId,
        WRITASAURUS_R2_ACCESS_KEY_ID: original.r2AccessKeyId,
        WRITASAURUS_R2_SECRET_ACCESS_KEY: original.r2SecretAccessKey,
        WRITASAURUS_R2_BUCKET: original.r2Bucket,
      })
    ) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});

import { readFile } from "node:fs/promises";
import { test } from "vitest";
import type { Browser } from "playwright";
import { launchBrowser } from "../../../packages/shared/test/browser.ts";
import { removeTestFile, startWebsiteServer } from "./helpers.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

test("browser: Astro sign-in works inline and with JavaScript disabled", async () => {
  const names = ["SESSION_SECRET", "EMAIL_LOG_FILE", "NODE_ENV", "PUBLIC_SITE_URL", "DATABASE_URL"];
  const original = new Map(names.map((name) => [name, process.env[name]]));
  const logFile = `.data/sign-in-browser-${crypto.randomUUID()}.jsonl`;
  process.env.SESSION_SECRET = "browser-auth-test-secret-at-least-32-characters";
  process.env.EMAIL_LOG_FILE = logFile;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  const server = await startWebsiteServer();
  const { origin } = server;
  process.env.PUBLIC_SITE_URL = origin;
  let browser: Browser | undefined;

  async function latestCode(): Promise<string> {
    const message = (await readFile(logFile, "utf8")).trim().split("\n").at(-1);
    const code = message?.match(/code is (\d{8})/)?.[1];
    assert(code, "Expected a development passcode.");
    return code;
  }

  try {
    browser = await launchBrowser();
    const context = await browser.newContext();
    await context.route("**/*", (route) =>
      route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install();
    await page.goto(`${origin}/account`);
    await page.getByLabel("Email address", { exact: true }).fill("Writer@Example.com");

    await page.route("**/api/auth/request", (route) => route.abort("failed"));
    await page.getByRole("button", { name: "Email me a sign-in code" }).click();
    await page.getByRole("alert").filter({ hasText: "Couldn't connect" }).waitFor();
    assert((await page.locator("#email").inputValue()) === "writer@example.com");
    assert(await page.getByRole("button", { name: "Email me a sign-in code" }).isEnabled());
    await page.unroute("**/api/auth/request");

    await page.route("**/api/auth/request", (route) =>
      route.fulfill({ status: 503, contentType: "text/plain", body: "Service unavailable" }),
    );
    await page.getByRole("button", { name: "Email me a sign-in code" }).click();
    await page.getByRole("alert").filter({ hasText: "temporarily unavailable" }).waitFor();
    assert((await page.locator("[data-sign-in-status]").textContent()) === "");
    await page.unroute("**/api/auth/request");

    const started = Promise.withResolvers<void>();
    const delivery = Promise.withResolvers<void>();
    let requests = 0;
    await page.route("**/api/auth/request", async (route) => {
      requests++;
      started.resolve();
      await delivery.promise;
      await route.continue();
    });
    await page.getByLabel("Email address", { exact: true }).press("Enter");
    await started.promise;
    try {
      assert(await page.getByRole("button", { name: "Sending code..." }).isDisabled());
      assert(
        await page
          .locator("#email")
          .evaluate((input) => input instanceof HTMLInputElement && input.readOnly),
      );
      await page.locator("[data-request-form]").evaluate((form) => {
        if (!(form instanceof HTMLFormElement)) throw new Error("Expected the email request form.");
        form.requestSubmit();
      });
      assert(requests === 1, "Pending submissions must not issue duplicate requests.");
    } finally {
      delivery.resolve();
    }
    await page.getByRole("heading", { name: "Check your email" }).waitFor();
    await page.unroute("**/api/auth/request");
    assert(page.url() === `${origin}/account`, "Requesting a code must not navigate.");
    assert(
      (await page.locator("[data-code-destination]").textContent()) ===
        "sent to writer@example.com",
    );
    assert(await page.locator("#code").evaluate((input) => document.activeElement === input));
    await page.setViewportSize({ width: 320, height: 760 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      "The code step should fit a narrow mobile screen.",
    );
    assert(await page.locator("[data-resend-code]").isDisabled());
    await page.clock.fastForward(29_000);
    assert(await page.locator("[data-resend-code]").isDisabled());
    await page.clock.fastForward(1_000);
    assert(await page.locator("[data-resend-code]").isEnabled());

    const initialCode = await latestCode();
    const wrongCode = initialCode === "00000000" ? "11111111" : "00000000";
    await page.getByLabel("8-digit sign-in code").fill(wrongCode);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "invalid or expired" }).waitFor();
    assert((await page.locator("#code").inputValue()) === wrongCode);
    assert((await page.locator("#code").getAttribute("aria-invalid")) === "true");

    await page.getByRole("button", { name: "Resend code", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "A new code" }).waitFor();
    assert((await page.locator("#code").inputValue()) === "");
    assert((await page.locator("#code").getAttribute("aria-invalid")) === null);
    assert(await page.locator("[data-resend-code]").isDisabled());

    await page.getByRole("button", { name: "Change email" }).click();
    assert((await page.locator("#email").inputValue()) === "writer@example.com");
    assert(await page.locator("#email").evaluate((input) => document.activeElement === input));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      "The email step should fit a narrow mobile screen.",
    );
    await page.getByLabel("Email address", { exact: true }).fill("other-writer@example.com");
    await page.getByRole("button", { name: "Email me a sign-in code" }).click();
    await page.getByRole("heading", { name: "Check your email" }).waitFor();
    const currentCode = await latestCode();
    await page.locator("#code").evaluate((input, value) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text", `${value.slice(0, 4)} ${value.slice(4)}`);
      input.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
      );
    }, currentCode);
    assert((await page.locator("#code").inputValue()) === currentCode);
    assert(await page.getByRole("heading", { name: "Check your email" }).isVisible());
    await page.getByLabel("8-digit sign-in code").press("Enter");
    await page.getByRole("heading", { name: "Your account", exact: true }).waitFor();
    assert((await page.locator("main").textContent())?.includes("other-writer@example.com"));
    assert(
      (await context.cookies()).some((cookie) => cookie.name === "wr_session" && cookie.httpOnly),
    );
    assert(errors.length === 0, errors.join("\n"));
    await context.close();

    const nativeContext = await browser.newContext({ javaScriptEnabled: false });
    await nativeContext.route("**/*", (route) =>
      route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort(),
    );
    const nativePage = await nativeContext.newPage();
    await nativePage.goto(`${origin}/account`);
    await nativePage.getByLabel("Email address", { exact: true }).fill("native-writer@example.com");
    await nativePage.getByRole("button", { name: "Email me a sign-in code" }).click();
    await nativePage.waitForURL(`${origin}/account?sent=1`);
    await nativePage.getByLabel("Confirm your email address").fill("native-writer@example.com");
    await nativePage.getByLabel("8-digit sign-in code").fill(await latestCode());
    await nativePage.getByRole("button", { name: "Sign in", exact: true }).click();
    await nativePage.getByRole("heading", { name: "Your account", exact: true }).waitFor();
    assert((await nativePage.locator("main").textContent())?.includes("native-writer@example.com"));
    await nativeContext.close();
  } finally {
    await browser?.close();
    await server.shutdown();
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await removeTestFile(logFile);
  }
}, 60_000);

import { chromium, type Page } from "playwright";
import { createTestApp } from "../helpers.ts";

async function _withEditorPage(test: (page: Page) => Promise<void>): Promise<void> {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    createTestApp().fetch,
  );
  const address = server.addr as Deno.NetAddr;
  const browser = await chromium.launch({
    executablePath: "/home/josh/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
    headless: true,
    env: { ...Deno.env.toObject(), HOME: "/tmp/chrome-profile-a" },
    args: [
      "--no-sandbox",
      "--disable-crash-reporter",
      "--disable-breakpad",
      "--disable-features=Crashpad",
    ],
  });
  const page = await browser.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  try {
    await page.addInitScript(() => {
      sessionStorage.removeItem("writasaurus-manuscript-v1:state");
      sessionStorage.setItem("writasaurus-session:skip-welcome", "true");
    });
    await page.goto(`http://${address.hostname}:${address.port}/`);
    await page.waitForFunction(() => customElements.get("editor-toolbar") !== undefined);
    await test(page);
  } finally {
    await browser.close();
    await server.shutdown();
  }
}

Deno.test("repro: new manuscript flow", async () => {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    createTestApp().fetch,
  );
  const address = server.addr as Deno.NetAddr;
  const browser = await chromium.launch({
    executablePath: "/home/josh/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
    headless: true,
    env: { ...Deno.env.toObject(), HOME: "/tmp/chrome-profile-b" },
    args: [
      "--no-sandbox",
      "--disable-crash-reporter",
      "--disable-breakpad",
      "--disable-features=Crashpad",
    ],
  });
  const page = await browser.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("dialog", async (dialog) => {
    console.log("dialog:", dialog.type(), dialog.message());
    await dialog.accept("My New Book");
  });
  try {
    await page.goto(`http://${address.hostname}:${address.port}/welcome`);
    await page.waitForSelector("#welcome-new");
    await page.locator("#welcome-new").click();
    await page.waitForURL(`http://${address.hostname}:${address.port}/`);
    await page.waitForFunction(() => customElements.get("editor-toolbar") !== undefined);
    await page.waitForTimeout(500);
    const sessionRaw = await page.evaluate(() =>
      sessionStorage.getItem("writasaurus-manuscript-v1:state")
    );
    console.log("session storage after nav:", sessionRaw);
    const value = await page.locator("#manuscript-title").inputValue();
    console.log("New manuscript title value:", value);
  } finally {
    await browser.close();
    await server.shutdown();
  }
});

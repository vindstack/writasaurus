import { expect, test } from "vitest";
import { launchBrowser } from "../../../../packages/shared/test/browser.ts";
import { startWebsiteServer } from "../helpers.ts";

declare global {
  interface Window {
    __enterStandaloneMode: () => void;
  }
}

test("landing page redirects to /editor when in PWA standalone mode", async () => {
  const server = await startWebsiteServer();
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Mock navigator.standalone before page loads
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        value: true,
        writable: true,
      });
    });

    await page.goto(server.origin);
    await page.waitForURL("**/editor");

    expect(new URL(page.url()).pathname).toBe("/editor");
  } finally {
    await browser.close();
    await server.shutdown();
  }
}, 60_000);

test("landing page redirects when an open tab switches into standalone app mode", async () => {
  const server = await startWebsiteServer();
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.addInitScript(() => {
      const originalMatchMedia = window.matchMedia;
      let standalone = false;
      const mediaQuery = new EventTarget();
      Object.defineProperties(mediaQuery, {
        matches: { get: () => standalone },
        media: { value: "(display-mode: standalone)" },
        onchange: { value: null, writable: true },
      });
      window.matchMedia = ((query: string) =>
        query === "(display-mode: standalone)"
          ? (mediaQuery as MediaQueryList)
          : originalMatchMedia(query)) as typeof window.matchMedia;
      Object.defineProperty(window, "__enterStandaloneMode", {
        value: () => {
          standalone = true;
          mediaQuery.dispatchEvent(new Event("change"));
        },
      });
    });

    await page.goto(server.origin);
    expect(new URL(page.url()).pathname).toBe("/");
    await page.evaluate(() => {
      window.__enterStandaloneMode();
    });
    await page.waitForURL("**/editor");

    expect(new URL(page.url()).pathname).toBe("/editor");
  } finally {
    await browser.close();
    await server.shutdown();
  }
}, 60_000);

import { createTestApp } from "./helpers.ts";

function assertEquals<T>(actual: T, expected: T, message = ""): void {
  if (actual !== expected) {
    throw new Error(
      `${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// Every unsafe route, exercised for the web server and for Deno Desktop.
const unsafeRoutes = [
  "/api/editor/close",
  "/api/editor/exit",
  "/api/editor/save",
  "/api/editor/save-epub",
  "/api/editor/open",
];

const platforms = {
  web: {},
  // Never exits the process, so the exit route can be exercised safely.
  desktop: { isDesktop: () => true, exit: () => {} },
};

for (const [name, platform] of Object.entries(platforms)) {
  Deno.test(`csrf (${name}): rejects cross-origin unsafe requests`, async () => {
    const app = createTestApp(platform);
    for (const path of unsafeRoutes) {
      const crossOrigin = await app.request(path, {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      });
      assertEquals(crossOrigin.status, 403, `${path} with a foreign Origin.`);

      const crossSite = await app.request(path, {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site", origin: "https://attacker.example" },
      });
      assertEquals(crossSite.status, 403, `${path} with Sec-Fetch-Site cross-site.`);

      const sameSite = await app.request(path, {
        method: "POST",
        headers: { "sec-fetch-site": "same-site", origin: "https://sub.localhost" },
      });
      assertEquals(sameSite.status, 403, `${path} from a sibling subdomain.`);
    }
  });

  Deno.test(`csrf (${name}): allows same-origin browser requests`, async () => {
    const app = createTestApp(platform);
    const allowed: Record<string, string>[] = [
      { origin: "http://localhost" },
      { "sec-fetch-site": "same-origin", origin: "http://localhost" },
      { "sec-fetch-site": "none" },
    ];
    for (const headers of allowed) {
      const response = await app.request("/api/editor/close", { method: "POST", headers });
      assertEquals(response.status, 200, `close with ${JSON.stringify(headers)}.`);
    }
  });

  Deno.test(`csrf (${name}): safe methods are never blocked`, async () => {
    const app = createTestApp(platform);
    const response = await app.request("/api/editor/status", {
      headers: { origin: "https://attacker.example" },
    });
    assertEquals(response.status, 200);
  });
}

import { createTestApp } from "./helpers.ts";

function assertEquals<T>(actual: T, expected: T, message = ""): void {
  if (actual !== expected) {
    throw new Error(
      `${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const unsafeRoutes = [
  "/api/editor/close",
  "/api/editor/exit",
  "/api/editor/save",
  "/api/editor/save-epub",
  "/api/editor/open",
];

Deno.test("csrf: rejects cross-origin unsafe requests", async () => {
  const app = createTestApp({ exit: () => {} });
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
      headers: { "sec-fetch-site": "same-site", origin: "http://sub.localhost" },
    });
    assertEquals(sameSite.status, 403, `${path} from a sibling subdomain.`);
  }
});

Deno.test("csrf: allows same-origin requests and safe methods", async () => {
  const app = createTestApp({ exit: () => {} });
  const response = await app.request("/api/editor/close", {
    method: "POST",
    headers: { origin: "http://localhost" },
  });
  assertEquals(response.status, 200);

  const safe = await app.request("/api/editor/status", {
    headers: { origin: "https://attacker.example" },
  });
  assertEquals(safe.status, 200);
});

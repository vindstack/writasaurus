const config = "__WRITASAURUS_PWA_CONFIG__";
const cacheName = `writasaurus-editor-${config.revision}`;
const assets = new Map(config.assets);
const pages = new Set(config.pages);

function isCacheable(response) {
  const cacheControl = response.headers.get("cache-control") || "";
  const vary = response.headers.get("vary") || "";
  return (
    response.status === 200 &&
    !response.redirected &&
    !/\b(?:private|no-store)\b/i.test(cacheControl) &&
    !/(?:^|,)\s*(?:\*|cookie|authorization)\s*(?:,|$)/i.test(vary)
  );
}

async function fetchPrecache(path, page) {
  const headers = page ? { "x-writasaurus-offline": "precache" } : {};
  const response = await fetch(path, {
    credentials: "omit",
    cache: "reload",
    redirect: "error",
    headers,
  });
  const type = response.headers.get("content-type") || "";
  if (
    !isCacheable(response) ||
    (page &&
      (!type.toLowerCase().includes("text/html") ||
        response.headers.get("x-writasaurus-offline") !== "public" ||
        !/'nonce-[^']+'/.test(response.headers.get("content-security-policy") || ""))) ||
    (!page && type.toLowerCase().includes("text/html"))
  ) {
    throw new Error(`Unsafe or unavailable offline resource: ${path}`);
  }
  if (!page) {
    const bytes = await response.clone().arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== assets.get(path)) throw new Error(`Unexpected offline asset: ${path}`);
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      try {
        const entries = [
          ...Array.from(assets.keys(), (path) => [path, false]),
          ...Array.from(pages, (path) => [path, true]),
        ];
        let next = 0;
        const results = await Promise.allSettled(
          Array.from({ length: 8 }, async () => {
            while (next < entries.length) {
              const [path, page] = entries[next++];
              await cache.put(path, await fetchPrecache(path, page));
            }
          }),
        );
        const failed = results.find((result) => result.status === "rejected");
        if (failed) throw failed.reason;
      } catch (error) {
        await caches.delete(cacheName);
        throw error;
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("writasaurus-editor-") && name !== cacheName)
          .map((name) => caches.delete(name)),
      );
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.search) return;

  if (request.mode === "navigate" && pages.has(url.pathname)) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await (
          await caches.open(cacheName)
        ).match(url.pathname, { ignoreVary: true });
        if (cached) return cached;
        throw new Error("Offline editor page unavailable");
      }),
    );
  } else if (assets.has(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await (
          await caches.open(cacheName)
        ).match(url.pathname, { ignoreVary: true });
        return cached || fetch(request);
      })(),
    );
  }
});

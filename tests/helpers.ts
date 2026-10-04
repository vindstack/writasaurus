import { type Platform, setPlatform } from "../lib/platform.ts";

interface FreshServer {
  fetch(request: Request): Response | Promise<Response>;
}

// Loaded dynamically so type-checking never walks the generated bundle.
const bundle = new URL("../_fresh/server.js", import.meta.url).href;
const server = (await import(bundle)).default as FreshServer;

export interface TestApp {
  fetch(request: Request): Response | Promise<Response>;
  request(url: string, init?: RequestInit): Promise<Response>;
}

/**
 * Exercises the built Fresh server in-process. Requires `deno task build`; platform overrides
 * are shared with the bundle through `globalThis`.
 */
export function createTestApp(platform: Partial<Platform> = {}): TestApp {
  setPlatform(platform);
  return {
    fetch: (request) => server.fetch(request),
    request(url, init) {
      const full = url.startsWith("http") ? url : `http://localhost${url}`;
      return Promise.resolve(server.fetch(new Request(full, init)));
    },
  };
}

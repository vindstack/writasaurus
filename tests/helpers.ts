import { type Platform, setPlatform } from "../src/lib/platform.ts";

import { fetchApp } from "../app.ts";

export interface TestApp {
  fetch(request: Request): Response | Promise<Response>;
  request(url: string, init?: RequestInit): Promise<Response>;
}

/**
 * Exercises the built Astro server in-process. Requires `deno task build`; platform overrides are
 * shared with the bundle through `globalThis`.
 */
export function createTestApp(platform: Partial<Platform> = {}): TestApp {
  setPlatform(platform);
  return {
    fetch: fetchApp,
    request(url, init) {
      const full = url.startsWith("http") ? url : `http://localhost${url}`;
      return fetchApp(new Request(full, init));
    },
  };
}

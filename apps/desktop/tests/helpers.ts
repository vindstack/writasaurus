import { type Platform, setPlatform } from "../src/lib/platform.ts";

import { fetchApp } from "../app.ts";

export interface TestApp {
  fetch(request: Request): Response | Promise<Response>;
  request(url: string, init?: RequestInit): Promise<Response>;
}

/** Exercises the built Desktop Astro server in-process. Requires `deno task build`. */
export function createTestApp(platform: Partial<Platform> = {}): TestApp {
  return {
    fetch(request) {
      setPlatform(platform);
      return fetchApp(request);
    },
    request(url, init) {
      const full = url.startsWith("http") ? url : `http://localhost${url}`;
      setPlatform(platform);
      return fetchApp(new Request(full, init));
    },
  };
}

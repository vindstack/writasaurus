import { createFreshApp, type FreshAppOptions } from "../src/fresh-app.ts";

export interface TestApp {
  request(url: string, init?: RequestInit): Promise<Response>;
}

/** Exercises the Fresh handler in-process, without binding a server or requiring a build. */
export function createTestApp(options: FreshAppOptions = {}): TestApp {
  const handler = createFreshApp(options).handler();
  return {
    request(url, init) {
      const full = url.startsWith("http") ? url : `http://localhost${url}`;
      return Promise.resolve(handler(new Request(full, init)));
    },
  };
}

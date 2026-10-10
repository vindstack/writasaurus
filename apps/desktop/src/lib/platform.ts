/** Exit capability is injectable so API tests can exercise the endpoint safely. */
export interface Platform {
  exit(): void;
}

const KEY = "__WRITASAURUS_PLATFORM__";
type Holder = Record<string, Partial<Platform> | undefined>;

const defaults: Platform = {
  exit: () => Deno.exit(0),
};

/**
 * Overrides the exit behavior for tests. State lives on `globalThis` so tests can configure the
 * built Astro server bundle, which is a separate module graph.
 */
export function setPlatform(overrides: Partial<Platform> | undefined): void {
  (globalThis as unknown as Holder)[KEY] = overrides;
}

export function getPlatform(): Platform {
  return { ...defaults, ...(globalThis as unknown as Holder)[KEY] };
}

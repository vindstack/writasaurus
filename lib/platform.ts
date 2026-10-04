import { checkIsDesktop } from "./desktop.ts";

/** Runtime capabilities that differ between the web server, Deno Desktop, and tests. */
export interface Platform {
  isDesktop(): Promise<boolean> | boolean;
  exit(): void;
}

const KEY = "__WRITASAURUS_PLATFORM__";
type Holder = Record<string, Partial<Platform> | undefined>;

const defaults: Platform = {
  isDesktop: checkIsDesktop,
  exit: () => Deno.exit(0),
};

/**
 * Overrides platform capabilities. State lives on `globalThis` so the Desktop entry point and
 * tests can configure the built Fresh server bundle, which is a separate module graph.
 */
export function setPlatform(overrides: Partial<Platform> | undefined): void {
  (globalThis as unknown as Holder)[KEY] = overrides;
}

export function getPlatform(): Platform {
  return { ...defaults, ...(globalThis as unknown as Holder)[KEY] };
}

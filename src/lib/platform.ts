import { checkIsDesktop } from "./desktop.ts";

/** Runtime capabilities that differ between the web server and Deno Desktop. */
export interface Platform {
  isDesktop(): Promise<boolean> | boolean;
  exit(): void;
}

export function createPlatform(options: Partial<Platform> = {}): Platform {
  return {
    isDesktop: options.isDesktop ?? checkIsDesktop,
    exit: options.exit ?? (() => Deno.exit(0)),
  };
}

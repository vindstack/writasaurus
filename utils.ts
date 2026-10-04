import { createDefine } from "fresh";
import type { Platform } from "./lib/platform.ts";

/** Shared per-request state available to middleware, layouts, and routes. */
export interface State {
  platform: Platform;
}

export const define = createDefine<State>();

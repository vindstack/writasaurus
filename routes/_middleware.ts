import { csp } from "fresh";
import type { State } from "../utils.ts";

const directives = (dev: boolean) => [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  // The Vite dev server injects CSS Modules as <style> elements; production links stylesheets.
  `style-src 'self' ${dev ? "'unsafe-inline' " : ""}https://fonts.googleapis.com`,
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  `connect-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com${
    dev ? " ws: wss:" : ""
  }`,
];

const prodPolicy = csp<State>({ useNonce: true, csp: directives(false) });
// A nonce would make browsers ignore the unsafe-inline that dev styles need.
const devPolicy = csp<State>({ useNonce: false, csp: directives(true) });
// Vite statically replaces import.meta.env.DEV; Fresh reports mode "production" under `vite` dev.
const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
type Ctx = Parameters<typeof prodPolicy>[0];

// Fresh adds upgrade-insecure-requests, which makes WebKit webviews (Deno Desktop) upgrade
// http://127.0.0.1 subresources to https and drop all CSS and scripts.
export default [
  async (ctx: Ctx) => {
    const res = await (isDev ? devPolicy : prodPolicy)(ctx);
    const header = res.headers.get("content-security-policy");
    if (header) {
      res.headers.set(
        "content-security-policy",
        header.split(";").map((d) => d.trim()).filter((d) => d !== "upgrade-insecure-requests")
          .join("; "),
      );
    }
    return res;
  },
];

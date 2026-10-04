import { csp } from "fresh";
import type { State } from "../utils.ts";

export default csp<State>({
  useNonce: true,
  csp: [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com",
  ],
});

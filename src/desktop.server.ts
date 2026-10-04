import "./desktop/desktop.ts";
import { DESKTOP_FLAG } from "./lib/desktop.ts";
// @ts-types="./types/fresh-server.d.ts"
import server from "../_fresh/server.js";

// The built Fresh server shares globalThis, so this marks every request as Desktop.
(globalThis as Record<string, unknown>)[DESKTOP_FLAG] = true;

Deno.serve(server.fetch);

// @ts-types="./types/fresh-server.d.ts"
import server from "./_fresh/server.js";
import { setPlatform } from "./lib/platform.ts";

const win = new Deno.BrowserWindow({
  title: "Writasaurus",
  width: 1000,
  height: 700,
  frameless: true,
});

win.addEventListener?.("close", () => {
  Deno.exit(0);
});

setPlatform({ isDesktop: () => true, exit: () => Deno.exit(0) });

Deno.serve(server.fetch);

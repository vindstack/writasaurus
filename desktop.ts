import { fetchApp } from "./app.ts";
import { setPlatform } from "./src/lib/platform.ts";

const win = new Deno.BrowserWindow({
  title: "Writasaurus",
  width: 1000,
  height: 700,
  frameless: true,
});
win.addEventListener("close", () => Deno.exit(0));

setPlatform({ isDesktop: () => true, exit: () => Deno.exit(0) });

Deno.serve(fetchApp);

import { defineConfig } from "astro/config";
import deno from "@deno/astro-adapter";
import { sharedConfig } from "./astro.config.shared.ts";

export default defineConfig({
  ...sharedConfig,
  adapter: deno({ start: true, hostname: "0.0.0.0", port: 8000 }),
});

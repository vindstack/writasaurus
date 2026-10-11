import { defineConfig } from "astro/config";
import deno from "@deno/astro-adapter";
import { sharedConfig } from "./astro.config.shared.ts";

export default defineConfig({
  ...sharedConfig,
  adapter: deno({ start: false }),
});

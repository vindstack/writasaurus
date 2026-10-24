import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import { sharedConfig } from "./astro.config.shared.ts";

export default defineConfig({
  ...sharedConfig,
  adapter: node({ mode: "standalone" }),
});

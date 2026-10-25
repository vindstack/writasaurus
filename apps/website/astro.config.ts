import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { sharedConfig } from "./astro.config.shared.ts";

export default defineConfig({
  ...sharedConfig,
  adapter: cloudflare({ imageService: "passthrough" }),
});

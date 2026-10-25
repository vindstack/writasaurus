import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import { sharedConfig } from "./astro.config.shared.ts";

export default defineConfig({
  ...sharedConfig,
  outDir: "./dist-test",
  adapter: node({ mode: "middleware" }),
  security: {
    ...sharedConfig.security,
    allowedDomains: [
      { hostname: "localhost" },
      { hostname: "127.0.0.1" },
      { hostname: "writasaurus.test" },
    ],
  },
  vite: {
    ...sharedConfig.vite,
    resolve: {
      alias: {
        "cloudflare:workers": new URL("./src/lib/cloudflare-env.test.ts", import.meta.url).pathname,
      },
    },
  },
});

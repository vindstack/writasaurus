import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import vue from "@astrojs/vue";

export default defineConfig({
  output: "server",
  devToolbar: {
    enabled: false,
  },
  adapter: node({ mode: "middleware" }),
  integrations: [vue()],
  build: {
    inlineStylesheets: "never",
  },
  security: {
    checkOrigin: false,
    allowedDomains: [{ hostname: "localhost" }, { hostname: "127.0.0.1" }],
  },
  vite: {
    envDir: "../../",
    optimizeDeps: {
      include: ["harper.js", "harper.js/slimBinaryInlined"],
    },
    ssr: {
      noExternal: ["@astrojs/vue"],
    },
  },
});

import { defineConfig } from "astro/config";
import deno from "@deno/astro-adapter";
import vue from "@astrojs/vue";

export default defineConfig({
  output: "server",
  devToolbar: {
    enabled: false,
  },
  adapter: deno({ start: false, hostname: "127.0.0.1", port: 8000 }),
  integrations: [vue()],
  build: {
    inlineStylesheets: "never",
  },
  security: {
    checkOrigin: false,
  },
  vite: {
    envDir: "../../",
    ssr: {
      noExternal: ["@astrojs/vue"],
    },
  },
});

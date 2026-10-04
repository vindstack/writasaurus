import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";

export default defineConfig({
  plugins: [
    fresh({
      serverEntry: "src/main.ts",
      clientEntry: "src/client.ts",
      islandsDir: "src/islands",
      routeDir: "src/fresh-routes",
      staticDir: "src/assets/static",
    }),
  ],
});

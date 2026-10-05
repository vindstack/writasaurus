import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";

export default defineConfig({
  // @ts-ignore LSP reporting false error with fresh plugin
  plugins: [fresh()],
  build: {
    rollupOptions: {
      output: {
        // Keeps shared domain modules out of island chunks so each island entry owns its CSS,
        // which is the only CSS Fresh links for an island.
        manualChunks(id) {
          if (id.includes("/lib/editor/") && !id.includes("writing-assistance.ts")) {
            return "editor-lib";
          }
        },
      },
    },
  },
});

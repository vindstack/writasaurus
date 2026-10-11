import vue from "@astrojs/vue";

export const sharedConfig = {
  output: "server" as const,
  devToolbar: {
    enabled: false,
  },
  integrations: [vue()],
  build: {
    inlineStylesheets: "never" as const,
  },
  security: {
    checkOrigin: false,
  },
  vite: {
    build: {
      rolldownOptions: {
        external: ["@db/postgres"],
      },
    },
    ssr: {
      external: ["@db/postgres"],
      noExternal: ["@astrojs/vue"],
    },
  },
} satisfies import("astro").AstroUserConfig;

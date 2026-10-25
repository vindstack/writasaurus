import vue from "@astrojs/vue";

export const sharedConfig = {
  output: "server" as const,
  session: false,
  devToolbar: {
    enabled: false,
  },
  integrations: [vue()],
  build: {
    inlineStylesheets: "never" as const,
  },
  security: {
    checkOrigin: false,
    allowedDomains: [
      { hostname: "localhost" },
      { hostname: "127.0.0.1" },
      ...(process.env.PUBLIC_SITE_URL
        ? [{ hostname: new URL(process.env.PUBLIC_SITE_URL).hostname }]
        : []),
    ],
  },
  vite: {
    ssr: {
      noExternal: ["@astrojs/vue"],
    },
  },
} satisfies import("astro").AstroUserConfig;

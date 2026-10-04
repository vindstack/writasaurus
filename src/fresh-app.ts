import { App, staticFiles } from "fresh";
import { createApp as createLegacyApp } from "./app.ts";
import { registerEditorApi } from "./features/editor/editor.api.ts";
import { isCsrfSafe } from "./lib/security/csrf.ts";
import { createPlatform, type Platform } from "./lib/platform.ts";
import { type State } from "./utils.ts";

export type FreshAppOptions = Partial<Platform>;

/**
 * Builds the Fresh application. Routes are registered programmatically so tests can exercise the
 * handler without a Vite build. Pages not yet migrated fall through to the legacy router.
 */
export function createFreshApp(options: FreshAppOptions = {}): App<State> {
  const platform = createPlatform(options);
  const app = new App<State>();

  app.use(staticFiles());

  app.use((ctx) => {
    if (!isCsrfSafe(ctx.req)) return new Response("Forbidden", { status: 403 });
    ctx.state.platform = platform;
    return ctx.next();
  });

  registerEditorApi(app);

  const legacy = createLegacyApp({ isDesktop: platform.isDesktop, onExit: platform.exit });
  app.all("/*", (ctx) => legacy.fetch(ctx.req));

  return app;
}

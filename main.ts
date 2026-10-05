import { App, staticFiles } from "fresh";
import { isCsrfSafe } from "./lib/security/csrf.ts";
import { getPlatform } from "./lib/platform.ts";
import { type State } from "./utils.ts";

export const app = new App<State>();

app.use(staticFiles());

app.use((ctx) => {
  if (!isCsrfSafe(ctx.req)) return new Response("Forbidden", { status: 403 });
  ctx.state.platform = getPlatform();
  return ctx.next();
});

app.fsRoutes();

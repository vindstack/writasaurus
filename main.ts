import { App, csrf, staticFiles } from "fresh";
import { getPlatform } from "./lib/platform.ts";
import { type State } from "./utils.ts";

export const app = new App<State>();

app.use(staticFiles());

app.use(csrf());

app.use((ctx) => {
  ctx.state.platform = getPlatform();
  return ctx.next();
});

app.fsRoutes();

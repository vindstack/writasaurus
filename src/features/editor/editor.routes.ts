import { type Router } from "../../framework/routing/types.ts";
import { editorView } from "./editor.view.ts";

export const editorRoutes = (router: Router): Router => {
  router.all("/", async (_req, ctx) => {
    return editorView(ctx, { title: "Writasaurus", isDesktop: await ctx.isDesktop() });
  });

  return router;
};

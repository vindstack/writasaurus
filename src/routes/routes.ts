import { type Router } from "../framework/routing/types.ts";
import { fromFileUrl } from "@std/path";
import { serveDir } from "@std/http/file-server";
import { editorRoutes } from "../features/editor/editor.routes.ts";

const distRoot = fromFileUrl(new URL("../../dist", import.meta.url));

export const Routes = (router: Router): Router => {
  editorRoutes(router);

  router.all("/*", async (req) => {
    const { pathname } = new URL(req.url);
    if (pathname === "/manifest.json") {
      return new Response("Not Found", { status: 404 });
    }
    try {
      return await serveDir(req, { fsRoot: distRoot, quiet: true });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  });

  return router;
};

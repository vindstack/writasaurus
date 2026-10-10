import { serveFile } from "jsr:@std/http@^1.1.1/file-server";
import { fromFileUrl } from "jsr:@std/path@^1.1.5";

const clientRoot = new URL("./dist/client/", import.meta.url);

interface AstroServer {
  handle(request: Request): Response | Promise<Response>;
}

// Load dynamically so Deno type-checking does not walk Astro's generated server bundle.
const bundle = new URL("./dist/server/entry.mjs", import.meta.url).href;
const { handle } = (await import(bundle)) as AstroServer;

export async function fetchApp(request: Request): Promise<Response> {
  if (request.method === "GET" || request.method === "HEAD") {
    const pathname = new URL(request.url).pathname;
    try {
      const decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
      const asset = new URL(decoded, clientRoot);
      if (!asset.pathname.startsWith(clientRoot.pathname)) {
        return new Response("Forbidden", { status: 403 });
      }
      if ((await Deno.stat(asset)).isFile) {
        return await serveFile(request, fromFileUrl(asset));
      }
    } catch (error) {
      if (
        !(error instanceof Deno.errors.NotFound) &&
        !(error instanceof Deno.errors.NotADirectory)
      ) {
        throw error;
      }
    }
  }
  return await handle(request);
}

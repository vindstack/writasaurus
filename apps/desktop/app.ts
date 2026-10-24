import { createAppServer, fetchAppRequest, type AppHandler } from "../../packages/shared/server.ts";

const clientRoot = new URL("./dist/client/", import.meta.url);
const bundle = new URL("./dist/server/entry.mjs", import.meta.url).href;
const { handler } = (await import(bundle)) as { handler: AppHandler };

export function fetchApp(request: Request): Promise<Response> {
  return fetchAppRequest(handler, clientRoot, request);
}

export function createServer() {
  return createAppServer(handler, clientRoot);
}

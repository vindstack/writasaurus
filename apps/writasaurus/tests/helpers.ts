import { rm } from "node:fs/promises";
import { once } from "node:events";
import {
  type AppHandler,
  createAppServer,
  fetchAppRequest,
} from "../../../packages/shared/server.ts";

const clientRoot = new URL("../dist-test/client/", import.meta.url);
let middleware: Promise<AppHandler> | undefined;

function loadMiddleware(): Promise<AppHandler> {
  return (middleware ??= import(
    /* @vite-ignore */ new URL("../dist-test/server/entry.mjs", import.meta.url).href
  ).then((entry) => {
    if (typeof entry.handler !== "function") {
      throw new Error("Build the website with astro.config.test.ts before running tests.");
    }
    return entry.handler as AppHandler;
  }));
}

export async function startWebsiteServer() {
  const handler = await loadMiddleware();
  const server = createAppServer(handler, clientRoot);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP test server.");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async shutdown() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.slice(0, -1));
  return await fetchAppRequest(
    await loadMiddleware(),
    clientRoot,
    new Request(request, { headers }),
  );
}

export async function request(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `http://localhost${path}`;
  return await handle(new Request(url, init));
}

export async function removeTestFile(path: string): Promise<void> {
  await rm(path, { force: true });
}

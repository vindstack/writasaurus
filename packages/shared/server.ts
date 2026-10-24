import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { buffer } from "node:stream/consumers";
import serveStatic from "serve-static";

export type AppHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next?: (error?: unknown) => void,
) => void | Promise<void>;

export function createAppServer(handler: AppHandler, clientRoot: URL) {
  const assets = serveStatic(fileURLToPath(clientRoot), { index: false });
  return createServer((request, response) => {
    const fail = (error: unknown) => {
      console.error("Failed to handle application request.", error);
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status =
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        typeof error.statusCode === "number" &&
        error.statusCode >= 400 &&
        error.statusCode <= 599
          ? error.statusCode
          : 500;
      response.writeHead(status);
      response.end();
    };
    try {
      assets(request, response, (error?: unknown) => {
        if (error) {
          fail(error);
          return;
        }
        Promise.resolve(handler(request, response)).catch(fail);
      });
    } catch (error) {
      fail(error);
    }
  });
}

export async function fetchAppRequest(
  handler: AppHandler,
  clientRoot: URL,
  request: Request,
): Promise<Response> {
  const server = createAppServer(handler, clientRoot);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing application address.");
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set("host", url.host);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();
    return await new Promise<Response>((resolve, reject) => {
      const outgoing = httpRequest(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: `${url.pathname}${url.search}`,
          method: request.method,
          headers: Object.fromEntries(headers),
        },
        (incoming) => {
          const responseHeaders = new Headers();
          for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
            responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
          }
          void buffer(incoming)
            .then((bytes) => {
              const status = incoming.statusCode ?? 500;
              resolve(
                new Response(
                  request.method === "HEAD" || [204, 205, 304].includes(status)
                    ? null
                    : new Uint8Array(bytes),
                  { status, headers: responseHeaders },
                ),
              );
            })
            .catch(reject);
        },
      );
      outgoing.once("error", reject);
      outgoing.end(body === undefined ? undefined : Buffer.from(body));
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

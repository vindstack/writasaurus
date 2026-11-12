import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { Browser } from "playwright";

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");

  const configuredPath = process.env.PLAYWRIGHT_CHROME_PATH;
  if (configuredPath) {
    return await chromium.launch({
      executablePath: configuredPath,
      headless: true,
      args: ["--no-sandbox"],
    });
  }
  for (const executablePath of [
    "/snap/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/brave-browser",
  ]) {
    try {
      const executable = await stat(executablePath);
      if (!executable.isFile()) continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    return await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  }
  return await chromium.launch({ executablePath: chromium.executablePath(), headless: true });
}

export async function serveTestApp(
  handler: (request: Request) => Response | Promise<Response>,
): Promise<{ url: string; shutdown(): Promise<void> }> {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const headers = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
        headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      }
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const method = incoming.method ?? "GET";
      const request = new Request(new URL(incoming.url ?? "/", `http://${incoming.headers.host}`), {
        method,
        headers,
        body:
          method === "GET" || method === "HEAD"
            ? undefined
            : Uint8Array.from(Buffer.concat(chunks)),
      });
      const response = await handler(request);
      outgoing.statusCode = response.status;
      outgoing.statusMessage = response.statusText;
      response.headers.forEach((value, name) => {
        if (name !== "set-cookie") outgoing.setHeader(name, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) outgoing.setHeader("set-cookie", cookies);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      if (outgoing.headersSent) {
        outgoing.destroy(error instanceof Error ? error : undefined);
      } else {
        outgoing.writeHead(500);
        outgoing.end(String(error));
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP server address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    shutdown() {
      return new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

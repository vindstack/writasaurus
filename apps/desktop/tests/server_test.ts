import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buffer } from "node:stream/consumers";
import { test, expect } from "vitest";
import { fetchAppRequest, type AppHandler } from "../../../packages/shared/server.ts";

test("Node transport preserves host, method, body, query, redirects and cookies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "writasaurus-server-"));
  const clientRoot = pathToFileURL(`${directory}/`);
  const handler: AppHandler = async (request, response) => {
    const body = await buffer(request);
    response.setHeader("set-cookie", ["first=1; Path=/", "second=2; Path=/"]);
    response.end(
      JSON.stringify({
        host: request.headers.host,
        origin: request.headers.origin,
        method: request.method,
        url: request.url,
        body: body.toString(),
      }),
    );
  };
  try {
    const response = await fetchAppRequest(
      handler,
      clientRoot,
      new Request("http://localhost:8765/api/test?query=value", {
        method: "POST",
        headers: { origin: "http://localhost:8765" },
        body: "payload",
      }),
    );
    expect(await response.json()).toEqual({
      host: "localhost:8765",
      origin: "http://localhost:8765",
      method: "POST",
      url: "/api/test?query=value",
      body: "payload",
    });
    expect(response.headers.getSetCookie()).toEqual(["first=1; Path=/", "second=2; Path=/"]);

    const redirect = await fetchAppRequest(
      (_request, response) => {
        response.writeHead(302, { location: "/target" });
        response.end();
      },
      clientRoot,
      new Request("http://localhost/redirect"),
    );
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/target");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Node static hosting handles HEAD, ranges, and malformed ranges without crashing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "writasaurus-assets-"));
  await writeFile(join(directory, "asset.txt"), "0123456789");
  const root = pathToFileURL(`${directory}/`);
  const handler: AppHandler = (_request, response) => {
    response.writeHead(404);
    response.end();
  };
  try {
    const head = await fetchAppRequest(
      handler,
      root,
      new Request("http://localhost/asset.txt", {
        method: "HEAD",
      }),
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("10");
    expect(await head.text()).toBe("");
    const ranged = await fetchAppRequest(
      handler,
      root,
      new Request("http://localhost/asset.txt", {
        headers: { range: "bytes=0-0" },
      }),
    );
    expect(ranged.status).toBe(206);
    expect(await ranged.text()).toBe("0");
    const invalid = await fetchAppRequest(
      handler,
      root,
      new Request("http://localhost/asset.txt", {
        headers: { range: "bytes=10-1" },
      }),
    );
    expect(invalid.status).toBe(416);
    const full = await fetchAppRequest(handler, root, new Request("http://localhost/asset.txt"));
    expect(await full.text()).toBe("0123456789");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import { readFile } from "node:fs/promises";
import { buffer } from "node:stream/consumers";
import { expect, test } from "vitest";
import { fetchAppRequest, type AppHandler } from "../../../packages/shared/server.ts";

test("Node transport preserves host, method, body, query, redirects and cookies", async () => {
  const root = new URL(".", import.meta.url);
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
  const response = await fetchAppRequest(
    handler,
    root,
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
    (_request, res) => {
      res.writeHead(302, { location: "/target" });
      res.end();
    },
    root,
    new Request("http://localhost/redirect"),
  );
  expect(redirect.status).toBe(302);
  expect(redirect.headers.get("location")).toBe("/target");
});

test("Node static hosting handles HEAD, ranges, and malformed ranges", async () => {
  const root = new URL(".", import.meta.url);
  const source = await readFile(new URL("server_test.ts", root));
  const handler: AppHandler = (_request, response) => {
    response.writeHead(404);
    response.end();
  };
  const head = await fetchAppRequest(
    handler,
    root,
    new Request("http://localhost/server_test.ts", { method: "HEAD" }),
  );
  expect(head.status).toBe(200);
  expect(head.headers.get("content-length")).toBe(String(source.length));
  expect(await head.text()).toBe("");
  const ranged = await fetchAppRequest(
    handler,
    root,
    new Request("http://localhost/server_test.ts", { headers: { range: "bytes=0-0" } }),
  );
  expect(ranged.status).toBe(206);
  expect(await ranged.text()).toBe(source.subarray(0, 1).toString());
  const invalid = await fetchAppRequest(
    handler,
    root,
    new Request("http://localhost/server_test.ts", { headers: { range: "bytes=10-1" } }),
  );
  expect(invalid.status).toBe(416);
  const full = await fetchAppRequest(handler, root, new Request("http://localhost/server_test.ts"));
  expect(await full.text()).toBe(source.toString());
});

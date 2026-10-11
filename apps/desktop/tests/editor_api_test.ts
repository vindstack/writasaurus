import { createTestApp } from "./helpers.ts";
import { firstProjectEpub } from "../src/lib/editor-session.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function createDesktopApp() {
  return createTestApp();
}

Deno.test("project: selects the first EPUB filename in sorted order", () => {
  const filename = firstProjectEpub([
    { name: "z-last.epub", isFile: true },
    { name: "folder.epub", isFile: false },
    { name: "notes.txt", isFile: true },
    { name: "a-first.EPUB", isFile: true },
  ]);
  assertEquals(filename, "a-first.EPUB");
});

Deno.test("project: opening a project returns 204 if no folder is chosen", async () => {
  const app = createDesktopApp();
  const response = await app.request("/api/editor/project/open", {
    method: "POST",
    headers: { origin: "http://localhost" },
  });
  assertEquals(response.status, 204);
});

Deno.test("editor-api: status reports active file properties", async () => {
  const app = createDesktopApp();
  const res = await app.request("/api/editor/status");
  assertEquals(res.status, 200);
  const data = await res.json();
  assert(!("isDesktop" in data));
  assert(data.activeFile === null || typeof data.activeFile === "string");
  assert(data.activePath === null || typeof data.activePath === "string");
});

Deno.test("editor-api: close resets active file state", async () => {
  const app = createDesktopApp();
  const closeRes = await app.request("/api/editor/close", {
    method: "POST",
    headers: { origin: "http://localhost" },
  });
  assertEquals(closeRes.status, 200);
  const closeData = await closeRes.json();
  assertEquals(closeData.ok, true);

  const statusRes = await app.request("/api/editor/status");
  assertEquals(statusRes.status, 200);
  const statusData = await statusRes.json();
  assertEquals(statusData.activeFile, null);
  assertEquals(statusData.activePath, null);
});

Deno.test("editor-api: save validates request payload", async () => {
  const app = createDesktopApp();
  const invalidPayloads = [
    null,
    {},
    { content: 123 },
    { other: "field" },
  ];

  for (const payload of invalidPayloads) {
    const res = await app.request("/api/editor/save", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : "not-json",
    });
    assertEquals(res.status, 400);
    assertEquals(await res.text(), "Invalid manuscript content");
  }
});

Deno.test("editor-api: save returns 204 if no file chosen", async () => {
  const app = createDesktopApp();
  await app.request("/api/editor/close", {
    method: "POST",
    headers: { origin: "http://localhost" },
  });

  const res = await app.request("/api/editor/save", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({ content: "Some content" }),
  });
  assertEquals(res.status, 204);
});

Deno.test("editor-api: exit invokes the configured desktop shutdown callback", async () => {
  let exitCalled = false;
  const app = createTestApp({
    exit: () => {
      exitCalled = true;
    },
  });
  const res = await app.request("/api/editor/exit", {
    method: "POST",
    headers: { origin: "http://localhost" },
  });
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assertEquals(exitCalled, true);
});

Deno.test("editor-api: save-epub validates request payload", async () => {
  const app = createDesktopApp();
  const invalidPayloads = [
    null,
    {},
    { manuscript: "not-an-object" },
    { manuscript: { chapters: "not-an-array" } },
  ];

  for (const payload of invalidPayloads) {
    const res = await app.request("/api/editor/save-epub", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : "not-json",
    });
    assertEquals(res.status, 400);
    assertEquals(await res.text(), "Invalid manuscript data");
  }
});

Deno.test("editor-api: outline save validates request payload", async () => {
  const app = createDesktopApp();
  const response = await app.request("/api/editor/outline/save", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({ content: 123 }),
  });
  assertEquals(response.status, 400);
  assertEquals(await response.text(), "Invalid outline content");
});

Deno.test("editor-api: save-epub returns 204 if no file chosen", async () => {
  const app = createDesktopApp();
  const res = await app.request("/api/editor/save-epub", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      manuscript: {
        filename: "test.md",
        frontmatter: { title: "Test Book" },
        chapters: [{ id: "1", title: "Ch 1", content: "<p>Text</p>", wordCount: 1, charCount: 4 }],
      },
    }),
  });
  assertEquals(res.status, 204);
});

Deno.test("project: create requires a project folder name", async () => {
  const app = createDesktopApp();
  const response = await app.request("/api/editor/project/new", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assertEquals(response.status, 400);
});

Deno.test("project: create requires a selected parent folder", async () => {
  const app = createDesktopApp();
  const response = await app.request("/api/editor/project/new", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({ projectName: "Test Project" }),
  });
  assertEquals(response.status, 400);
});

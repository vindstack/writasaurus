import { expect, test } from "vitest";
import { request } from "./helpers.ts";

test("the editor pages are rendered by the website", async () => {
  for (const [path, content] of [
    ["/editor", "EditorApp."],
    ["/editor/welcome", "Your Projects"],
    ["/editor/about", "About Writasaurus"],
    ["/editor/settings", "Editor Font"],
    ["/editor/project-settings", "Project Settings"],
    ["/editor/goal", "Manuscript Goal"],
  ]) {
    const response = await request(path);
    expect(response.status, path).toBe(200);
    expect(await response.text(), path).toContain(content);
  }
});

test("the editor is protected by the website's nonce-based CSP", async () => {
  const response = await request("/editor");
  const policy = response.headers.get("content-security-policy") ?? "";
  const nonce = policy.match(/script-src[^;]*'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(await response.text()).toContain(`nonce="${nonce}"`);
});

test("obsolete server editor APIs are not exposed", async () => {
  for (const path of [
    "/api/editor/status",
    "/api/editor/save",
    "/api/editor/project/open",
    "/api/editor/drafts",
  ]) {
    expect((await request(path)).status, path).toBe(404);
  }
});

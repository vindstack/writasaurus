import { build } from "esbuild";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchBrowser, serveTestApp } from "../../shared/test/browser.ts";

let browser: Browser;
let server: { url: string; shutdown(): Promise<void> };
let page: Page;

beforeAll(async () => {
  const bundle = await build({
    entryPoints: [new URL("../mod.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    write: false,
  });
  const script = bundle.outputFiles[0].text;
  server = await serveTestApp((request) => {
    if (new URL(request.url).pathname === "/fs.js") {
      return new Response(script, { headers: { "content-type": "text/javascript" } });
    }
    return new Response(
      `<!doctype html><title>fs</title><script type="module">
        import * as fs from "/fs.js";
        globalThis.fs = fs;
      </script>`,
      {
        headers: { "content-type": "text/html" },
      },
    );
  });
  browser = await launchBrowser();
  page = await browser.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => "fs" in globalThis);
  await page.evaluate(async () => {
    // Use a fresh OPFS folder as a stand-in for a user-picked directory.
    const root = await navigator.storage.getDirectory();
    for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
    Object.assign(globalThis, { root });
  });
});

afterAll(async () => {
  await browser?.close();
  await server?.shutdown();
});

describe("file functions against OPFS", () => {
  it("writes, reads, lists, renames, and deletes files", async () => {
    const result = await page.evaluate(async () => {
      const { fs, root } = globalThis as any;
      await fs.writeFile(root, "chapters/one.md", "# One");
      await fs.writeFile(root, "chapters/two.md", new Blob(["# Two"]));
      await fs.createFile(root, "notes.txt", "hi");
      const createDuplicate = await fs.createFile(root, "notes.txt").then(
        () => "ok",
        (error: DOMException) => error.name,
      );
      const flat = (await fs.listFiles(root)).map((entry: any) => entry.path);
      const deep = await fs.listFiles(root, {
        recursive: true,
        filter: (path: string) => path.endsWith(".md"),
      });
      const text = await fs.readText(root, "chapters/one.md");
      const bytes = new Uint8Array(await fs.readBytes(root, "notes.txt")).length;
      await fs.renameEntry(root, "chapters/two.md", "archive/two.md");
      const moved = [
        await fs.exists(root, "chapters/two.md"),
        await fs.exists(root, "archive/two.md"),
        await fs.readText(root, "archive/two.md"),
      ];
      await fs.deleteEntry(root, "chapters", { recursive: true });
      const after = (await fs.listFiles(root, { recursive: true })).map((e: any) => e.path);
      const missing = await fs.exists(root, "nope/deeper.txt");
      return { createDuplicate, flat, deep, text, bytes, moved, after, missing };
    });

    expect(result.createDuplicate).toBe("InvalidModificationError");
    expect(result.flat).toEqual(["notes.txt"]);
    expect(result.deep.map((e: { path: string }) => e.path)).toEqual([
      "chapters/one.md",
      "chapters/two.md",
    ]);
    expect(result.deep[0].size).toBe(5);
    expect(result.text).toBe("# One");
    expect(result.bytes).toBe(2);
    expect(result.moved).toEqual([false, true, "# Two"]);
    expect(result.after).toEqual(["archive/two.md", "notes.txt"]);
    expect(result.missing).toBe(false);
  });

  it("remembers, restores, and forgets a folder handle", async () => {
    const result = await page.evaluate(async () => {
      const { fs, root } = globalThis as any;
      await fs.rememberFolder(root, "test");
      const restored = await fs.restoreFolder("test");
      const same = restored ? await restored.isSameEntry(root) : false;
      await fs.forgetFolder("test");
      return { same, gone: await fs.restoreFolder("test") };
    });
    expect(result).toEqual({ same: true, gone: null });
  });
});

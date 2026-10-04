import { basename } from "@std/path";
import type { App } from "fresh";
import {
  chooseFile,
  clearLastFilePath,
  loadLastFilePath,
  saveLastFilePath,
} from "../../lib/desktop.ts";
import { epubFilename, generateEpub, isEpubFilename, parseEpub } from "../../lib/epub.ts";
import { parseManuscript } from "./client/data.ts";
import type { Manuscript } from "./client/types.ts";
import type { State } from "../../utils.ts";

/** Registers the native-file editor API. The active file is scoped to this app instance. */
export function registerEditorApi(app: App<State>): void {
  let activePath: string | null = null;
  let restoredLastFile = false;

  app.get("/api/editor/status", async (ctx) => {
    const desktop = await ctx.state.platform.isDesktop();

    if (desktop && activePath && !isEpubFilename(activePath)) {
      activePath = null;
      await clearLastFilePath();
    }

    if (desktop && !activePath && !restoredLastFile) {
      restoredLastFile = true;
      const lastPath = await loadLastFilePath();
      if (lastPath && isEpubFilename(lastPath)) {
        activePath = lastPath;
      } else if (lastPath) {
        await clearLastFilePath();
      }
    }

    if (desktop && activePath) {
      try {
        const bytes = await Deno.readFile(activePath);
        const manuscript = await parseEpub(bytes, basename(activePath));
        return Response.json({
          isDesktop: true,
          activeFile: basename(activePath),
          activePath,
          manuscript,
        });
      } catch (error) {
        console.warn("Could not read the active file.", error);
        activePath = null;
        await clearLastFilePath();
      }
    }

    return Response.json({
      isDesktop: desktop,
      activeFile: activePath ? basename(activePath) : null,
      activePath,
    });
  });

  app.post("/api/editor/save", async (ctx) => {
    const payload = await ctx.req.json().catch(() => null);
    if (!payload || (!payload.manuscript && typeof payload.content !== "string")) {
      return new Response("Invalid manuscript content", { status: 400 });
    }

    let manuscript: Manuscript;
    if (payload.manuscript && Array.isArray(payload.manuscript.chapters)) {
      manuscript = payload.manuscript;
    } else if (typeof payload.content === "string") {
      manuscript = parseManuscript(payload.content, payload.filename || "manuscript.epub");
    } else {
      return new Response("Invalid manuscript content", { status: 400 });
    }

    if (payload.saveAs || !activePath) {
      const suggested = epubFilename({
        ...manuscript,
        filename: typeof payload.filename === "string" && payload.filename.trim()
          ? basename(payload.filename)
          : manuscript.filename,
      });
      const chosen = await chooseFile("save", suggested, "EPUB eBook", ["*.epub"]);
      if (!chosen) return new Response(null, { status: 204 });
      activePath = chosen;
      await saveLastFilePath(activePath);
    }

    await Deno.writeFile(activePath, await generateEpub(manuscript));
    return Response.json({ ok: true, name: basename(activePath), path: activePath });
  });

  app.post("/api/editor/save-epub", async (ctx) => {
    const payload = await ctx.req.json().catch(() => null);
    if (!payload || !payload.manuscript || !Array.isArray(payload.manuscript.chapters)) {
      return new Response("Invalid manuscript data", { status: 400 });
    }

    const suggested = epubFilename({
      ...payload.manuscript,
      filename: typeof payload.filename === "string" && payload.filename.trim()
        ? basename(payload.filename)
        : payload.manuscript.filename,
    });
    const chosen = await chooseFile("save", suggested, "EPUB eBook", ["*.epub"]);
    if (!chosen) return new Response(null, { status: 204 });

    await Deno.writeFile(chosen, await generateEpub(payload.manuscript));
    return Response.json({ ok: true, name: basename(chosen), path: chosen });
  });

  app.post("/api/editor/open", async () => {
    const chosen = await chooseFile("open", "manuscript.epub", "EPUB eBook", ["*.epub"]);
    if (!chosen) return new Response(null, { status: 204 });
    try {
      activePath = chosen;
      await saveLastFilePath(activePath);
      const bytes = await Deno.readFile(chosen);
      const manuscript = await parseEpub(bytes, basename(chosen));
      return Response.json({ ok: true, name: basename(chosen), path: chosen, manuscript });
    } catch (error) {
      console.error("Failed to read manuscript:", error);
      return new Response("Failed to read file", { status: 500 });
    }
  });

  app.post("/api/editor/close", async () => {
    activePath = null;
    restoredLastFile = true;
    await clearLastFilePath();
    return Response.json({ ok: true });
  });

  app.post("/api/editor/exit", async (ctx) => {
    if (await ctx.state.platform.isDesktop()) setTimeout(ctx.state.platform.exit, 50);
    return Response.json({ ok: true });
  });
}

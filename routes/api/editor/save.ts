import { basename } from "@std/path";
import { define } from "../../../utils.ts";
import { chooseFile } from "../../../lib/desktop.ts";
import { parseManuscript } from "../../../src/features/editor/client/data.ts";
import type { Manuscript } from "../../../src/features/editor/client/types.ts";
import {
  getActivePath,
  setActivePath,
  suggestedName,
  writeManuscript,
} from "../../../lib/editor-session.ts";

export const handler = define.handlers({
  async POST(ctx) {
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

    let path = getActivePath();
    if (payload.saveAs || !path) {
      const suggested = suggestedName(manuscript, payload.filename);
      const chosen = await chooseFile("save", suggested, "EPUB eBook", ["*.epub"]);
      if (!chosen) return new Response(null, { status: 204 });
      await setActivePath(chosen);
      path = chosen;
    }

    await writeManuscript(path, manuscript);
    return Response.json({ ok: true, name: basename(path), path });
  },
});

import { basename } from "@std/path";
import { define } from "../../../utils.ts";
import { chooseFile } from "../../../lib/desktop.ts";
import { suggestedName, writeManuscript } from "../../../lib/editor-session.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const payload = await ctx.req.json().catch(() => null);
    if (!payload || !payload.manuscript || !Array.isArray(payload.manuscript.chapters)) {
      return new Response("Invalid manuscript data", { status: 400 });
    }

    const suggested = suggestedName(payload.manuscript, payload.filename);
    const chosen = await chooseFile("save", suggested, "EPUB eBook", ["*.epub"]);
    if (!chosen) return new Response(null, { status: 204 });

    await writeManuscript(chosen, payload.manuscript);
    return Response.json({ ok: true, name: basename(chosen), path: chosen });
  },
});

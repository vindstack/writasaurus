import { basename } from "@std/path";
import { define } from "../../../utils.ts";
import { chooseFile } from "../../../lib/desktop.ts";
import { parseEpub } from "../../../lib/epub.ts";
import { setActivePath } from "../../../lib/editor-session.ts";

export const handler = define.handlers({
  async POST() {
    const chosen = await chooseFile("open", "manuscript.epub", "EPUB eBook", ["*.epub"]);
    if (!chosen) return new Response(null, { status: 204 });
    try {
      await setActivePath(chosen);
      const manuscript = await parseEpub(await Deno.readFile(chosen), basename(chosen));
      return Response.json({ ok: true, name: basename(chosen), path: chosen, manuscript });
    } catch (error) {
      console.error("Failed to read manuscript:", error);
      return new Response("Failed to read file", { status: 500 });
    }
  },
});

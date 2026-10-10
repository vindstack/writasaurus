import { chooseFile } from "../../../lib/desktop.ts";
import { parseEpub } from "../../../lib/epub.ts";
import { setActivePath } from "../../../lib/editor-session.ts";
import { basename } from "../../../../../../packages/shared/path.ts";

export const prerender = false;

export async function POST(): Promise<Response> {
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
}

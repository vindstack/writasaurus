import { chooseFile } from "../../../lib/desktop.ts";
import { suggestedName, writeManuscript } from "../../../lib/editor-session.ts";
import { basename } from "../../../lib/path.ts";

export const prerender = false;

export async function POST({ request }: { request: Request }): Promise<Response> {
  const payload = await request.json().catch(() => null);
  if (!payload || !payload.manuscript || !Array.isArray(payload.manuscript.chapters)) {
    return new Response("Invalid manuscript data", { status: 400 });
  }

  const suggested = suggestedName(payload.manuscript, payload.filename);
  const chosen = await chooseFile("save", suggested, "EPUB eBook", ["*.epub"]);
  if (!chosen) return new Response(null, { status: 204 });

  await writeManuscript(chosen, payload.manuscript);
  return Response.json({ ok: true, name: basename(chosen), path: chosen });
}

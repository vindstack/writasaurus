import { closeActiveFile } from "../../../lib/editor-session.ts";

export const prerender = false;

export async function POST(): Promise<Response> {
  await closeActiveFile();
  return Response.json({ ok: true });
}

import { editorStatus } from "../../../lib/editor-session.ts";

export const prerender = false;

export async function GET(): Promise<Response> {
  return Response.json(await editorStatus());
}

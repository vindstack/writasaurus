import { cancelPendingProject } from "../../../../lib/editor-session.ts";

export const prerender = false;

export async function POST(): Promise<Response> {
  cancelPendingProject();
  return Response.json({ ok: true });
}

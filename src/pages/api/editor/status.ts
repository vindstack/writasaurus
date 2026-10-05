import { editorStatus } from "../../../lib/editor-session.ts";
import { getPlatform } from "../../../lib/platform.ts";

export const prerender = false;

export async function GET(): Promise<Response> {
  return Response.json(await editorStatus(await getPlatform().isDesktop()));
}

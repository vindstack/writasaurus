import { chooseDirectory } from "../../../../lib/desktop.ts";
import { setPendingProjectParentPath } from "../../../../lib/editor-session.ts";

export const prerender = false;

export async function POST(): Promise<Response> {
  const parentPath = await chooseDirectory("new");
  if (!parentPath) return new Response(null, { status: 204 });

  setPendingProjectParentPath(parentPath);
  return Response.json({ parentPath });
}

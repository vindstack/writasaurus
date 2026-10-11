import { chooseDirectory } from "../../../../lib/desktop.ts";
import { openProject } from "../../../../lib/editor-session.ts";
import { basename } from "../../../../../../../packages/shared/path.ts";

export const prerender = false;

export async function POST(): Promise<Response> {
  const projectPath = await chooseDirectory("open");
  if (!projectPath) return new Response(null, { status: 204 });

  try {
    const manuscript = await openProject(projectPath);
    if (!manuscript) {
      return Response.json({ needsEpub: true, projectName: basename(projectPath) });
    }
    return Response.json({ ok: true, manuscript });
  } catch (error) {
    console.error("Failed to open project:", error);
    return new Response("Could not open the selected project.", { status: 500 });
  }
}

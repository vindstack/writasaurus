import { createProjectEpub } from "../../../../lib/editor-session.ts";

export const prerender = false;

export async function POST(): Promise<Response> {
  try {
    const manuscript = await createProjectEpub();
    return Response.json({ ok: true, manuscript });
  } catch (error) {
    console.error("Failed to create a project EPUB:", error);
    return new Response("Could not create an EPUB in the selected project.", { status: 500 });
  }
}

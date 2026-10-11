import { writeOutline } from "../../../../lib/editor-session.ts";

export const prerender = false;

export async function POST({ request }: { request: Request }): Promise<Response> {
  const payload = await request.json().catch(() => null);
  if (typeof payload?.content !== "string") {
    return new Response("Invalid outline content", { status: 400 });
  }

  try {
    await writeOutline(payload.content);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Open a project before using Outline.") {
      return new Response(error.message, { status: 409 });
    }
    console.error("Failed to save the project outline:", error);
    return new Response("Could not save the project outline.", { status: 500 });
  }
}

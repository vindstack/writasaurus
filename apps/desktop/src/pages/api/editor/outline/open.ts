import { loadOrCreateOutline } from "../../../../lib/editor-session.ts";

export const prerender = false;

export async function POST(): Promise<Response> {
  try {
    return Response.json({ content: await loadOrCreateOutline() });
  } catch (error) {
    if (error instanceof Error && error.message === "Open a project before using Outline.") {
      return new Response(error.message, { status: 409 });
    }
    console.error("Failed to open the project outline:", error);
    return new Response("Could not open the project outline.", { status: 500 });
  }
}

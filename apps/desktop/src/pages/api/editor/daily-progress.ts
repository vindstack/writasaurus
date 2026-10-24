import { recordActiveProjectDailyProgress } from "../../../lib/editor-session.ts";

export const prerender = false;

export async function POST({ request }: { request: Request }): Promise<Response> {
  const payload: unknown = await request.json().catch(() => null);
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("manuscriptId" in payload) ||
    typeof payload.manuscriptId !== "string" ||
    !("totalWords" in payload) ||
    typeof payload.totalWords !== "number"
  ) {
    return new Response("Invalid daily writing progress request.", { status: 400 });
  }

  try {
    const progress = await recordActiveProjectDailyProgress(
      payload.manuscriptId,
      payload.totalWords,
    );
    if (!progress) {
      return new Response("Open a project to track daily writing progress.", { status: 409 });
    }
    return Response.json(progress, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TypeError) return new Response(error.message, { status: 400 });
    console.error("Could not update daily writing progress.", error);
    return new Response("Could not update daily writing progress.", { status: 500 });
  }
}

import { getDailyWrittenWords } from "../../../lib/app-settings-store.ts";

export const prerender = false;

export async function POST({ request }: { request: Request }): Promise<Response> {
  const payload: unknown = await request.json().catch(() => null);
  if (
    typeof payload !== "object" || payload === null ||
    !("manuscriptId" in payload) || typeof payload.manuscriptId !== "string" ||
    !("totalWords" in payload) || typeof payload.totalWords !== "number"
  ) {
    return new Response("Invalid daily writing progress request.", { status: 400 });
  }

  try {
    return Response.json(
      await getDailyWrittenWords(payload.manuscriptId, payload.totalWords),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof TypeError) return new Response(error.message, { status: 400 });
    console.error("Could not update daily writing progress.", error);
    return new Response("Could not update daily writing progress.", { status: 500 });
  }
}

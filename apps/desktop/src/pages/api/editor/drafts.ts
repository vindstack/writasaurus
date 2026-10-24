import { createDraft, listDrafts, selectDraft } from "../../../lib/editor-session.ts";

export const prerender = false;

export async function GET(): Promise<Response> {
  try {
    return Response.json(await listDrafts());
  } catch (error) {
    console.error("Could not read project drafts:", error);
    return new Response("Could not read project drafts.", { status: 500 });
  }
}

export async function POST({ request }: { request: Request }): Promise<Response> {
  const payload = await request.json().catch(() => null);
  if (payload?.action === "select") {
    if (!Number.isSafeInteger(payload.number) || payload.number < 1) {
      return new Response("A valid draft number is required.", { status: 400 });
    }
    try {
      const manuscript = await selectDraft(payload.number);
      return Response.json({ ok: true, manuscript, ...(await listDrafts()) });
    } catch (error) {
      console.error("Could not select project draft:", error);
      return new Response("Could not select the requested draft.", { status: 500 });
    }
  }

  if (
    payload?.action === "create" &&
    (payload.mode === "blank" || payload.mode === "copy") &&
    Number.isSafeInteger(payload.sourceDraft) &&
    payload.sourceDraft > 0
  ) {
    try {
      return Response.json({
        ok: true,
        ...(await createDraft(payload.mode, payload.sourceDraft)),
      });
    } catch (error) {
      console.error("Could not create project draft:", error);
      return new Response("Could not create the requested draft.", { status: 500 });
    }
  }

  return new Response("Invalid draft operation.", { status: 400 });
}

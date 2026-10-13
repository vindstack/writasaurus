import {
  getActiveProjectDetails,
  updateActiveProjectSettings,
} from "../../../lib/editor-session.ts";

export const prerender = false;

export async function GET(): Promise<Response> {
  try {
    const project = await getActiveProjectDetails();
    if (!project) {
      return new Response("Open a project to access project settings.", { status: 409 });
    }
    return Response.json(project, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Could not read project settings.", error);
    return new Response("Could not read project settings.", { status: 500 });
  }
}

export async function PATCH({ request }: { request: Request }): Promise<Response> {
  const payload: unknown = await request.json().catch(() => null);
  const update = payload && typeof payload === "object" && !Array.isArray(payload) &&
      "user_settings" in payload
    ? payload.user_settings
    : null;
  try {
    const settings = await updateActiveProjectSettings(update);
    if (!settings) {
      return new Response("Open a project to update project settings.", { status: 409 });
    }
    const project = await getActiveProjectDetails();
    if (!project) {
      return new Response("Open a project to update project settings.", { status: 409 });
    }
    return Response.json(project, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TypeError) return new Response(error.message, { status: 400 });
    console.error("Could not save project settings.", error);
    return new Response("Could not save project settings.", { status: 500 });
  }
}

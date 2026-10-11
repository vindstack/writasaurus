import { createProject, hasPendingProjectParentPath } from "../../../../lib/editor-session.ts";

export const prerender = false;

export async function POST({ request }: { request: Request }): Promise<Response> {
  const payload = await request.json().catch(() => null);
  if (typeof payload?.projectName !== "string") {
    return new Response("A project folder name is required.", { status: 400 });
  }
  if (!hasPendingProjectParentPath()) {
    return new Response("Choose a parent folder before creating the project.", { status: 400 });
  }

  try {
    const manuscript = await createProject(payload.projectName);
    return Response.json({ ok: true, projectName: payload.projectName.trim(), manuscript });
  } catch (error) {
    if (error instanceof Deno.errors.AlreadyExists) {
      return new Response(
        "A project with that folder name already exists in the selected directory.",
        {
          status: 409,
        },
      );
    }
    console.error("Failed to create project:", error);
    return new Response("Could not create a project in the selected folder.", { status: 500 });
  }
}

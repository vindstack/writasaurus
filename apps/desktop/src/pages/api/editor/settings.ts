import { getAppSettings, updateAppSettings } from "../../../lib/app-settings-store.ts";

export const prerender = false;

export async function GET(): Promise<Response> {
  try {
    return Response.json(await getAppSettings(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Could not read Writasaurus settings.", error);
    return new Response("Could not read Writasaurus settings.", { status: 500 });
  }
}

export async function PATCH({ request }: { request: Request }): Promise<Response> {
  const payload: unknown = await request.json().catch(() => null);
  try {
    return Response.json(await updateAppSettings(payload), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return new Response(error.message, { status: 400 });
    }
    console.error("Could not save Writasaurus settings.", error);
    return new Response("Could not save Writasaurus settings.", { status: 500 });
  }
}

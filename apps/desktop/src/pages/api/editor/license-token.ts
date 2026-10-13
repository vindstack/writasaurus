import {
  clearLicenseToken,
  getLicenseToken,
  setLicenseToken,
} from "../../../lib/app-settings-store.ts";

export const prerender = false;

export async function GET(): Promise<Response> {
  try {
    return Response.json({ token: await getLicenseToken() }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Could not read the saved Writasaurus license.", error);
    return new Response("Could not read the saved Writasaurus license.", { status: 500 });
  }
}

export async function PUT({ request }: { request: Request }): Promise<Response> {
  const payload: unknown = await request.json().catch(() => null);
  if (typeof payload !== "object" || payload === null || !("token" in payload)) {
    return new Response("Invalid license token.", { status: 400 });
  }
  try {
    await setLicenseToken(payload.token);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof TypeError) return new Response(error.message, { status: 400 });
    console.error("Could not save the Writasaurus license.", error);
    return new Response("Could not save the Writasaurus license.", { status: 500 });
  }
}

export async function DELETE(): Promise<Response> {
  try {
    await clearLicenseToken();
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Could not remove the saved Writasaurus license.", error);
    return new Response("Could not remove the saved Writasaurus license.", { status: 500 });
  }
}

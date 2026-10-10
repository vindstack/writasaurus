import { loadOrCreateInstallationId } from "../../../lib/desktop.ts";

export const prerender = false;

export async function GET(): Promise<Response> {
  try {
    return Response.json({ installationId: await loadOrCreateInstallationId() }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error(
      `Could not read the Writasaurus installation identifier: ${
        error instanceof Error ? error.message : error
      }`,
    );
    return new Response("Could not identify this installation.", { status: 500 });
  }
}

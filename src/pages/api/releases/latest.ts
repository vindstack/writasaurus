import { isPublicHttpsUrl, isReleaseManifest } from "../../../lib/releases.ts";

export const prerender = false;

function publicReleaseBase(): string | null {
  const value = Deno.env.get("WRITASAURUS_RELEASES_PUBLIC_URL")?.replace(/\/+$/, "");
  if (!value || !isPublicHttpsUrl(value) || new URL(value).pathname !== "/") return null;
  return value;
}

export async function GET(): Promise<Response> {
  const base = publicReleaseBase();
  if (!base) {
    return Response.json(
      { error: "Release downloads are not configured." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  let response: Response;
  try {
    response = await fetch(`${base}/latest.json`, {
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    console.error("Could not retrieve the latest Writasaurus release.", error);
    return Response.json(
      { error: "Release downloads are temporarily unavailable." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  if (response.status === 404) {
    return Response.json(
      { error: "No Desktop release is published yet." },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  if (!response.ok) {
    console.error(`Latest release metadata request failed (${response.status}).`);
    return Response.json(
      { error: "Release downloads are temporarily unavailable." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  let manifest: unknown;
  try {
    manifest = await response.json();
  } catch (error) {
    console.error("Latest release metadata is not valid JSON.", error);
    return Response.json(
      { error: "Release information is temporarily invalid." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
  if (!isReleaseManifest(manifest, base)) {
    console.error("Latest release metadata did not match the release manifest schema.");
    return Response.json(
      { error: "Release information is temporarily invalid." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(manifest, {
    headers: {
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      "cdn-cache-control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}

import { env } from "cloudflare:workers";
import { isReleaseManifest, type ReleaseManifest } from "../../../../packages/shared/releases.ts";

export async function currentRelease(): Promise<ReleaseManifest> {
  const latest = await env.R2_DOWNLOAD_DESKTOP_BUCKET.get("latest.json");
  if (!latest) throw new Error("The current release metadata is unavailable.");
  const manifest: unknown = await new Response(latest.body).json();
  if (!isReleaseManifest(manifest)) throw new Error("Release metadata is invalid.");
  return manifest;
}

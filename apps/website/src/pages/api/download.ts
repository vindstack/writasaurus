import { getSession } from "../../lib/auth.ts";
import { getLicenseStore } from "../../lib/store.ts";
import { isReleaseManifest } from "../../../../../packages/shared/releases.ts";
import { presignR2GetUrl, type R2Credentials } from "../../../../../packages/shared/r2.ts";

export const prerender = false;

function r2Credentials(): R2Credentials {
  const accountId = Deno.env.get("WRITASAURUS_R2_ACCOUNT_ID")?.trim();
  const accessKeyId = Deno.env.get("WRITASAURUS_R2_ACCESS_KEY_ID")?.trim();
  const secretAccessKey = Deno.env.get("WRITASAURUS_R2_SECRET_ACCESS_KEY")?.trim();
  const bucket = Deno.env.get("WRITASAURUS_R2_BUCKET")?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Private release storage is not configured.");
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

async function currentRelease(): Promise<unknown> {
  const site = Deno.env.get("PUBLIC_SITE_URL")?.trim();
  if (!site) throw new Error("PUBLIC_SITE_URL is not configured.");
  const response = await fetch(new URL("/latest.json", site), {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("The current release metadata is unavailable.");
  return await response.json();
}

export async function POST(context: { request: Request }): Promise<Response> {
  const session = await getSession(context.request);
  if (session?.role !== "customer") return new Response("Unauthorized.", { status: 401 });
  const form = await context.request.formData();
  const platform = form.get("platform");
  if (platform !== "linux" && platform !== "macos" && platform !== "windows") {
    return new Response("Invalid platform.", { status: 400 });
  }
  const purchases = await getLicenseStore().getPurchasesByEmail(session.email);
  if (
    !purchases.some((purchase) => purchase.status === "paid" && purchase.licenseStatus === "active")
  ) {
    return new Response("An active purchase is required to download Writasaurus.", { status: 403 });
  }
  try {
    const manifest = await currentRelease();
    if (!isReleaseManifest(manifest)) throw new Error("Release metadata is invalid.");
    const artifact = manifest.artifacts[platform];
    const url = await presignR2GetUrl(r2Credentials(), artifact.objectKey, 600);
    return Response.redirect(url, 303);
  } catch (error) {
    console.error(
      `Download link could not be created: ${error instanceof Error ? error.message : error}`,
    );
    return new Response("The download is temporarily unavailable.", { status: 503 });
  }
}

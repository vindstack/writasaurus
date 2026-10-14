import { getWebsiteStore } from "../../lib/donation-store.ts";
import { normalizedEmail } from "../../lib/auth.ts";
import {
  isDownloadPlatform,
  isValidEmail,
  parseDonationAmount,
  startDonationCheckout,
} from "../../lib/payment-service.ts";
import { isReleaseManifest } from "../../../../../packages/shared/releases.ts";

export const prerender = false;

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

async function download(platform: "linux" | "macos" | "windows"): Promise<Response> {
  const manifest = await currentRelease();
  if (!isReleaseManifest(manifest)) throw new Error("Release metadata is invalid.");
  return Response.redirect(manifest.artifacts[platform].downloadUrl, 303);
}

export async function POST(context: { request: Request }): Promise<Response> {
  let platform: "linux" | "macos" | "windows";
  let email: string;
  let amountCents: number;
  let marketingOptIn: boolean;
  try {
    const form = await context.request.formData();
    const selectedPlatform = form.get("platform");
    const selectedEmail = form.get("email");
    if (!isDownloadPlatform(selectedPlatform)) {
      return new Response("Choose a valid download platform.", { status: 400 });
    }
    if (selectedEmail !== null && typeof selectedEmail !== "string") {
      return new Response("Enter a valid email address.", { status: 400 });
    }
    email = typeof selectedEmail === "string" ? normalizedEmail(selectedEmail) : "";
    if (email && !isValidEmail(email)) {
      return new Response("Enter a valid email address.", { status: 400 });
    }
    amountCents = parseDonationAmount(
      form.get("donation") ?? "none",
      form.get("customAmount"),
    );
    if (amountCents > 0 && !email) {
      return new Response("Enter an email address to make a donation.", { status: 400 });
    }
    platform = selectedPlatform;
    marketingOptIn = form.get("marketingEmails") === "yes";
  } catch (error) {
    if (error instanceof TypeError) {
      return new Response(error.message, { status: 400 });
    }
    throw error;
  }

  try {
    if (email) await getWebsiteStore().setMarketingPreference(email, marketingOptIn);
    if (amountCents === 0) return await download(platform);
    const checkout = await startDonationCheckout(email, amountCents, platform);
    return Response.redirect(new URL(checkout.url, context.request.url), 303);
  } catch (error) {
    console.error(
      `Download or donation flow failed: ${error instanceof Error ? error.message : error}`,
    );
    return new Response("The download or donation service is temporarily unavailable.", {
      status: 503,
    });
  }
}

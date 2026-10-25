import { getWebsiteStore } from "../../lib/donation-store.ts";
import { normalizedEmail } from "../../lib/auth.ts";
import {
  isDownloadPlatform,
  isValidEmail,
  parseDonationAmount,
  startDonationCheckout,
} from "../../lib/payment-service.ts";
import { currentRelease } from "../../lib/releases.ts";

export const prerender = false;

async function download(
  platform: "linux" | "macos" | "windows",
  requestUrl: string,
): Promise<Response> {
  return Response.redirect(new URL(`/api/releases/${platform}`, requestUrl), 303);
}

export async function POST(context: { request: Request }): Promise<Response> {
  let platform: "linux" | "macos" | "windows";
  let email: string;
  let amountCents: number;
  let marketingOptIn: boolean;
  try {
    const form = await context.request.formData();
    if (form.get("termsAccepted") !== "yes") {
      return new Response("You must agree to the terms and conditions before downloading.", {
        status: 400,
      });
    }
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
    amountCents = parseDonationAmount(form.get("donation") ?? "none", form.get("customAmount"));
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
    const release = await currentRelease();
    if (!release.artifacts[platform]) {
      return new Response("This platform's release is not available yet.", { status: 404 });
    }
    if (email) await getWebsiteStore().setMarketingPreference(email, marketingOptIn);
    if (amountCents === 0) return await download(platform, context.request.url);
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

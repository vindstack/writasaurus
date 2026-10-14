import { getSession } from "../../../lib/auth.ts";
import { getWebsiteStore } from "../../../lib/donation-store.ts";

export const prerender = false;

export async function POST(context: { request: Request }): Promise<Response> {
  const session = await getSession(context.request);
  if (!session) return new Response("Sign in to update email preferences.", { status: 401 });
  const form = await context.request.formData();
  await getWebsiteStore().setMarketingPreference(
    session.email,
    form.get("marketingEmails") === "yes",
  );
  return Response.redirect(new URL("/account?preferences=updated", context.request.url), 303);
}

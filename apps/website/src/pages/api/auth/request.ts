import { hashAuthCode, normalizedEmail } from "../../../lib/auth.ts";
import { sendPasscode } from "../../../lib/email.ts";
import { isValidEmail } from "../../../lib/payment-service.ts";
import { getWebsiteStore } from "../../../lib/donation-store.ts";

export const prerender = false;

export async function POST(context: { request: Request }): Promise<Response> {
  const form = await context.request.formData();
  const rawEmail = form.get("email");
  const email = typeof rawEmail === "string" ? normalizedEmail(rawEmail) : "";
  if (isValidEmail(email)) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100_000_000)
      .padStart(8, "0");
    const created = await getWebsiteStore().createAuthCode(
      email,
      await hashAuthCode(email, code),
    );
    if (created) await sendPasscode(email, code);
  }
  return Response.redirect(new URL("/account?sent=1", context.request.url), 303);
}

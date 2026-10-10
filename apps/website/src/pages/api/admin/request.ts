import { hashAuthCode, normalizedEmail } from "../../../lib/auth.ts";
import { sendPasscode } from "../../../lib/email.ts";
import { isValidEmail } from "../../../lib/payment-service.ts";
import { getLicenseStore } from "../../../lib/store.ts";

export const prerender = false;

const ADMIN_EMAIL = "josh@vindstack.com";

export async function POST(context: { request: Request }): Promise<Response> {
  const form = await context.request.formData();
  const value = form.get("email");
  const email = typeof value === "string" ? normalizedEmail(value) : "";
  if (isValidEmail(email) && email === (Deno.env.get("ADMIN_EMAIL") ?? ADMIN_EMAIL).toLowerCase()) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100_000_000)
      .padStart(8, "0");
    const created = await getLicenseStore().createAuthCode(
      email,
      "admin",
      await hashAuthCode(email, "admin", code),
    );
    if (created) await sendPasscode(email, code, "admin");
  }
  return Response.redirect(new URL("/admin/login?sent=1", context.request.url), 303);
}

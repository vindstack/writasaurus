import { createSessionCookie, hashAuthCode, normalizedEmail } from "../../../lib/auth.ts";
import { getLicenseStore } from "../../../lib/store.ts";
import { isValidEmail } from "../../../lib/payment-service.ts";

export const prerender = false;

export async function POST(context: { request: Request }): Promise<Response> {
  const form = await context.request.formData();
  const rawEmail = form.get("email");
  const rawCode = form.get("code");
  const email = typeof rawEmail === "string" ? normalizedEmail(rawEmail) : "";
  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!isValidEmail(email) || !/^\d{8}$/.test(code)) {
    return new Response("Enter the email address and 8-digit code.", { status: 400 });
  }
  const store = getLicenseStore();
  const valid = await store.verifyAuthCode(
    email,
    "customer",
    await hashAuthCode(email, "customer", code),
  );
  if (!valid) {
    return new Response("That code is invalid or expired. Request a new code and try again.", {
      status: 400,
    });
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: "/account",
      "set-cookie": await createSessionCookie(email, "customer"),
    },
  });
}

import { createSessionCookie, hashAuthCode, normalizedEmail } from "../../../lib/auth.ts";
import { getWebsiteStore } from "../../../lib/donation-store.ts";
import { isValidEmail } from "../../../lib/payment-service.ts";

export const prerender = false;

export async function POST(context: { request: Request }): Promise<Response> {
  const json = context.request.headers.get("accept")?.includes("application/json");
  const form = await context.request.formData();
  const rawEmail = form.get("email");
  const rawCode = form.get("code");
  const email = typeof rawEmail === "string" ? normalizedEmail(rawEmail) : "";
  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!isValidEmail(email) || !/^\d{8}$/.test(code)) {
    if (json) {
      return Response.json({
        error: !isValidEmail(email) ? "Enter a valid email address." : "Enter the 8-digit code.",
        field: !isValidEmail(email) ? "email" : "code",
      }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    return new Response("Enter the email address and 8-digit code.", { status: 400 });
  }
  const store = getWebsiteStore();
  const valid = await store.verifyAuthCode(email, await hashAuthCode(email, code));
  if (!valid) {
    if (json) {
      return Response.json({
        error: "That code is invalid or expired. Use your latest code or request a new one.",
        field: "code",
      }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    return new Response("That code is invalid or expired. Request a new code and try again.", {
      status: 400,
    });
  }
  if (json) {
    return Response.json({ verified: true }, {
      headers: {
        "set-cookie": await createSessionCookie(email),
        "cache-control": "no-store",
      },
    });
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: "/account",
      "set-cookie": await createSessionCookie(email),
    },
  });
}

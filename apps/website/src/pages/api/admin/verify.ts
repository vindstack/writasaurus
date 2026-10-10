import { createSessionCookie, hashAuthCode, normalizedEmail } from "../../../lib/auth.ts";
import { isValidEmail } from "../../../lib/payment-service.ts";
import { getLicenseStore } from "../../../lib/store.ts";

export const prerender = false;

const ADMIN_EMAIL = "josh@vindstack.com";

export async function POST(context: { request: Request }): Promise<Response> {
  const form = await context.request.formData();
  const rawEmail = form.get("email");
  const rawCode = form.get("code");
  const email = typeof rawEmail === "string" ? normalizedEmail(rawEmail) : "";
  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  if (
    !isValidEmail(email) || email !== (Deno.env.get("ADMIN_EMAIL") ?? ADMIN_EMAIL).toLowerCase() ||
    !/^\d{8}$/.test(code)
  ) return new Response("Invalid sign-in code.", { status: 400 });
  const valid = await getLicenseStore().verifyAuthCode(
    email,
    "admin",
    await hashAuthCode(email, "admin", code),
  );
  if (!valid) return new Response("That code is invalid or expired.", { status: 400 });
  return new Response(null, {
    status: 303,
    headers: { location: "/admin", "set-cookie": await createSessionCookie(email, "admin") },
  });
}

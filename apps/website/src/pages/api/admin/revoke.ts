import { getSession } from "../../../lib/auth.ts";
import { getLicenseStore } from "../../../lib/store.ts";

export const prerender = false;

export async function POST(context: { request: Request }): Promise<Response> {
  const session = await getSession(context.request);
  if (session?.role !== "admin") return new Response("Unauthorized.", { status: 401 });
  const form = await context.request.formData();
  const licenseId = form.get("licenseId");
  const reason = form.get("reason");
  if (
    typeof licenseId !== "string" || !/^[0-9a-f-]{36}$/i.test(licenseId) ||
    typeof reason !== "string" || !reason.trim() || reason.trim().length > 500
  ) return new Response("A license and reason are required.", { status: 400 });
  await getLicenseStore().revokeLicense(licenseId, session.email, reason.trim());
  return Response.redirect(new URL("/admin?status=updated", context.request.url), 303);
}

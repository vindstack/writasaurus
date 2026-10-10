import { getSession } from "../../../lib/auth.ts";
import { deliverPurchaseKey } from "../../../lib/payment-service.ts";
import { getLicenseStore } from "../../../lib/store.ts";

export const prerender = false;

export async function POST(context: { request: Request }): Promise<Response> {
  const session = await getSession(context.request);
  if (session?.role !== "customer") return new Response("Unauthorized.", { status: 401 });
  const form = await context.request.formData();
  const purchaseId = form.get("purchaseId");
  if (typeof purchaseId !== "string") return new Response("Invalid purchase.", { status: 400 });
  const purchase = (await getLicenseStore().getPurchasesByEmail(session.email))
    .find((item) => item.id === purchaseId);
  if (!purchase || purchase.status !== "paid" || purchase.licenseStatus !== "active") {
    return new Response("That license is not eligible for key recovery.", { status: 404 });
  }
  const template = "key-recovery";
  try {
    await deliverPurchaseKey(purchase, template);
  } catch (error) {
    console.error(
      `License key email delivery failed: ${error instanceof Error ? error.message : error}`,
    );
    return new Response("The key email could not be sent. Please try again later.", {
      status: 503,
    });
  }
  return Response.redirect(new URL("/account?status=key-sent", context.request.url), 303);
}

import { getSession } from "../../../lib/auth.ts";
import { getLicenseStore } from "../../../lib/store.ts";
import { createStripeRefund } from "../../../lib/stripe.ts";

export const prerender = false;

export async function POST(context: { request: Request }): Promise<Response> {
  const session = await getSession(context.request);
  if (session?.role !== "customer") return new Response("Unauthorized.", { status: 401 });
  const form = await context.request.formData();
  const purchaseId = form.get("purchaseId");
  if (form.get("confirm") !== "yes" || typeof purchaseId !== "string") {
    return new Response("Confirm the refund request.", { status: 400 });
  }
  const purchase = (await getLicenseStore().getPurchasesByEmail(session.email))
    .find((item) => item.id === purchaseId);
  if (!purchase) return new Response("Purchase not found.", { status: 404 });
  let refund;
  try {
    refund = await getLicenseStore().beginRefund(
      purchase.id,
      `writasaurus-${crypto.randomUUID()}`,
      crypto.randomUUID(),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "This purchase is not eligible for a refund.") {
      return new Response(error.message, { status: 409 });
    }
    throw error;
  }
  if (refund.status === "succeeded") {
    return Response.redirect(new URL("/account?status=refunded", context.request.url), 303);
  }
  try {
    if (Deno.env.get("PAYMENT_PROVIDER") === "mock" && !Deno.env.get("DENO_DEPLOYMENT_ID")) {
      await getLicenseStore().completeRefund(purchase.id, "succeeded", `mock_${refund.id}`);
      return Response.redirect(new URL("/account?status=refunded", context.request.url), 303);
    }
    if (!refund.purchase.paymentIntentId) {
      throw new Error("This purchase has no Stripe payment intent.");
    }
    const result = await createStripeRefund(refund.purchase.paymentIntentId, refund.idempotencyKey);
    const status = result.status === "succeeded"
      ? "succeeded"
      : result.status === "failed" || result.status === "canceled"
      ? "failed"
      : "pending";
    await getLicenseStore().completeRefund(purchase.id, status, result.id);
    return Response.redirect(
      new URL(
        status === "succeeded" ? "/account?status=refunded" : "/account?status=refund-pending",
        context.request.url,
      ),
      303,
    );
  } catch (error) {
    await getLicenseStore().completeRefund(purchase.id, "failed");
    console.error(`Refund request failed: ${error instanceof Error ? error.message : error}`);
    return new Response("The refund could not be completed. Please contact support.", {
      status: 503,
    });
  }
}

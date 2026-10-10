import { processStripeEvent } from "../../../lib/payment-service.ts";
import { verifyStripeWebhook } from "../../../lib/stripe.ts";

export const prerender = false;

export async function POST(context: { request: Request }): Promise<Response> {
  let event;
  try {
    const body = await context.request.text();
    event = await verifyStripeWebhook(body, context.request.headers.get("stripe-signature"));
  } catch (error) {
    console.warn(`Rejected Stripe webhook: ${error instanceof Error ? error.message : error}`);
    return new Response("Invalid webhook signature or payload.", { status: 400 });
  }
  try {
    await processStripeEvent(event);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(
      `Stripe webhook processing failed for ${event.id}: ${
        error instanceof Error ? error.message : error
      }`,
    );
    return new Response("Webhook processing failed.", { status: 500 });
  }
}

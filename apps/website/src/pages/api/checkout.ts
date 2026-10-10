import { startCheckout } from "../../lib/payment-service.ts";

export const prerender = false;

export async function POST(context: { request: Request }): Promise<Response> {
  try {
    const form = await context.request.formData();
    const email = form.get("email");
    if (typeof email !== "string") {
      return new Response("Enter a valid email address.", { status: 400 });
    }
    const checkout = await startCheckout(email);
    return Response.redirect(new URL(checkout.url, context.request.url), 303);
  } catch (error) {
    const clientError = error instanceof Error && error.message === "Enter a valid email address.";
    if (!clientError) {
      console.error(
        `Checkout could not be started: ${error instanceof Error ? error.message : error}`,
      );
    }
    return new Response(clientError ? error.message : "Checkout is temporarily unavailable.", {
      status: clientError ? 400 : 503,
    });
  }
}

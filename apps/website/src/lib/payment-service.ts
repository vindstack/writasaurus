import {
  decryptLicenseKey,
  encryptLicenseKey,
  generateLicenseKey,
  hashText,
} from "./license-crypto.ts";
import { sendPurchaseEmail } from "./email.ts";
import { type FulfillmentInput, getLicenseStore, type PurchaseRecord } from "./store.ts";
import {
  createStripeCheckoutSession,
  retrieveStripeCheckoutSession,
  retrieveStripeReceiptUrl,
  type StripeCheckoutSession,
  type StripeEvent,
} from "./stripe.ts";

export const PURCHASE_PRICE_CENTS = 5999;
export const PURCHASE_CURRENCY = "usd";

export function isLocalMockEnabled(): boolean {
  return Deno.env.get("PAYMENT_PROVIDER") === "mock" &&
    Deno.env.get("DENO_DEPLOYMENT_ID") === undefined;
}

export function normalizeLicenseKey(value: string): string {
  return value.trim().replaceAll(/[\s-]/g, "").toUpperCase();
}

export function isValidLicenseKey(value: string): boolean {
  return /^WRIT[A-F0-9]{48}$/.test(normalizeLicenseKey(value));
}

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function createPurchase(
  input: Omit<FulfillmentInput, "keyHash" | "encryptedKey" | "claimHash">,
) {
  const key = generateLicenseKey();
  const keyHash = await hashText(normalizeLicenseKey(key));
  const encryptedKey = await encryptLicenseKey(key);
  const claimHash = await hashText(input.stripeSessionId);
  const fulfilled = await getLicenseStore().fulfill({
    ...input,
    keyHash,
    encryptedKey,
    claimHash,
  });
  return { ...fulfilled, licenseKey: fulfilled.created ? key : null };
}

export async function deliverPurchaseKey(
  purchase: PurchaseRecord,
  template = "purchase",
): Promise<void> {
  const store = getLicenseStore();
  const shouldSend = await store.startEmailDelivery(
    purchase.licenseId,
    template,
    purchase.email,
  );
  if (!shouldSend) {
    if (!await store.emailWasSent(purchase.licenseId, template)) {
      throw new Error("Purchase email is still pending or has not been delivered.");
    }
    return;
  }
  try {
    const key = await decryptLicenseKey(purchase.encryptedKey);
    await sendPurchaseEmail(purchase.email, key, purchase.amountTotal, purchase.currency);
    await store.finishEmailDelivery(purchase.licenseId, template, "sent");
  } catch (error) {
    await store.finishEmailDelivery(purchase.licenseId, template, "failed", "delivery-failed");
    throw error;
  }
}

export async function createMockPurchase(email: string): Promise<string> {
  if (!isLocalMockEnabled()) {
    throw new Error("Mock payments are available only when explicitly enabled outside production.");
  }
  if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
  const sessionId = `mock_${crypto.randomUUID()}`;
  const created = await createPurchase({
    eventType: "mock.checkout.completed",
    licenseId: crypto.randomUUID(),
    purchaseId: crypto.randomUUID(),
    email: email.trim().toLowerCase(),
    stripeSessionId: sessionId,
    paymentIntentId: `mock_pi_${crypto.randomUUID()}`,
    amountTotal: PURCHASE_PRICE_CENTS,
    currency: PURCHASE_CURRENCY,
    receiptUrl: null,
    purchasedAt: new Date(),
  });
  try {
    await deliverPurchaseKey(created.purchase);
  } catch (error) {
    console.warn(
      `Mock purchase email was not delivered: ${error instanceof Error ? error.message : error}`,
    );
  }
  return sessionId;
}

export async function startCheckout(email: string): Promise<{ url: string; mock: boolean }> {
  if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
  if (isLocalMockEnabled()) {
    const sessionId = await createMockPurchase(email);
    return { url: `/checkout/success?session_id=${encodeURIComponent(sessionId)}`, mock: true };
  }
  const session = await createStripeCheckoutSession(email);
  if (!session.url || !session.url.startsWith("https://checkout.stripe.com/")) {
    throw new Error("Stripe did not provide a valid Checkout URL.");
  }
  return { url: session.url, mock: false };
}

export async function confirmStripePurchase(sessionId: string): Promise<StripeCheckoutSession> {
  if (sessionId.startsWith("mock_") && isLocalMockEnabled()) {
    const purchase = await getLicenseStore().getPurchaseBySession(sessionId);
    if (!purchase) throw new Error("Mock purchase was not found.");
    return {
      id: sessionId,
      payment_status: "paid",
      customer_email: purchase.email,
      amount_total: purchase.amountTotal,
      currency: purchase.currency,
      payment_intent: purchase.paymentIntentId,
    };
  }
  return await retrieveStripeCheckoutSession(sessionId);
}

export async function fulfillConfirmedStripePurchase(
  session: StripeCheckoutSession,
): Promise<PurchaseRecord> {
  if (
    session.payment_status !== "paid" ||
    session.amount_total !== PURCHASE_PRICE_CENTS ||
    session.currency !== PURCHASE_CURRENCY
  ) throw new Error("The Stripe Checkout Session is not a completed $59.99 USD purchase.");
  const email = session.customer_details?.email ?? session.customer_email;
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!email || !session.id || !paymentIntentId) {
    throw new Error("Paid Checkout Session is missing required purchase details.");
  }
  const result = await createPurchase({
    eventType: "checkout.success.confirmed",
    licenseId: crypto.randomUUID(),
    purchaseId: crypto.randomUUID(),
    email: email.trim().toLowerCase(),
    stripeSessionId: session.id,
    paymentIntentId,
    amountTotal: PURCHASE_PRICE_CENTS,
    currency: PURCHASE_CURRENCY,
    receiptUrl: session.id.startsWith("mock_")
      ? null
      : await retrieveStripeReceiptUrl(paymentIntentId),
    purchasedAt: new Date(),
  });
  try {
    await deliverPurchaseKey(result.purchase);
  } catch (error) {
    console.warn(
      `Purchase email delivery failed: ${error instanceof Error ? error.message : error}`,
    );
  }
  return result.purchase;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function sessionFromEvent(event: StripeEvent): Record<string, unknown> {
  return event.data.object;
}

export async function processStripeEvent(event: StripeEvent): Promise<void> {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = sessionFromEvent(event);
    if (session.payment_status !== "paid") return;
    if (
      session.amount_total !== PURCHASE_PRICE_CENTS ||
      session.currency !== PURCHASE_CURRENCY
    ) throw new Error("Checkout total did not match the configured $59.99 USD price.");
    const details =
      typeof session.customer_details === "object" && session.customer_details !== null
        ? session.customer_details as { email?: unknown }
        : null;
    const email = asString(details?.email) ?? asString(session.customer_email);
    const sessionId = asString(session.id);
    const paymentIntentId = asString(session.payment_intent) ??
      (typeof session.payment_intent === "object" && session.payment_intent !== null
        ? asString((session.payment_intent as { id?: unknown }).id)
        : null);
    const created = typeof session.created === "number" ? session.created * 1000 : Date.now();
    if (!email || !sessionId || !paymentIntentId) {
      throw new Error("Paid Checkout Session is missing required purchase details.");
    }
    const result = await createPurchase({
      eventId: event.id,
      eventType: event.type,
      licenseId: crypto.randomUUID(),
      purchaseId: crypto.randomUUID(),
      email: email.trim().toLowerCase(),
      stripeSessionId: sessionId,
      paymentIntentId,
      amountTotal: PURCHASE_PRICE_CENTS,
      currency: PURCHASE_CURRENCY,
      receiptUrl: await retrieveStripeReceiptUrl(paymentIntentId),
      purchasedAt: new Date(created),
    });
    await deliverPurchaseKey(result.purchase);
    return;
  }
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const paymentIntentId = asString(event.data.object.payment_intent);
    if (paymentIntentId) {
      await getLicenseStore().applyStripeRefund(event.id, event.type, paymentIntentId);
    }
  }
}

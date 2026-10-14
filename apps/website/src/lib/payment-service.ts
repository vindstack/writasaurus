import { type DonationInput, type DonationRecord, getWebsiteStore } from "./donation-store.ts";
import {
  createStripeCheckoutSession,
  retrieveStripeCheckoutSession,
  retrieveStripeReceiptUrl,
  type StripeCheckoutSession,
  type StripeEvent,
} from "./stripe.ts";

export const STRIPE_MIN_DONATION_CENTS = 50;
export const DONATION_CURRENCY = "usd";
export const DOWNLOAD_PLATFORMS = ["linux", "macos", "windows"] as const;

export type DownloadPlatform = typeof DOWNLOAD_PLATFORMS[number];
export interface ConfirmedDonation {
  donation: DonationRecord;
  platform: DownloadPlatform;
}

const mockDonationPlatforms = new Map<string, DownloadPlatform>();

export function isLocalMockEnabled(): boolean {
  return Deno.env.get("PAYMENT_PROVIDER") === "mock" &&
    Deno.env.get("DENO_DEPLOYMENT_ID") === undefined;
}

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isDownloadPlatform(value: unknown): value is DownloadPlatform {
  return value === "linux" || value === "macos" || value === "windows";
}

export function parseDonationAmount(choice: unknown, customAmount: unknown): number {
  if (choice === "none") return 0;
  if (choice === "10") return 1000;
  if (choice === "25") return 2500;
  if (choice !== "custom" || typeof customAmount !== "string") {
    throw new TypeError("Choose free, $10, $25, or a custom amount.");
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(customAmount.trim());
  if (!match) throw new TypeError("Enter a custom donation amount in USD.");
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (cents < BigInt(STRIPE_MIN_DONATION_CENTS)) {
    throw new TypeError("Custom donations must meet Stripe's minimum of $0.50 USD.");
  }
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError("The custom donation amount is too large to process.");
  }
  return Number(cents);
}

function paymentIntentId(session: StripeCheckoutSession): string | null {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
}

function sessionMetadata(session: StripeCheckoutSession): Record<string, string> {
  return session.metadata ?? {};
}

function confirmedPlatform(session: StripeCheckoutSession): DownloadPlatform {
  const platform = sessionMetadata(session).platform;
  if (!isDownloadPlatform(platform)) throw new Error("Donation session has an invalid platform.");
  return platform;
}

async function recordPaidSession(
  session: StripeCheckoutSession,
  eventId?: string,
): Promise<ConfirmedDonation> {
  const metadata = sessionMetadata(session);
  if (metadata.donation !== "true") throw new Error("This is not a Writasaurus donation session.");
  const email = metadata.email?.trim().toLowerCase();
  const amountTotal = session.amount_total;
  const expectedAmount = Number(metadata.amountCents);
  const intentId = paymentIntentId(session);
  if (
    session.payment_status !== "paid" || session.currency !== DONATION_CURRENCY ||
    !email || !isValidEmail(email) || !session.id || !intentId ||
    typeof amountTotal !== "number" || !Number.isSafeInteger(amountTotal) ||
    amountTotal !== expectedAmount ||
    amountTotal < STRIPE_MIN_DONATION_CENTS
  ) {
    throw new Error("Paid donation session is missing valid donation details.");
  }
  const platform = confirmedPlatform(session);
  const receiptUrl = session.id.startsWith("mock_")
    ? null
    : await retrieveStripeReceiptUrl(intentId);
  const input: DonationInput = {
    id: crypto.randomUUID(),
    stripeSessionId: session.id,
    paymentIntentId: intentId,
    email,
    amountTotal,
    currency: DONATION_CURRENCY,
    receiptUrl,
    donatedAt: typeof session.created === "number" ? new Date(session.created * 1000) : new Date(),
  };
  const donation = await getWebsiteStore().recordDonation(input, eventId);
  return { donation, platform };
}

export async function startDonationCheckout(
  email: string,
  amountCents: number,
  platform: DownloadPlatform,
): Promise<{ url: string; mock: boolean }> {
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) throw new TypeError("Enter a valid email address to donate.");
  if (!Number.isSafeInteger(amountCents) || amountCents < STRIPE_MIN_DONATION_CENTS) {
    throw new TypeError("Choose a valid donation amount.");
  }
  if (isLocalMockEnabled()) {
    const sessionId = `mock_${crypto.randomUUID()}`;
    mockDonationPlatforms.set(sessionId, platform);
    await getWebsiteStore().recordDonation({
      id: crypto.randomUUID(),
      stripeSessionId: sessionId,
      paymentIntentId: `mock_pi_${crypto.randomUUID()}`,
      email: normalized,
      amountTotal: amountCents,
      currency: DONATION_CURRENCY,
      receiptUrl: null,
      donatedAt: new Date(),
    });
    return {
      url: `/donation/success?session_id=${encodeURIComponent(sessionId)}`,
      mock: true,
    };
  }
  const session = await createStripeCheckoutSession(normalized, amountCents, platform);
  if (!session.url || !session.url.startsWith("https://checkout.stripe.com/")) {
    throw new Error("Stripe did not provide a valid Checkout URL.");
  }
  return { url: session.url, mock: false };
}

export async function confirmDonationSession(sessionId: string): Promise<ConfirmedDonation> {
  if (isLocalMockEnabled() && sessionId.startsWith("mock_")) {
    const donation = await getWebsiteStore().getDonationBySession(sessionId);
    const platform = mockDonationPlatforms.get(sessionId);
    if (!donation || !platform) throw new Error("Mock donation session was not found.");
    return { donation, platform };
  }
  return await recordPaidSession(await retrieveStripeCheckoutSession(sessionId));
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function eventPaymentIntent(event: StripeEvent): string | null {
  const value = event.data.object.payment_intent;
  if (typeof value === "string") return value;
  return typeof value === "object" && value !== null
    ? asString((value as { id?: unknown }).id)
    : null;
}

export async function processStripeEvent(event: StripeEvent): Promise<void> {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as unknown as StripeCheckoutSession;
    if (sessionMetadata(session).donation !== "true" || session.payment_status !== "paid") return;
    await recordPaidSession(session, event.id);
    return;
  }
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const intentId = eventPaymentIntent(event);
    if (intentId) {
      await getWebsiteStore().setDonationStatus(
        event.id,
        intentId,
        event.type === "charge.refunded" ? "refunded" : "disputed",
      );
    }
  }
}

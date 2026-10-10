export interface StripeCheckoutSession {
  id: string;
  url?: string | null;
  payment_status?: string;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id: string } | null;
  payment_method_types?: string[];
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function stripeRequest<T>(
  path: string,
  method = "GET",
  body?: URLSearchParams,
  idempotencyKey?: string,
): Promise<T> {
  const secret = requiredEnv("STRIPE_SECRET_KEY");
  const headers = new Headers({
    authorization: `Basic ${btoa(`${secret}:`)}`,
  });
  if (body) headers.set("content-type", "application/x-www-form-urlencoded");
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers,
    ...(body ? { body: body.toString() } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Stripe returned a non-JSON response (${response.status}).`);
  }
  if (!response.ok) {
    const code = typeof payload === "object" && payload !== null &&
        "error" in payload && typeof payload.error === "object" && payload.error !== null &&
        "code" in payload.error && typeof payload.error.code === "string"
      ? payload.error.code
      : `HTTP ${response.status}`;
    throw new Error(`Stripe request failed (${code}).`);
  }
  return payload as T;
}

export async function createStripeCheckoutSession(email: string): Promise<StripeCheckoutSession> {
  const priceId = requiredEnv("STRIPE_PRICE_ID");
  const siteUrl = requiredEnv("PUBLIC_SITE_URL").replace(/\/+$/, "");
  const parsedSiteUrl = new URL(siteUrl);
  if (parsedSiteUrl.protocol !== "https:" || parsedSiteUrl.username || parsedSiteUrl.password) {
    throw new Error("PUBLIC_SITE_URL must be an HTTPS origin.");
  }
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("customer_creation", "always");
  params.set("customer_email", email);
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${siteUrl}/checkout?cancelled=1`);
  params.set("allow_promotion_codes", "false");
  return await stripeRequest<StripeCheckoutSession>("checkout/sessions", "POST", params);
}

export async function retrieveStripeCheckoutSession(
  sessionId: string,
): Promise<StripeCheckoutSession> {
  return await stripeRequest<StripeCheckoutSession>(
    `checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export async function retrieveStripeReceiptUrl(paymentIntentId: string): Promise<string | null> {
  const intent = await stripeRequest<{
    latest_charge?: string | { receipt_url?: string | null } | null;
  }>(
    `payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`,
  );
  const charge = intent.latest_charge;
  const receiptUrl = typeof charge === "object" && charge !== null ? charge.receipt_url : null;
  return typeof receiptUrl === "string" && receiptUrl.startsWith("https://") ? receiptUrl : null;
}

export async function createStripeRefund(
  paymentIntentId: string,
  idempotencyKey: string,
): Promise<{ id: string; status: string }> {
  const params = new URLSearchParams();
  params.set("payment_intent", paymentIntentId);
  return await stripeRequest("refunds", "POST", params, idempotencyKey);
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

async function webhookSignature(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))),
  );
}

export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret = Deno.env.get("STRIPE_WEBHOOK_SECRET"),
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<StripeEvent> {
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  if (!signatureHeader) throw new Error("Stripe-Signature is missing.");
  const values = new Map(
    signatureHeader.split(",").map((entry) => {
      const separator = entry.indexOf("=");
      return separator < 0 ? [entry, ""] : [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
  const timestamp = Number(values.get("t"));
  const signatures = signatureHeader.split(",").filter((entry) => entry.startsWith("v1="))
    .map((entry) => entry.slice(3));
  if (
    !Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300 ||
    !signatures.length
  ) throw new Error("Stripe webhook signature is invalid or expired.");
  const expected = await webhookSignature(secret, `${timestamp}.${rawBody}`);
  if (!signatures.some((value) => constantTimeEqual(value, expected))) {
    throw new Error("Stripe webhook signature is invalid.");
  }
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new Error("Stripe webhook body is invalid JSON.");
  }
  if (
    typeof event !== "object" || event === null || !("id" in event) ||
    typeof event.id !== "string" || !("type" in event) || typeof event.type !== "string" ||
    !("data" in event) || typeof event.data !== "object" || event.data === null ||
    !("object" in event.data) || typeof event.data.object !== "object" || event.data.object === null
  ) throw new Error("Stripe webhook payload is malformed.");
  return event as StripeEvent;
}

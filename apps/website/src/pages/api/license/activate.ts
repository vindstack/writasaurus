import { hashText, signLicenseToken } from "../../../lib/license-crypto.ts";
import { isValidLicenseKey, normalizeLicenseKey } from "../../../lib/payment-service.ts";
import { getLicenseStore } from "../../../lib/store.ts";
import { isAllowedDesktopOrigin, licenseCorsHeaders } from "../../../lib/license-cors.ts";

export const prerender = false;
const TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export function OPTIONS(context: { request: Request }): Response {
  if (!isAllowedDesktopOrigin(context.request)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: licenseCorsHeaders(context.request) });
}

export async function POST(context: { request: Request }): Promise<Response> {
  if (!isAllowedDesktopOrigin(context.request)) return new Response("Forbidden.", { status: 403 });
  const headers = licenseCorsHeaders(context.request);
  let input: unknown;
  try {
    input = await context.request.json();
  } catch {
    return new Response("Invalid activation request.", { status: 400, headers });
  }
  if (typeof input !== "object" || input === null) {
    return new Response("Invalid activation request.", { status: 400, headers });
  }
  const data = input as Record<string, unknown>;
  if (
    typeof data.key !== "string" || data.key.length > 80 || !isValidLicenseKey(data.key) ||
    typeof data.deviceHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.deviceHash)
  ) return new Response("Enter a valid license key.", { status: 400, headers });
  const purchase = await getLicenseStore().getPurchaseByLicenseKey(
    await hashText(normalizeLicenseKey(data.key)),
  );
  if (!purchase || purchase.status !== "paid" || purchase.licenseStatus !== "active") {
    return new Response("This license key is invalid or inactive.", { status: 403, headers });
  }
  const activation = await getLicenseStore().activate(purchase.licenseId, data.deviceHash);
  if (!activation) {
    return new Response("This license has reached its device limit or is inactive.", {
      status: 403,
      headers,
    });
  }
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  const token = await signLicenseToken({
    licenseId: purchase.licenseId,
    deviceHash: activation.deviceHash,
    exp: expiresAt,
  });
  return Response.json({ token, expiresAt }, { headers });
}

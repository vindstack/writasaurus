import { signLicenseToken } from "../../../lib/license-crypto.ts";
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
    return new Response("Invalid license refresh request.", { status: 400, headers });
  }
  if (typeof input !== "object" || input === null) {
    return new Response("Invalid license refresh request.", { status: 400, headers });
  }
  const data = input as Record<string, unknown>;
  if (
    typeof data.licenseId !== "string" || !/^[0-9a-f-]{36}$/i.test(data.licenseId) ||
    typeof data.deviceHash !== "string" || !/^[a-f0-9]{64}$/.test(data.deviceHash)
  ) return new Response("Invalid license refresh request.", { status: 400, headers });
  const activation = await getLicenseStore().refresh(data.licenseId, data.deviceHash);
  if (!activation) return new Response("This license is inactive.", { status: 403, headers });
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  const token = await signLicenseToken({
    licenseId: activation.licenseId,
    deviceHash: activation.deviceHash,
    exp: expiresAt,
  });
  return Response.json({ token, expiresAt }, { headers });
}

import { hashText } from "./license-crypto.ts";
import { getLicenseStore, type UserRole } from "./store.ts";

const SESSION_COOKIE = "wr_session";
const PURCHASE_COOKIE = "wr_purchase";
const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sessionSecret(): string {
  const value = Deno.env.get("SESSION_SECRET")?.trim();
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return value;
}

export async function hashAuthCode(email: string, role: UserRole, code: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const value = `${role}:${normalizedEmail(email)}:${code}`;
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureCookie(): string {
  return Deno.env.get("DENO_DEPLOYMENT_ID") ||
      Deno.env.get("PUBLIC_SITE_URL")?.startsWith("https://")
    ? "; Secure"
    : "";
}

async function signature(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return encodeBase64Url(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

function cookieValue(request: Request, name: string): string | null {
  const pair = request.headers.get("cookie")?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : null;
}

export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function createSessionCookie(email: string, role: UserRole): Promise<string> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = encodeBase64Url(tokenBytes);
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await getLicenseStore().saveSession(
    await hashText(token),
    normalizedEmail(email),
    role,
    expiresAt,
  );
  const value = `${token}.${await signature(token)}`;
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=28800; HttpOnly; SameSite=Strict${secureCookie()}`;
}

export async function getSession(
  request: Request,
): Promise<{ email: string; role: UserRole } | null> {
  const value = cookieValue(request, SESSION_COOKIE);
  if (!value) return null;
  const [token, signed, extra] = value.split(".");
  if (!token || !signed || extra !== undefined) return null;
  if (!constantTimeEqual(await signature(token), signed)) return null;
  return await getLicenseStore().getSession(await hashText(token));
}

export async function revokeSession(request: Request): Promise<void> {
  const value = cookieValue(request, SESSION_COOKIE);
  if (!value) return;
  const [token, signed, extra] = value.split(".");
  if (
    !token || !signed || extra !== undefined || !constantTimeEqual(await signature(token), signed)
  ) {
    return;
  }
  await getLicenseStore().deleteSession(await hashText(token));
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secureCookie()}`;
}

export async function createPurchaseCookie(sessionId: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({ sessionId, expiresAt })));
  const value = `${payload}.${await signature(payload)}`;
  return `${PURCHASE_COOKIE}=${value}; Path=/; Max-Age=900; HttpOnly; SameSite=Strict${secureCookie()}`;
}

export async function getPurchaseSession(request: Request): Promise<string | null> {
  const value = cookieValue(request, PURCHASE_COOKIE);
  if (!value) return null;
  const [payload, signed, extra] = value.split(".");
  if (!payload || !signed || extra !== undefined) return null;
  if (!constantTimeEqual(await signature(payload), signed)) return null;
  try {
    const bytes = decodeBase64Url(payload);
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as {
      sessionId?: unknown;
      expiresAt?: unknown;
    };
    return typeof decoded.sessionId === "string" && typeof decoded.expiresAt === "number" &&
        decoded.expiresAt > Date.now() / 1000
      ? decoded.sessionId
      : null;
  } catch {
    return null;
  }
}

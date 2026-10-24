import { env } from "node:process";
import { getWebsiteStore } from "./donation-store.ts";
import { normalizedEmail } from "./normalized-email.ts";

export { normalizedEmail } from "./normalized-email.ts";

const SESSION_COOKIE = "wr_session";
const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return value;
}

export async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashAuthCode(email: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${email}:${code}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureCookie(): string {
  return env.NODE_ENV === "production" || process.env.PUBLIC_SITE_URL?.startsWith("https://")
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
  const pair = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : null;
}

export async function createSessionCookie(email: string): Promise<string> {
  const token = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await getWebsiteStore().saveSession(await hashText(token), normalizedEmail(email), expiresAt);
  const value = `${token}.${await signature(token)}`;
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=28800; HttpOnly; SameSite=Strict${secureCookie()}`;
}

export async function getSession(request: Request): Promise<{ email: string } | null> {
  const value = cookieValue(request, SESSION_COOKIE);
  if (!value) return null;
  const [token, signed, extra] = value.split(".");
  if (!token || !signed || extra !== undefined) return null;
  if (!constantTimeEqual(await signature(token), signed)) return null;
  return await getWebsiteStore().getSession(await hashText(token));
}

export async function revokeSession(request: Request): Promise<void> {
  const value = cookieValue(request, SESSION_COOKIE);
  if (!value) return;
  const [token, signed, extra] = value.split(".");
  if (
    !token ||
    !signed ||
    extra !== undefined ||
    !constantTimeEqual(await signature(token), signed)
  )
    return;
  await getWebsiteStore().deleteSession(await hashText(token));
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secureCookie()}`;
}

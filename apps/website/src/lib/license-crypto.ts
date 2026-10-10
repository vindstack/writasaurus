import type { LicenseTokenPayload } from "../../../../packages/shared/license.ts";

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

function requiredSecret(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

export async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateLicenseKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `WRIT-${value.toUpperCase()}`;
}

export async function encryptLicenseKey(key: string): Promise<string> {
  const rawKey = decodeBase64Url(requiredSecret("LICENSE_ENCRYPTION_KEY"));
  if (rawKey.byteLength !== 32) {
    throw new Error("LICENSE_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.");
  }
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, encoder.encode(key)),
  );
  const packed = new Uint8Array(nonce.length + encrypted.length);
  packed.set(nonce);
  packed.set(encrypted, nonce.length);
  return encodeBase64Url(packed);
}

export async function decryptLicenseKey(encrypted: string): Promise<string> {
  const packed = decodeBase64Url(encrypted);
  if (packed.length < 29) throw new Error("Stored license key ciphertext is invalid.");
  const rawKey = decodeBase64Url(requiredSecret("LICENSE_ENCRYPTION_KEY"));
  if (rawKey.byteLength !== 32) {
    throw new Error("LICENSE_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.");
  }
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packed.slice(0, 12) },
    cryptoKey,
    packed.slice(12),
  );
  return new TextDecoder().decode(plaintext);
}

export async function signLicenseToken(
  payload: LicenseTokenPayload,
  privateKeyBase64Url = requiredSecret("LICENSE_SIGNING_PRIVATE_KEY"),
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    decodeBase64Url(privateKeyBase64Url),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("Ed25519", privateKey, encoder.encode(encodedPayload));
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

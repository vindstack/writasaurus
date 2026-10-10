export interface LicenseTokenPayload {
  licenseId: string;
  deviceHash: string;
  exp: number;
}

export interface LicenseActivationResponse {
  token: string;
  expiresAt: number;
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fingerprintForMachineId(machineId: string): Promise<string> {
  const normalized = machineId.trim();
  if (!normalized) throw new Error("The operating system did not provide a device identifier.");
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`writasaurus-device-v1:${normalized}`),
  );
  return toHex(new Uint8Array(bytes));
}

export async function verifyLicenseToken(
  token: string,
  publicKeyBase64Url: string,
  expectedDeviceHash: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<LicenseTokenPayload | null> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra !== undefined) return null;
  try {
    const payloadBytes = decodeBase64Url(encodedPayload);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as LicenseTokenPayload;
    if (
      typeof payload.licenseId !== "string" || typeof payload.deviceHash !== "string" ||
      !Number.isSafeInteger(payload.exp) || payload.exp <= nowSeconds ||
      payload.deviceHash !== expectedDeviceHash
    ) return null;
    const publicKey = await crypto.subtle.importKey(
      "raw",
      decodeBase64Url(publicKeyBase64Url),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}

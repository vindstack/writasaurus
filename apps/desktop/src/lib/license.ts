import {
  fingerprintForMachineId,
  verifyLicenseToken,
} from "../../../../packages/shared/license.ts";

interface LicenseResponse {
  token: string;
  expiresAt: number;
}

const TOKEN_STORAGE_KEY = "writasaurus-license-token";

export function licenseConfiguration(): {
  publicKey: string;
  apiUrl: string;
  testBypass: boolean;
} {
  return {
    publicKey: import.meta.env.PUBLIC_LICENSE_SIGNING_PUBLIC_KEY ?? "",
    apiUrl: import.meta.env.PUBLIC_LICENSE_API_URL ?? "",
    testBypass: import.meta.env.PUBLIC_LICENSE_TEST_BYPASS === "true",
  };
}

async function deviceHash(): Promise<string> {
  const response = await fetch("/api/editor/license-device-id", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Could not identify this installation.");
  const result: unknown = await response.json();
  if (
    typeof result !== "object" || result === null || !("installationId" in result) ||
    typeof result.installationId !== "string"
  ) throw new Error("Could not identify this installation.");
  return await fingerprintForMachineId(result.installationId);
}

function storedToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function storeToken(response: LicenseResponse): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
}

async function requestToken(
  apiUrl: string,
  endpoint: "activate" | "refresh",
  input: Record<string, string>,
  publicKey: string,
  expectedDeviceHash: string,
): Promise<boolean> {
  const response = await fetch(new URL(`/api/license/${endpoint}`, apiUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (endpoint === "refresh" && response.status === 403) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return false;
    }
    if (response.status < 500) {
      const reason = (await response.text()).trim();
      throw new Error(reason || `The license server rejected the request (${response.status}).`);
    }
    throw new Error(`The license server returned ${response.status}.`);
  }
  const result: unknown = await response.json();
  if (
    typeof result !== "object" || result === null || !("token" in result) ||
    typeof result.token !== "string" || !("expiresAt" in result) ||
    typeof result.expiresAt !== "number"
  ) throw new Error("The license server returned an invalid response.");
  const verified = await verifyLicenseToken(result.token, publicKey, expectedDeviceHash);
  if (!verified || verified.exp !== result.expiresAt) {
    throw new Error("The license server returned an invalid signed token.");
  }
  storeToken({ token: result.token, expiresAt: result.expiresAt });
  return true;
}

export async function checkSavedLicense(publicKey: string, apiUrl: string): Promise<boolean> {
  if (!publicKey || !apiUrl) return false;
  const token = storedToken();
  if (!token) return false;
  const hash = await deviceHash();
  const verified = await verifyLicenseToken(token, publicKey, hash);
  if (!verified) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return false;
  }
  try {
    return await requestToken(
      apiUrl,
      "refresh",
      {
        licenseId: verified.licenseId,
        deviceHash: hash,
      },
      publicKey,
      hash,
    );
  } catch (error) {
    console.warn(
      `License refresh could not reach the server; using its unexpired offline token: ${
        error instanceof Error ? error.message : error
      }`,
    );
    return true;
  }
}

export async function activateLicense(
  key: string,
  publicKey: string,
  apiUrl: string,
): Promise<boolean> {
  if (!publicKey || !apiUrl) throw new Error("License activation is not configured.");
  const hash = await deviceHash();
  return await requestToken(apiUrl, "activate", { key, deviceHash: hash }, publicKey, hash);
}

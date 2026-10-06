import { compareVersions } from "./release-desktop.ts";
import { isPublicHttpsUrl, isReleaseManifest, isSemanticVersion } from "../src/lib/releases.ts";

function releaseBaseUrl(): string {
  const value = Deno.env.get("WRITASAURUS_RELEASES_PUBLIC_URL")?.trim().replace(/\/+$/, "");
  if (!value || !isPublicHttpsUrl(value) || new URL(value).pathname !== "/") {
    throw new Error(
      "WRITASAURUS_RELEASES_PUBLIC_URL must be an HTTPS origin for the public R2 bucket.",
    );
  }
  return value;
}

function releaseVersion(args: string[]): string {
  if (args.length !== 1 || !isSemanticVersion(args[0])) {
    throw new Error("Usage: deno task release:latest <published-version>");
  }
  return args[0];
}

async function fetchReleaseManifest(base: string, version: string): Promise<unknown> {
  const url = `${base}/releases/v${version}/release.json`;
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) {
    throw new Error(`Published release metadata was not found: ${url}`);
  }
  if (!response.ok) {
    throw new Error(`Could not retrieve published release metadata (${response.status}).`);
  }
  let manifest: unknown;
  try {
    manifest = await response.json();
  } catch {
    throw new Error("Published release metadata is not valid JSON.");
  }
  if (!isReleaseManifest(manifest, base) || manifest.version !== version) {
    throw new Error("Published release metadata does not match the expected release version.");
  }
  return manifest;
}

async function readCurrentLatest(base: string): Promise<unknown | null> {
  try {
    const contents = await Deno.readTextFile("public/latest.json");
    let latest: unknown;
    try {
      latest = JSON.parse(contents);
    } catch {
      throw new Error("public/latest.json is not valid JSON; refusing to replace it.");
    }
    if (!isReleaseManifest(latest, base)) {
      throw new Error("public/latest.json is invalid; refusing to replace it.");
    }
    return latest;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}

function ensureNotOlderThanLatest(base: string, version: string, latest: unknown | null): void {
  if (latest !== null && !isReleaseManifest(latest, base)) {
    throw new Error("public/latest.json is invalid; refusing to replace it.");
  }
  if (latest && compareVersions(version, latest.version) < 0) {
    throw new Error(
      `Version ${version} is older than public/latest.json version ${latest.version}; ` +
        "refusing to replace it.",
    );
  }
}

async function main(): Promise<void> {
  const version = releaseVersion(Deno.args);
  const base = releaseBaseUrl();
  const permission = await Deno.permissions.request({
    name: "net",
    host: new URL(base).host,
  });
  if (permission.state !== "granted") {
    throw new Error(`Network permission for ${new URL(base).host} was not granted.`);
  }

  const manifest = await fetchReleaseManifest(base, version);
  ensureNotOlderThanLatest(base, version, await readCurrentLatest(base));
  const latestPath = "public/latest.json";
  await Deno.writeTextFile(latestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Created ${latestPath} for Writasaurus ${version}.`);
  console.log("Deploy the updated public/latest.json with the website.");
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(
      `Could not prepare latest.json: ${error instanceof Error ? error.message : error}`,
    );
    Deno.exitCode = 1;
  }
}

export { ensureNotOlderThanLatest, fetchReleaseManifest, readCurrentLatest, releaseVersion };

import { isReleaseManifest, isSemanticVersion } from "../packages/shared/releases.ts";
import { compareVersions } from "./release-desktop.ts";

const websitePublic = "apps/website/public";
const latestPath = `${websitePublic}/latest.json`;

function releaseVersion(args: string[]): string {
  if (args.length !== 1 || !isSemanticVersion(args[0])) {
    throw new Error("Usage: deno task release:latest <published-version>");
  }
  return args[0];
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await Deno.readTextFile(path));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    if (error instanceof SyntaxError) throw new Error(`${path} is not valid JSON.`);
    throw error;
  }
}

function ensureNotOlderThanLatest(version: string, latest: unknown | null): void {
  if (latest !== null && !isReleaseManifest(latest)) {
    throw new Error(`${latestPath} is invalid; refusing to replace it.`);
  }
  if (latest && compareVersions(version, latest.version) < 0) {
    throw new Error(
      `Version ${version} is older than ${latestPath} version ${latest.version}; refusing to replace it.`,
    );
  }
}

async function main(): Promise<void> {
  const version = releaseVersion(Deno.args);
  const releasePath = `${websitePublic}/releases/v${version}/release.json`;
  const manifest = await readJson(releasePath);
  if (!isReleaseManifest(manifest, version)) {
    throw new Error(`No valid private-artifact metadata found for Writasaurus ${version}.`);
  }
  const latest = await readJson(latestPath);
  ensureNotOlderThanLatest(version, latest);
  await Deno.writeTextFile(latestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Created ${latestPath} for Writasaurus ${version}.`);
  console.log("Deploy the website with the updated version pointer.");
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

export { ensureNotOlderThanLatest, releaseVersion };

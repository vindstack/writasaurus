import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isReleaseManifest,
  isSemanticVersion,
  type ReleaseArtifact,
  type ReleaseManifest,
} from "../packages/shared/releases.ts";
import {
  bucketStorageBytes,
  objectExists,
  putObject,
  type R2Credentials,
  requestR2,
} from "./r2.ts";

interface BuiltArtifact extends Omit<ReleaseArtifact, "objectKey"> {
  platform: "linux" | "macos" | "windows";
  objectKey: string;
  path: string;
}

type ReleasePlatform = "linux" | "macos" | "windows";

const releasePrefix = "releases";
const R2_FREE_STORAGE_BYTES = 10_000_000_000;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const desktopTargets = {
  linux: { flag: "--linux", target: "AppImage", arch: "--x64", fileName: "Writasaurus.AppImage" },
  macos: { flag: "--mac", target: "tar.gz", arch: "--arm64", fileName: "Writasaurus-macos.tar.gz" },
  windows: { flag: "--win", target: "msi", arch: "--x64", fileName: "Writasaurus.msi" },
} as const;
interface BuildCommand {
  command: string;
  args: string[];
  description: string;
}
const platforms: ReleasePlatform[] = ["linux", "macos", "windows"];
const packageManager = process.env.npm_execpath ? process.execPath : "pnpm";
const packageManagerArgs = process.env.npm_execpath ? [process.env.npm_execpath] : [];
const artifactLabels = {
  linux: "Linux",
  macos: "macOS",
  windows: "Windows",
} as const;
const contentTypes: Record<string, string> = {
  ".AppImage": "application/vnd.appimage",
  ".gz": "application/gzip",
  ".msi": "application/x-msi",
  ".txt": "text/plain; charset=utf-8",
};
const latestKey = "latest.json";

function usage(): string {
  return (
    "Usage: pnpm release:desktop <version> --skip-build [--dry-run]\n" +
    "       pnpm release:desktop <version> --build-platform linux|macos|windows\n\n" +
    "Build each platform on its native Linux, macOS, or Windows runner. " +
    "Cross-platform release builds are not supported.\n" +
    "--build-platform builds and validates only that platform; it never publishes.\n" +
    "Combine the native runner outputs at:\n" +
    platforms
      .map((platform) => `  desktop/${platform}/${desktopTargets[platform].fileName}`)
      .join("\n") +
    "\n" +
    "--skip-build validates all three existing packages without deleting or rebuilding them, " +
    "then publishes (or writes metadata only with --dry-run).\n" +
    "Example: pnpm release:desktop 1.2.3 --skip-build --dry-run"
  );
}

function parseArguments(args: string[]): {
  version: string;
  dryRun: boolean;
  skipBuild: boolean;
  buildPlatform?: ReleasePlatform;
} {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  const positional: string[] = [];
  let buildPlatform: ReleasePlatform | undefined;
  let dryRun = false;
  let skipBuild = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--skip-build") skipBuild = true;
    else if (arg === "--build-platform") {
      const platform = args[++index];
      if (buildPlatform || !platforms.includes(platform as ReleasePlatform)) {
        throw new Error(`Invalid --build-platform argument.\n${usage()}`);
      }
      buildPlatform = platform as ReleasePlatform;
    } else positional.push(arg);
  }
  if (
    positional.some((arg) => arg.startsWith("-")) ||
    positional.length !== 1 ||
    !isSemanticVersion(positional[0]) ||
    (buildPlatform !== undefined && (skipBuild || dryRun))
  ) {
    throw new Error(`Invalid release arguments.\n${usage()}`);
  }
  return { version: positional[0], dryRun, skipBuild, buildPlatform };
}

function parseVersion(value: string): {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: string[];
} {
  const match = value.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) throw new Error(`Invalid semantic version: ${value}`);
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (const field of ["major", "minor", "patch"] as const) {
    if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length ? -1 : 1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i++) {
    const aPart = a.prerelease[i];
    const bPart = b.prerelease[i];
    if (aPart === undefined || bPart === undefined) {
      return aPart === undefined ? -1 : 1;
    }
    if (aPart === bPart) continue;
    const aNumber = /^\d+$/.test(aPart) ? BigInt(aPart) : null;
    const bNumber = /^\d+$/.test(bPart) ? BigInt(bPart) : null;
    if (aNumber !== null && bNumber !== null) return aNumber < bNumber ? -1 : 1;
    if (aNumber !== null) return -1;
    if (bNumber !== null) return 1;
    return aPart < bPart ? -1 : 1;
  }
  return 0;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function readCredentials(): R2Credentials {
  const credentials = {
    accountId: requiredEnv("WRITASAURUS_R2_ACCOUNT_ID"),
    accessKeyId: requiredEnv("WRITASAURUS_R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("WRITASAURUS_R2_SECRET_ACCESS_KEY"),
    bucket: requiredEnv("WRITASAURUS_R2_BUCKET"),
  };
  if (!/^[a-f0-9]{32}$/i.test(credentials.accountId)) {
    throw new Error("WRITASAURUS_R2_ACCOUNT_ID must be a 32-character Cloudflare account ID.");
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(credentials.bucket)) {
    throw new Error("WRITASAURUS_R2_BUCKET must be a valid 3–63 character bucket name.");
  }
  return credentials;
}

function publicBaseUrl(): URL {
  const value = requiredEnv("WRITASAURUS_R2_PUBLIC_BASE_URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("WRITASAURUS_R2_PUBLIC_BASE_URL must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(
      "WRITASAURUS_R2_PUBLIC_BASE_URL must be an HTTPS URL without credentials, query, or fragment.",
    );
  }
  if (url.hostname.endsWith(".r2.cloudflarestorage.com")) {
    throw new Error(
      "WRITASAURUS_R2_PUBLIC_BASE_URL points to the private R2 S3 API. " +
        "Use a public custom domain or an enabled r2.dev URL instead.",
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

function publicDownloadUrl(base: URL, objectKey: string): string {
  const suffix = objectKey.split("/").map(encodeURIComponent).join("/");
  return new URL(suffix, base).toString();
}

async function runCommand(command: string, args: string[], description: string): Promise<void> {
  console.log(`\n${description}`);
  await new Promise<void>((accept, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) accept();
      else {
        reject(
          new Error(
            `${description} failed (${signal ? `signal ${signal}` : `exit code ${code}`}).`,
          ),
        );
      }
    });
  });
}

function projectPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (!normalized.startsWith("desktop/") || normalized.includes("..")) {
    throw new Error(`Desktop output must be inside ./desktop/: ${path}`);
  }
  return normalized;
}

function desktopBuildCommands(version: string, platform?: ReleasePlatform): BuildCommand[] {
  if (!isSemanticVersion(version)) throw new Error(`Invalid semantic version: ${version}`);
  if (process.platform === "win32" && !process.env.npm_execpath) {
    throw new Error("On Windows, invoke this script with pnpm release:desktop.");
  }
  return [
    {
      command: packageManager,
      args: [...packageManagerArgs, "--filter", "@writasaurus/desktop", "build"],
      description: "Building the desktop web application and Electron entry points",
    },
    ...(platform ? [platform] : platforms).map((platform) => {
      const options = desktopTargets[platform];
      const configPlatform = platform === "linux" ? "linux" : platform === "macos" ? "mac" : "win";
      return {
        command: packageManager,
        args: [
          ...packageManagerArgs,
          "--filter",
          "@writasaurus/desktop",
          "exec",
          "electron-builder",
          options.flag,
          options.target,
          options.arch,
          "--publish",
          "never",
          `--config.directories.output=${resolve(projectRoot, "desktop", platform)}`,
          `--config.${configPlatform}.artifactName=${options.fileName}`,
          `--config.extraMetadata.version=${version}`,
        ],
        description: `Packaging ${artifactLabels[platform]} Electron application (${options.target})`,
      };
    }),
  ];
}

function artifactPaths(): Record<ReleasePlatform, string> {
  return Object.fromEntries(
    platforms.map((platform) => [
      platform,
      projectPath(`desktop/${platform}/${desktopTargets[platform].fileName}`),
    ]),
  ) as Record<ReleasePlatform, string>;
}

function assertNativeBuildPlatform(
  platform?: ReleasePlatform,
  host = process.platform,
): asserts platform is ReleasePlatform {
  if (!platform) {
    throw new Error(
      "A release requires artifacts from native Linux, macOS, and Windows runners. " +
        "Build each with --build-platform linux|macos|windows, combine their desktop/ outputs, " +
        "then use --skip-build (optionally --dry-run). No files were deleted or rebuilt.",
    );
  }
  const nativeHosts = { linux: "linux", macos: "darwin", windows: "win32" } as const;
  if (nativeHosts[platform] !== host) {
    throw new Error(
      `${artifactLabels[platform]} packaging requires a native ${nativeHosts[platform]} runner; ` +
        `current host is ${host}. Collect native artifacts and publish with --skip-build.`,
    );
  }
}

async function buildDesktopTargets(
  version: string,
  platform?: ReleasePlatform,
): Promise<Record<ReleasePlatform, string>> {
  assertNativeBuildPlatform(platform);
  const commands = desktopBuildCommands(version, platform);
  const paths = artifactPaths();
  await rm(resolve(projectRoot, paths[platform]), { force: true });
  for (const { command, args, description } of commands) {
    await runCommand(command, args, description);
  }
  return paths;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function describeArtifacts(
  version: string,
  paths: Record<"linux" | "macos" | "windows", string>,
  publicUrlBase: URL,
  selectedPlatforms: ReleasePlatform[] = platforms,
): Promise<BuiltArtifact[]> {
  const artifacts: BuiltArtifact[] = [];
  for (const platform of selectedPlatforms) {
    const path = paths[platform];
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(resolve(projectRoot, path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Expected Desktop package was not produced: ${path}`);
      }
      throw error;
    }
    if (!info.isFile() || info.size <= 0) {
      throw new Error(`Expected a non-empty release file at ${path}.`);
    }
    const fileName = path.split("/").pop()!;
    if (!/^[\w.-]+$/.test(fileName)) {
      throw new Error(`Desktop output filename contains unsupported characters: ${fileName}`);
    }
    const extension = fileName.slice(fileName.lastIndexOf("."));
    const contentType = contentTypes[extension];
    if (!contentType) throw new Error(`Unsupported Desktop package extension: ${extension}`);
    const bytes = await readFile(resolve(projectRoot, path));
    validateArtifact(platform, bytes, path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const key = `${releasePrefix}/v${version}/${fileName}`;
    artifacts.push({
      platform,
      label: artifactLabels[platform],
      fileName,
      objectKey: key,
      downloadUrl: publicDownloadUrl(publicUrlBase, key),
      sizeBytes: info.size,
      sha256,
      path,
    });
  }
  return artifacts;
}

function validateArtifact(platform: ReleasePlatform, bytes: Uint8Array, path: string): void {
  const valid =
    platform === "linux"
      ? bytes.length > 10 && bytes[8] === 0x41 && bytes[9] === 0x49
      : platform === "macos"
        ? bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
        : bytes.length > 8 &&
          [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
            (value, index) => bytes[index] === value,
          );
  if (!valid) {
    throw new Error(
      `The ${artifactLabels[platform]} package has an invalid file signature: ${path}`,
    );
  }
}

function makeChecksums(artifacts: BuiltArtifact[]): string {
  return `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.fileName}`).join("\n")}\n`;
}

async function makeManifest(
  version: string,
  artifacts: BuiltArtifact[],
  checksums: string,
  publicUrlBase: URL,
): Promise<ReleaseManifest> {
  const artifactMap = Object.fromEntries(
    artifacts.map(({ platform, label, fileName, objectKey, downloadUrl, sizeBytes, sha256 }) => [
      platform,
      { label, fileName, objectKey, downloadUrl, sizeBytes, sha256 },
    ]),
  ) as ReleaseManifest["artifacts"];
  const checksumsKey = `${releasePrefix}/v${version}/SHA256SUMS.txt`;
  return {
    version,
    releasedAt: new Date().toISOString(),
    artifacts: artifactMap,
    checksums: {
      fileName: "SHA256SUMS.txt",
      objectKey: checksumsKey,
      downloadUrl: publicDownloadUrl(publicUrlBase, checksumsKey),
      sha256: toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(checksums))),
    },
  };
}

async function verifyNotPublished(version: string, credentials: R2Credentials): Promise<void> {
  const versionPrefix = `${releasePrefix}/v${version}/`;
  const keys = [
    `${versionPrefix}Writasaurus.AppImage`,
    `${versionPrefix}Writasaurus-macos.tar.gz`,
    `${versionPrefix}Writasaurus.msi`,
    `${versionPrefix}SHA256SUMS.txt`,
    `${versionPrefix}release.json`,
  ];
  const existingKeys: string[] = [];
  for (const key of keys) {
    if (await objectExists(credentials, key)) existingKeys.push(key);
  }
  if (existingKeys.length > 0) {
    throw new Error(
      `Release paths for version ${version} already exist in R2 (${existingKeys.join(", ")}). ` +
        "They are immutable; remove incomplete orphan objects or publish a new version.",
    );
  }
}

async function writeDryRun(version: string, manifest: ReleaseManifest): Promise<void> {
  const outputDir = `desktop/release-dry-run/v${version}`;
  await mkdir(resolve(projectRoot, outputDir), { recursive: true });
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(resolve(projectRoot, outputDir, "release.json"), json);
  await writeFile(
    resolve(projectRoot, outputDir, "SHA256SUMS.txt"),
    makeChecksumsFromManifest(manifest),
  );
  console.log(`Dry run complete. Metadata preview: ${outputDir}/release.json`);
  console.log("No Cloudflare credentials were read and no R2 API requests or uploads were made.");
}

function makeChecksumsFromManifest(manifest: ReleaseManifest): string {
  return `${(["linux", "macos", "windows"] as const)
    .map((platform) => {
      const artifact = manifest.artifacts[platform];
      return `${artifact.sha256}  ${artifact.fileName}`;
    })
    .join("\n")}\n`;
}

async function assertNewReleaseVersion(
  version: string,
  credentials: R2Credentials,
): Promise<string | null> {
  const response = await requestR2("GET", latestKey, credentials);
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`R2 GET ${latestKey} failed (${response.status}).`);
  }
  const latest: unknown = await response.json();
  // Only the version is needed here, so older bucket manifest formats can be upgraded.
  if (
    typeof latest !== "object" ||
    latest === null ||
    !("version" in latest) ||
    typeof latest.version !== "string" ||
    !isSemanticVersion(latest.version)
  ) {
    throw new Error(`R2 ${latestKey} has an invalid version; refusing to publish.`);
  }
  if (compareVersions(version, latest.version) <= 0) {
    throw new Error(
      `Version ${version} must be newer than current latest version ${latest.version}.`,
    );
  }
  const etag = response.headers.get("etag");
  if (!etag) throw new Error(`R2 ${latestKey} is missing an ETag; refusing to publish.`);
  return etag;
}

async function publish(
  manifest: ReleaseManifest,
  artifacts: BuiltArtifact[],
  credentials: R2Credentials,
): Promise<void> {
  const latestEtag = await assertNewReleaseVersion(manifest.version, credentials);
  const releaseBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const checksumBytes = new TextEncoder().encode(makeChecksumsFromManifest(manifest));
  const currentStorage = await bucketStorageBytes(credentials);
  const addedBytes =
    artifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0) +
    releaseBytes.byteLength * 2 +
    checksumBytes.byteLength;
  if (currentStorage + addedBytes > R2_FREE_STORAGE_BYTES) {
    throw new Error(
      `Publishing would exceed the 10 GB R2 free storage allowance ` +
        `(${currentStorage.toLocaleString()} existing + ${addedBytes.toLocaleString()} new bytes).`,
    );
  }
  console.log(
    `R2 free-tier storage check: ${currentStorage.toLocaleString()} existing + ` +
      `${addedBytes.toLocaleString()} estimated bytes (10,000,000,000-byte limit).`,
  );

  for (const artifact of artifacts) {
    const bytes = await readFile(resolve(projectRoot, artifact.path));
    validateArtifact(artifact.platform, bytes, artifact.path);
    if (
      bytes.byteLength !== artifact.sizeBytes ||
      createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
    ) {
      throw new Error(`Release artifact changed before upload: ${artifact.path}`);
    }
    console.log(`Uploading ${artifact.label} (${artifact.sizeBytes.toLocaleString()} bytes)…`);
    await putObject(credentials, artifact.objectKey, bytes, {
      contentType: contentTypes[artifact.fileName.slice(artifact.fileName.lastIndexOf("."))],
      sha256: artifact.sha256,
      immutable: true,
      cacheControl: "public, max-age=31536000, immutable",
    });
    console.log(`Verified ${artifact.objectKey}`);
  }

  const releaseKey = `${releasePrefix}/v${manifest.version}/release.json`;
  await putObject(credentials, manifest.checksums.objectKey, checksumBytes, {
    contentType: contentTypes[".txt"],
    sha256: manifest.checksums.sha256,
    immutable: true,
    cacheControl: "public, max-age=31536000, immutable",
  });
  console.log(`Verified ${manifest.checksums.objectKey}`);

  await putObject(credentials, releaseKey, releaseBytes, {
    contentType: "application/json",
    immutable: true,
    cacheControl: "public, max-age=31536000, immutable",
  });
  console.log(`Verified ${releaseKey}`);

  await putObject(credentials, latestKey, releaseBytes, {
    contentType: "application/json",
    immutable: latestEtag === null,
    ifMatch: latestEtag ?? undefined,
    cacheControl: "no-cache",
  });
  console.log(`Verified ${latestKey}`);

  console.log(`\nPublished Writasaurus ${manifest.version} to public artifact storage.`);
}

async function main(): Promise<void> {
  const { version, dryRun, skipBuild, buildPlatform } = parseArguments(process.argv.slice(2));
  if (!skipBuild) assertNativeBuildPlatform(buildPlatform);
  if (buildPlatform) {
    const paths = await buildDesktopTargets(version, buildPlatform);
    await describeArtifacts(version, paths, new URL("https://native-build.invalid/"), [
      buildPlatform,
    ]);
    console.log(
      `Validated ${paths[buildPlatform]}. Collect all native platform outputs, ` +
        "then publish with --skip-build.",
    );
    return;
  }
  const publicUrlBase = publicBaseUrl();
  let credentials: R2Credentials | undefined;
  if (!dryRun) {
    credentials = readCredentials();
    await assertNewReleaseVersion(version, credentials);
    await verifyNotPublished(version, credentials);
  } else {
    console.log("Dry run: remote duplicate-version checks and uploads are skipped.");
  }

  const paths = artifactPaths();
  const artifacts = await describeArtifacts(version, paths, publicUrlBase);
  const checksums = makeChecksums(artifacts);
  const manifest = await makeManifest(version, artifacts, checksums, publicUrlBase);
  if (!isReleaseManifest(manifest, version)) {
    throw new Error("Generated release metadata does not match the required artifact manifest.");
  }
  console.log(`\nRelease ${version}`);
  for (const artifact of artifacts) {
    console.log(
      `  ${artifact.label}: ${artifact.path} (${artifact.sizeBytes.toLocaleString()} bytes, SHA-256 ${artifact.sha256})`,
    );
  }

  if (dryRun) {
    await writeDryRun(version, manifest);
  } else {
    await publish(manifest, artifacts, credentials!);
    console.log(`Updated ${publicDownloadUrl(publicUrlBase, latestKey)}; downloads are live.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`Release failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export {
  assertNewReleaseVersion,
  assertNativeBuildPlatform,
  buildDesktopTargets,
  describeArtifacts,
  desktopBuildCommands,
  desktopTargets,
  makeChecksums,
  makeManifest,
  main,
  parseArguments,
  parseVersion,
  projectPath,
  publicBaseUrl,
  publicDownloadUrl,
  publish,
  validateArtifact,
  verifyNotPublished,
  writeDryRun,
};

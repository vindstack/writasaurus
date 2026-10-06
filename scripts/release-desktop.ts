import {
  isPublicHttpsUrl,
  isReleaseManifest,
  isSemanticVersion,
  type ReleaseArtifact,
  type ReleaseManifest,
} from "../src/lib/releases.ts";
import {
  bucketStorageBytes,
  objectExists,
  putObject,
  type R2Credentials,
  readObject,
  requestR2,
} from "./r2.ts";

interface DesktopConfig {
  output: Record<"linux" | "macos" | "windows", string>;
}

interface ProjectConfig {
  desktop?: { output?: DesktopConfig["output"] };
}

interface BuiltArtifact extends ReleaseArtifact {
  platform: "linux" | "macos" | "windows";
  key: string;
  path: string;
}

type ReleasePlatform = "linux" | "macos" | "windows";

const releasePrefix = "releases";
const R2_FREE_STORAGE_BYTES = 10_000_000_000;
const desktopTargets: Record<ReleasePlatform, { target: string; icon: boolean }> = {
  linux: { target: "x86_64-unknown-linux-gnu", icon: true },
  macos: { target: "aarch64-apple-darwin", icon: false },
  windows: { target: "x86_64-pc-windows-msvc", icon: false },
};
const artifactLabels = {
  linux: "Linux",
  macos: "macOS",
  windows: "Windows",
} as const;
const contentTypes: Record<string, string> = {
  ".AppImage": "application/vnd.appimage",
  ".gz": "application/gzip",
  ".msi": "application/x-msi",
};

function usage(): string {
  return "Usage: deno task release:desktop <version> [--dry-run]\n" +
    "Example: deno task release:desktop 1.2.3 --dry-run";
}

function parseArguments(args: string[]): { version: string; dryRun: boolean } {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    Deno.exit(0);
  }
  const positional = args.filter((arg) => arg !== "--dry-run");
  if (
    args.some((arg) => arg.startsWith("-") && arg !== "--dry-run") ||
    positional.length !== 1 ||
    !isSemanticVersion(positional[0])
  ) {
    throw new Error(`Invalid release arguments.\n${usage()}`);
  }
  return { version: positional[0], dryRun: args.includes("--dry-run") };
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
  const value = Deno.env.get(name)?.trim();
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

function releaseBaseUrl(): string {
  const value = requiredEnv("WRITASAURUS_RELEASES_PUBLIC_URL").replace(/\/+$/, "");
  if (!isPublicHttpsUrl(value) || new URL(value).pathname !== "/") {
    throw new Error(
      "WRITASAURUS_RELEASES_PUBLIC_URL must be an HTTPS origin for the public R2 bucket.",
    );
  }
  return value;
}

async function runCommand(command: string, args: string[], description: string): Promise<void> {
  console.log(`\n${description}`);
  const child = new Deno.Command(command, {
    args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  const status = await child.status;
  if (!status.success) {
    throw new Error(`${description} failed (exit code ${status.code}).`);
  }
}

function writeString(header: Uint8Array, offset: number, length: number, value: string): void {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length > length) throw new Error(`Tar archive field is too long: ${value}`);
  header.set(encoded, offset);
}

function writeOctal(header: Uint8Array, offset: number, length: number, value: number): void {
  const encoded = value.toString(8).padStart(length - 1, "0");
  if (encoded.length > length - 1) throw new Error("File metadata exceeds the tar format limits.");
  writeString(header, offset, length - 1, encoded);
  header[offset + length - 1] = 0;
}

function tarPathFields(path: string): { name: string; prefix: string } {
  if (new TextEncoder().encode(path).length <= 100) return { name: path, prefix: "" };
  const separators = [...path.matchAll(/\//g)].map((match) => match.index!);
  for (const separator of separators.reverse()) {
    const prefix = path.slice(0, separator);
    const name = path.slice(separator + 1);
    if (
      new TextEncoder().encode(prefix).length <= 155 &&
      new TextEncoder().encode(name).length <= 100
    ) return { name, prefix };
  }
  throw new Error(`Path is too long for a portable macOS application archive: ${path}`);
}

function tarHeader(
  path: string,
  options: {
    size: number;
    mode: number;
    mtime: number;
    type: "file" | "directory" | "symlink";
    link?: string;
  },
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(new ArrayBuffer(512));
  const fields = tarPathFields(path);
  writeString(header, 0, 100, fields.name);
  writeOctal(header, 100, 8, options.mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, options.size);
  writeOctal(header, 136, 12, options.mtime);
  header.fill(32, 148, 156);
  header[156] = options.type === "directory" ? 53 : options.type === "symlink" ? 50 : 48;
  if (options.link) writeString(header, 157, 100, options.link);
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 265, 32, "root");
  writeString(header, 297, 32, "root");
  writeString(header, 345, 155, fields.prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeString(header, 148, 6, checksum.toString(8).padStart(6, "0"));
  header[154] = 0;
  header[155] = 32;
  return header;
}

async function writeCompressedMacApp(bundlePath: string): Promise<string> {
  const archivePath = "desktop/Writasaurus-macos.tar.gz";
  const output = await Deno.create(archivePath);
  const compression = new CompressionStream("gzip");
  const compressedWriter = compression.writable.getWriter();
  const writeOutput = async (chunk: Uint8Array): Promise<void> => {
    let offset = 0;
    while (offset < chunk.byteLength) offset += await output.write(chunk.subarray(offset));
  };
  const pump = compression.readable.pipeTo(
    new WritableStream<Uint8Array>({ write: writeOutput }),
  );

  const writeEntry = async (
    relative: string,
    path: string,
    kind: "file" | "directory" | "symlink",
  ): Promise<void> => {
    const info = await Deno.stat(path);
    const archiveName = kind === "directory" ? `${relative.replace(/\/+$/, "")}/` : relative;
    const link = kind === "symlink" ? await Deno.readLink(path) : undefined;
    const size = kind === "file" ? info.size : 0;
    await compressedWriter.write(
      tarHeader(archiveName, {
        size,
        mode: info.mode ? info.mode & 0o777 : kind === "directory" ? 0o755 : 0o644,
        mtime: Math.floor((info.mtime?.getTime() ?? Date.now()) / 1000),
        type: kind,
        link,
      }),
    );

    if (kind === "file") {
      const file = await Deno.open(path, { read: true });
      try {
        let read = 0;
        const buffer = new Uint8Array(128 * 1024);
        while (read < size) {
          const count = await file.read(
            buffer.subarray(0, Math.min(buffer.byteLength, size - read)),
          );
          if (count === null) throw new Error(`File changed while archiving: ${path}`);
          read += count;
          await compressedWriter.write(buffer.subarray(0, count));
        }
        if (read !== size) throw new Error(`File changed while archiving: ${path}`);
      } finally {
        file.close();
      }
      const padding = (512 - (size % 512)) % 512;
      if (padding) await compressedWriter.write(new Uint8Array(padding));
    } else if (kind === "directory") {
      const children = [];
      for await (const entry of Deno.readDir(path)) children.push(entry);
      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) {
        const childPath = `${path}/${child.name}`;
        const childRelative = `${archiveName}${child.name}`;
        await writeEntry(
          childRelative,
          childPath,
          child.isSymlink ? "symlink" : child.isDirectory ? "directory" : "file",
        );
      }
    }
  };

  try {
    const rootName = bundlePath.split("/").pop()!;
    await writeEntry(rootName, bundlePath, "directory");
    await compressedWriter.write(new Uint8Array(1024));
    await compressedWriter.close();
    await pump;
  } catch (error) {
    await compressedWriter.abort(error).catch(() => {});
    await pump.catch(() => {});
    throw error;
  } finally {
    output.close();
  }
  return archivePath;
}

function projectPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (!normalized.startsWith("desktop/") || normalized.includes("..")) {
    throw new Error(`Desktop output must be inside ./desktop/: ${path}`);
  }
  return normalized;
}

async function buildDesktopTargets(): Promise<Record<"linux" | "macos" | "windows", string>> {
  await runCommand("deno", ["task", "build"], "Building the web application");

  const config = JSON.parse(await Deno.readTextFile("deno.json")) as ProjectConfig;
  const output = config.desktop?.output;
  if (!output?.linux || !output.macos || !output.windows) {
    throw new Error("deno.json must define Desktop output paths for linux, macos, and windows.");
  }
  const paths = {
    linux: projectPath(output.linux),
    macos: projectPath(output.macos),
    windows: projectPath(output.windows),
  };
  for (const platform of ["linux", "macos", "windows"] as const) {
    const options = desktopTargets[platform];
    const args = [
      "desktop",
      "--no-check",
      `--target=${options.target}`,
      `--output=./${paths[platform]}`,
      ...(options.icon ? ["--icon=public/desktop-icon.png"] : []),
      "--allow-env=HOME,XDG_DATA_HOME,LOCALAPPDATA,APPDATA,PORT,DENO_SERVE_ADDRESS,DENO_DESKTOP,WRITASAURUS_DESKTOP",
      "--allow-net",
      "--allow-read",
      "--allow-write",
      "--allow-run=zenity,kdialog,which,osascript,powershell",
      "desktop.ts",
    ];
    await runCommand(
      "deno",
      args,
      `Building ${artifactLabels[platform]} Desktop package (${options.target})`,
    );
  }

  paths.macos = `${paths.macos}.app`;
  const macInfo = await Deno.stat(paths.macos);
  if (!macInfo.isDirectory) {
    throw new Error(`Expected a macOS application bundle directory at ${paths.macos}.`);
  }
  paths.macos = await writeCompressedMacApp(paths.macos);
  return paths;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function describeArtifacts(
  version: string,
  paths: Record<"linux" | "macos" | "windows", string>,
  publicBase: string,
): Promise<BuiltArtifact[]> {
  const artifacts: BuiltArtifact[] = [];
  for (const platform of ["linux", "macos", "windows"] as const) {
    const path = paths[platform];
    let info: Deno.FileInfo;
    try {
      info = await Deno.stat(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Expected Desktop package was not produced: ${path}`);
      }
      throw error;
    }
    if (!info.isFile || info.size <= 0) {
      throw new Error(`Expected a non-empty release file at ${path}.`);
    }
    const fileName = path.split("/").pop()!;
    if (!/^[\w.-]+$/.test(fileName)) {
      throw new Error(`Desktop output filename contains unsupported characters: ${fileName}`);
    }
    const extension = fileName.slice(fileName.lastIndexOf("."));
    const contentType = contentTypes[extension];
    if (!contentType) throw new Error(`Unsupported Desktop package extension: ${extension}`);
    const bytes = await Deno.readFile(path);
    const sha256 = toHex(await crypto.subtle.digest("SHA-256", bytes));
    const key = `${releasePrefix}/v${version}/${fileName}`;
    artifacts.push({
      platform,
      label: artifactLabels[platform],
      fileName,
      url: `${publicBase}/${key}`,
      sizeBytes: info.size,
      sha256,
      key,
      path,
    });
  }
  return artifacts;
}

function makeManifest(
  version: string,
  publicBase: string,
  artifacts: BuiltArtifact[],
): ReleaseManifest {
  const releaseKey = `${releasePrefix}/v${version}/release.json`;
  const artifactMap = Object.fromEntries(
    artifacts.map(({ platform, label, fileName, url, sizeBytes, sha256 }) => [
      platform,
      { label, fileName, url, sizeBytes, sha256 },
    ]),
  ) as ReleaseManifest["artifacts"];
  return {
    version,
    releasedAt: new Date().toISOString(),
    releaseUrl: `${publicBase}/${releaseKey}`,
    artifacts: artifactMap,
  };
}

async function verifyNotPublished(
  version: string,
  credentials: R2Credentials,
): Promise<void> {
  const releaseKey = `${releasePrefix}/v${version}/release.json`;
  if (await objectExists(credentials, releaseKey)) {
    throw new Error(`Version ${version} is already published; release paths are immutable.`);
  }
  const latestBytes = await readObject(credentials, "latest.json");
  if (!latestBytes) return;
  let latest: unknown;
  try {
    latest = JSON.parse(new TextDecoder().decode(latestBytes));
  } catch {
    throw new Error("The existing latest.json is invalid; refusing to overwrite release metadata.");
  }
  if (!isReleaseManifest(latest)) {
    throw new Error("The existing latest.json has an unsupported release manifest.");
  }
  if (compareVersions(version, latest.version) <= 0) {
    throw new Error(
      `Version ${version} must be newer than currently published version ${latest.version}.`,
    );
  }
}

async function ensureNetworkPermission(accountId: string): Promise<void> {
  const permission = await Deno.permissions.request({
    name: "net",
    host: `${accountId}.r2.cloudflarestorage.com`,
  });
  if (permission.state !== "granted") {
    throw new Error("Network permission for the Cloudflare R2 account was not granted.");
  }
}

async function writeDryRun(version: string, manifest: ReleaseManifest): Promise<void> {
  const outputDir = `desktop/release-dry-run/v${version}`;
  await Deno.mkdir(outputDir, { recursive: true });
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  await Deno.writeTextFile(`${outputDir}/release.json`, json);
  await Deno.writeTextFile("desktop/release-dry-run/latest.json", json);
  console.log(`Dry run complete. Metadata preview: ${outputDir}/release.json`);
  console.log("No Cloudflare credentials were read and no R2 API requests or uploads were made.");
}

async function publish(
  version: string,
  manifest: ReleaseManifest,
  artifacts: BuiltArtifact[],
  credentials: R2Credentials,
): Promise<void> {
  const releaseBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const latestBytes = releaseBytes;
  const currentStorage = await bucketStorageBytes(credentials);
  const addedBytes = artifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0) +
    releaseBytes.byteLength + latestBytes.byteLength;
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
    const bytes = await Deno.readFile(artifact.path);
    console.log(`Uploading ${artifact.label} (${artifact.sizeBytes.toLocaleString()} bytes)…`);
    await putObject(credentials, artifact.key, bytes, {
      contentType: contentTypes[artifact.fileName.slice(artifact.fileName.lastIndexOf("."))],
      sha256: artifact.sha256,
      immutable: true,
      cacheControl: "public, max-age=31536000, immutable",
    });
    console.log(`Verified ${artifact.key}`);
  }

  const releaseKey = `${releasePrefix}/v${version}/release.json`;
  await putObject(credentials, releaseKey, releaseBytes, {
    contentType: "application/json",
    immutable: true,
    cacheControl: "public, max-age=31536000, immutable",
  });
  console.log(`Verified ${releaseKey}`);

  const latestHead = await requestR2("HEAD", "latest.json", credentials);
  let latestCondition: { ifMatch: string } | { immutable: true };
  if (latestHead.status === 404) {
    latestCondition = { immutable: true };
  } else if (latestHead.ok) {
    const etag = latestHead.headers.get("etag");
    if (!etag) throw new Error("R2 latest.json response did not include an ETag.");
    const currentBytes = await readObject(credentials, "latest.json");
    if (!currentBytes) {
      throw new Error("latest.json disappeared during publication; refusing to overwrite it.");
    }
    const current: unknown = JSON.parse(new TextDecoder().decode(currentBytes));
    if (!isReleaseManifest(current) || compareVersions(version, current.version) <= 0) {
      throw new Error(
        `A newer or conflicting release was published while building ${version}; latest.json was not changed.`,
      );
    }
    latestCondition = { ifMatch: etag };
  } else {
    throw new Error(`Could not inspect latest.json before updating it (${latestHead.status}).`);
  }
  await putObject(credentials, "latest.json", latestBytes, {
    contentType: "application/json",
    cacheControl: "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    ...latestCondition,
  });
  console.log("Verified latest.json");
  console.log(`\nPublished Writasaurus ${version}. Public metadata: ${manifest.releaseUrl}`);
}

async function main(): Promise<void> {
  const { version, dryRun } = parseArguments(Deno.args);
  const publicBase = releaseBaseUrl();
  let credentials: R2Credentials | undefined;
  if (!dryRun) {
    credentials = readCredentials();
    await ensureNetworkPermission(credentials.accountId);
    await verifyNotPublished(version, credentials);
  } else {
    console.log("Dry run: remote duplicate-version checks and uploads are skipped.");
  }

  const paths = await buildDesktopTargets();
  const artifacts = await describeArtifacts(version, paths, publicBase);
  const manifest = makeManifest(version, publicBase, artifacts);
  console.log(`\nRelease ${version}`);
  for (const artifact of artifacts) {
    console.log(
      `  ${artifact.label}: ${artifact.path} (${artifact.sizeBytes.toLocaleString()} bytes, SHA-256 ${artifact.sha256})`,
    );
  }

  if (dryRun) {
    await writeDryRun(version, manifest);
  } else {
    await publish(version, manifest, artifacts, credentials!);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`Release failed: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exitCode = 1;
  }
}

export { desktopTargets, makeManifest, parseArguments, parseVersion, projectPath };

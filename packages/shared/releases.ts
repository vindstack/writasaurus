export interface ReleaseArtifact {
  label: string;
  fileName: string;
  objectKey: string;
  downloadUrl: string;
  sizeBytes: number;
  sha256: string;
}

export interface ReleaseChecksums {
  fileName: "SHA256SUMS.txt";
  objectKey: string;
  downloadUrl: string;
  sha256: string;
  sizeBytes?: number;
}

export type ReleasePlatform = "linux" | "macos" | "windows";

export interface ReleaseManifest {
  version: string;
  releasedAt: string;
  artifacts: Partial<Record<ReleasePlatform, ReleaseArtifact>>;
  checksums: ReleaseChecksums;
}

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isSemanticVersion(value: string): boolean {
  return SEMVER.test(value);
}

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function downloadUrlMatchesKey(value: string, key: string): boolean {
  const fileName = key.split("/").at(-1);
  const workerPath =
    fileName === "Writasaurus.AppImage"
      ? "/api/releases/linux"
      : fileName === "Writasaurus-macos.tar.gz"
        ? "/api/releases/macos"
        : fileName === "Writasaurus.msi"
          ? "/api/releases/windows"
          : fileName === "SHA256SUMS.txt" ||
              /^(linux|macos|windows)-SHA256SUMS\.txt$/.test(fileName ?? "")
            ? "/api/releases/checksums"
            : null;
  if (value === workerPath) return true;
  if (!isPublicHttpsUrl(value)) return false;
  try {
    const url = new URL(value);
    const suffix = key.split("/").map(encodeURIComponent).join("/");
    return url.pathname.endsWith(`/${suffix}`);
  } catch {
    return false;
  }
}

function isArtifact(value: unknown): value is ReleaseArtifact {
  if (typeof value !== "object" || value === null) return false;
  const artifact = value as Record<string, unknown>;
  return (
    typeof artifact.label === "string" &&
    typeof artifact.fileName === "string" &&
    typeof artifact.objectKey === "string" &&
    /^releases\/v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\w.-]+)?(?:\+[a-zA-Z0-9.-]+)?\/[\w.-]+$/.test(
      artifact.objectKey,
    ) &&
    typeof artifact.downloadUrl === "string" &&
    downloadUrlMatchesKey(artifact.downloadUrl, artifact.objectKey) &&
    typeof artifact.sizeBytes === "number" &&
    Number.isSafeInteger(artifact.sizeBytes) &&
    artifact.sizeBytes > 0 &&
    typeof artifact.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(artifact.sha256)
  );
}

export function isReleaseManifest(
  value: unknown,
  expectedVersion?: string,
): value is ReleaseManifest {
  if (typeof value !== "object" || value === null) return false;
  const release = value as Record<string, unknown>;
  if (
    typeof release.version !== "string" ||
    !isSemanticVersion(release.version) ||
    typeof release.releasedAt !== "string" ||
    Number.isNaN(Date.parse(release.releasedAt)) ||
    typeof release.artifacts !== "object" ||
    release.artifacts === null
  )
    return false;

  const artifacts = release.artifacts as Record<string, unknown>;
  const platformFileNames = {
    linux: "Writasaurus.AppImage",
    macos: "Writasaurus-macos.tar.gz",
    windows: "Writasaurus.msi",
  } as const;
  const platforms = Object.keys(platformFileNames) as ReleasePlatform[];
  if (
    !platforms.some((platform) => Object.hasOwn(artifacts, platform)) ||
    platforms.some((platform) => {
      if (!Object.hasOwn(artifacts, platform)) return false;
      const artifact = artifacts[platform];
      if (!isArtifact(artifact)) return true;
      return (
        artifact.fileName !== platformFileNames[platform] ||
        !new RegExp(
          `^releases/v(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-[\\w.-]+)?(?:\\+[a-zA-Z0-9.-]+)?/${platformFileNames[platform].replaceAll(".", "\\.")}$`,
        ).test(artifact.objectKey)
      );
    })
  ) {
    return false;
  }
  if (expectedVersion !== undefined && release.version !== expectedVersion) return false;
  const checksums = release.checksums as Record<string, unknown> | undefined;
  return (
    !!checksums &&
    checksums.fileName === "SHA256SUMS.txt" &&
    typeof checksums.objectKey === "string" &&
    /^releases\/v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\w.-]+)?(?:\+[a-zA-Z0-9.-]+)?\/(?:SHA256SUMS\.txt|(?:linux|macos|windows)-SHA256SUMS\.txt)$/.test(
      checksums.objectKey,
    ) &&
    typeof checksums.downloadUrl === "string" &&
    downloadUrlMatchesKey(checksums.downloadUrl, checksums.objectKey) &&
    typeof checksums.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(checksums.sha256) &&
    (checksums.sizeBytes === undefined ||
      (typeof checksums.sizeBytes === "number" &&
        Number.isSafeInteger(checksums.sizeBytes) &&
        checksums.sizeBytes > 0))
  );
}

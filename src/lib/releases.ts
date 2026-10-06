export interface ReleaseArtifact {
  label: string;
  fileName: string;
  url: string;
  sizeBytes: number;
  sha256: string;
}

export interface ReleaseManifest {
  version: string;
  releasedAt: string;
  releaseUrl: string;
  artifacts: {
    linux: ReleaseArtifact;
    macos: ReleaseArtifact;
    windows: ReleaseArtifact;
  };
}

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isSemanticVersion(value: string): boolean {
  return SEMVER.test(value);
}

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search &&
      !url.hash;
  } catch {
    return false;
  }
}

function isArtifact(value: unknown): value is ReleaseArtifact {
  if (typeof value !== "object" || value === null) return false;
  const artifact = value as Record<string, unknown>;
  return typeof artifact.label === "string" && typeof artifact.fileName === "string" &&
    typeof artifact.url === "string" && isPublicHttpsUrl(artifact.url) &&
    typeof artifact.sizeBytes === "number" && Number.isSafeInteger(artifact.sizeBytes) &&
    artifact.sizeBytes > 0 && typeof artifact.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(artifact.sha256);
}

export function isReleaseManifest(
  value: unknown,
  expectedBaseUrl?: string,
): value is ReleaseManifest {
  if (typeof value !== "object" || value === null) return false;
  const release = value as Record<string, unknown>;
  if (
    typeof release.version !== "string" || !isSemanticVersion(release.version) ||
    typeof release.releasedAt !== "string" || Number.isNaN(Date.parse(release.releasedAt)) ||
    typeof release.releaseUrl !== "string" || !isPublicHttpsUrl(release.releaseUrl) ||
    typeof release.artifacts !== "object" || release.artifacts === null
  ) return false;

  const artifacts = release.artifacts as Record<string, unknown>;
  if (
    !isArtifact(artifacts.linux) || !isArtifact(artifacts.macos) ||
    !isArtifact(artifacts.windows)
  ) return false;
  if (expectedBaseUrl === undefined) return true;

  const base = expectedBaseUrl.replace(/\/+$/, "");
  const prefix = `${base}/releases/v${release.version}/`;
  return release.releaseUrl === `${prefix}release.json` &&
    artifacts.linux.url === `${prefix}Writasaurus.AppImage` &&
    artifacts.macos.url === `${prefix}Writasaurus-macos.tar.gz` &&
    artifacts.windows.url === `${prefix}Writasaurus.msi`;
}

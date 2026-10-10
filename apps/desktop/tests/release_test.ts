import {
  compareVersions,
  desktopTargets,
  parseArguments,
  projectPath,
  validateArtifact,
} from "../../../scripts/release-desktop.ts";
import { ensureNotOlderThanLatest, releaseVersion } from "../../../scripts/prepare-latest.ts";
import { parseBucketListing, type R2Credentials, signR2Request } from "../../../scripts/r2.ts";
import {
  isReleaseManifest,
  isSemanticVersion,
  type ReleaseManifest,
} from "../../../packages/shared/releases.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function testManifest(): ReleaseManifest {
  const prefix = "releases/v1.0.0/";
  return {
    version: "1.0.0",
    releasedAt: "2026-10-05T12:00:00.000Z",
    artifacts: {
      linux: {
        label: "Linux",
        fileName: "Writasaurus.AppImage",
        objectKey: `${prefix}Writasaurus.AppImage`,
        downloadUrl: `https://downloads.example.com/${prefix}Writasaurus.AppImage`,
        sizeBytes: 42,
        sha256: "a".repeat(64),
      },
      macos: {
        label: "macOS",
        fileName: "Writasaurus-macos.tar.gz",
        objectKey: `${prefix}Writasaurus-macos.tar.gz`,
        downloadUrl: `https://downloads.example.com/${prefix}Writasaurus-macos.tar.gz`,
        sizeBytes: 42,
        sha256: "a".repeat(64),
      },
      windows: {
        label: "Windows",
        fileName: "Writasaurus.msi",
        objectKey: `${prefix}Writasaurus.msi`,
        downloadUrl: `https://downloads.example.com/${prefix}Writasaurus.msi`,
        sizeBytes: 42,
        sha256: "a".repeat(64),
      },
    },
    checksums: {
      fileName: "SHA256SUMS.txt",
      objectKey: `${prefix}SHA256SUMS.txt`,
      downloadUrl: `https://downloads.example.com/${prefix}SHA256SUMS.txt`,
      sha256: "b".repeat(64),
    },
  };
}

Deno.test("release: validates versions and command arguments", () => {
  assert(isSemanticVersion("1.2.3"));
  assert(isSemanticVersion("2.0.0-rc.1+build.12"));
  assert(!isSemanticVersion("v1.2.3"));
  assert(!isSemanticVersion("01.2.3"));
  const parsed = parseArguments(["1.2.3", "--dry-run"]);
  assert(parsed.version === "1.2.3" && parsed.dryRun);
  assert(releaseVersion(["0.0.1"]) === "0.0.1");
});

Deno.test("release: compares stable and prerelease versions", () => {
  assert(compareVersions("1.0.0", "1.0.0-rc.1") > 0);
  assert(compareVersions("1.0.0-rc.2", "1.0.0-rc.10") < 0);
  assert(compareVersions("1.2.3+one", "1.2.3+two") === 0);
});

Deno.test("release: constrains artifact paths and maps cross-compilation targets", () => {
  assert(projectPath("./desktop/Writasaurus.AppImage") === "desktop/Writasaurus.AppImage");
  for (const path of ["./public/app", "./desktop/../public/app"]) {
    let rejected = false;
    try {
      projectPath(path);
    } catch {
      rejected = true;
    }
    assert(rejected);
  }
  assert(desktopTargets.linux.target === "x86_64-unknown-linux-gnu");
  assert(desktopTargets.macos.target === "aarch64-apple-darwin");
  assert(desktopTargets.windows.target === "x86_64-pc-windows-msvc");
});

Deno.test("release: validates public artifact URLs and immutable metadata", () => {
  const manifest = testManifest();
  assert(isReleaseManifest(manifest, "1.0.0"));
  const wrongVersion: unknown = { ...manifest, version: "2.0.0" };
  assert(!isReleaseManifest(wrongVersion, "1.0.0"));
  const invalidArtifact: unknown = {
    ...manifest,
    artifacts: {
      ...manifest.artifacts,
      linux: { ...manifest.artifacts.linux, objectKey: "https://evil.test/file" },
    },
  };
  assert(
    !isReleaseManifest(invalidArtifact),
  );
  const invalidUrl: unknown = {
    ...manifest,
    artifacts: {
      ...manifest.artifacts,
      linux: {
        ...manifest.artifacts.linux,
        downloadUrl: "https://downloads.example.com/releases/v2.0.0/Writasaurus.AppImage",
      },
    },
  };
  assert(!isReleaseManifest(invalidUrl));
  assert(!Object.hasOwn(manifest.artifacts.linux, "url"));
});

Deno.test("release: validates desktop package file signatures", () => {
  const appImage = new Uint8Array(11);
  appImage.set([0x41, 0x49], 8);
  validateArtifact("linux", appImage, "Writasaurus.AppImage");
  validateArtifact("macos", new Uint8Array([0x1f, 0x8b, 0x08]), "Writasaurus-macos.tar.gz");
  validateArtifact(
    "windows",
    new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]),
    "Writasaurus.msi",
  );
  let rejected = false;
  try {
    validateArtifact("windows", new Uint8Array([1, 2, 3]), "Writasaurus.msi");
  } catch {
    rejected = true;
  }
  assert(rejected, "Expected the Windows package signature to be validated");
});

Deno.test("release: prevents downgrading latest metadata", () => {
  const manifest = testManifest();
  ensureNotOlderThanLatest("1.0.0", null);
  let rejected = false;
  try {
    ensureNotOlderThanLatest("0.9.0", manifest);
  } catch {
    rejected = true;
  }
  assert(rejected);
});

Deno.test("release: signs R2 requests with configured credentials", async () => {
  const credentials: R2Credentials = {
    accountId: "a".repeat(32),
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    bucket: "releases",
  };
  const signed = await signR2Request(
    "HEAD",
    new URL("https://example.r2.cloudflarestorage.com/releases/latest.json"),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    new Headers(),
    credentials,
    new Date("2026-10-05T12:34:56.000Z"),
  );
  const authorization = signed.headers.get("authorization") ?? "";
  assert(authorization.startsWith("AWS4-HMAC-SHA256 Credential=test-access-key/20261005/auto/s3/"));
  assert(authorization.includes("SignedHeaders=host;x-amz-content-sha256;x-amz-date"));
  assert(/Signature=[a-f0-9]{64}$/.test(authorization));
});

Deno.test("release: parses R2 bucket listing sizes and continuation tokens", () => {
  const result = parseBucketListing(
    "<ListBucketResult><Contents><Key>a&amp;b</Key><Size>42</Size></Contents>" +
      "<IsTruncated>true</IsTruncated><NextContinuationToken>next&amp;page</NextContinuationToken>" +
      "</ListBucketResult>",
  );
  assert(result.sizes[0] === 42);
  assert(result.truncated && result.continuationToken === "next&page");
});

import {
  compareVersions,
  desktopTargets,
  parseArguments,
  projectPath,
} from "../scripts/release-desktop.ts";
import {
  ensureNotOlderThanLatest,
  fetchReleaseManifest,
  releaseVersion,
} from "../scripts/prepare-latest.ts";
import { parseBucketListing, type R2Credentials, signR2Request } from "../scripts/r2.ts";
import { isPublicHttpsUrl, isReleaseManifest, isSemanticVersion } from "../src/lib/releases.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("release: validates semantic versions and release command arguments", () => {
  assert(isSemanticVersion("1.2.3"));
  assert(isSemanticVersion("2.0.0-rc.1+build.12"));
  assert(!isSemanticVersion("v1.2.3"));
  assert(!isSemanticVersion("01.2.3"));
  assert(!isSemanticVersion("1.2"));

  const parsed = parseArguments(["1.2.3", "--dry-run"]);
  assert(parsed.version === "1.2.3");
  assert(parsed.dryRun);
});

Deno.test("release: compares stable and prerelease versions by SemVer precedence", () => {
  assert(compareVersions("1.0.0", "1.0.0-rc.1") > 0);
  assert(compareVersions("1.0.0-rc.2", "1.0.0-rc.10") < 0);
  assert(compareVersions("1.2.3+one", "1.2.3+two") === 0);
  assert(compareVersions("2.0.0", "1.99.99") > 0);
});

Deno.test("release: constrains configured artifact paths to desktop output", () => {
  assert(projectPath("./desktop/Writasaurus.AppImage") === "desktop/Writasaurus.AppImage");
  let rejected = false;
  try {
    projectPath("./public/Writasaurus.AppImage");
  } catch {
    rejected = true;
  }
  assert(rejected);
  rejected = false;
  try {
    projectPath("./desktop/../public/app");
  } catch {
    rejected = true;
  }
  assert(rejected);
});

Deno.test("release: maps each platform to a single cross-compilation target", () => {
  assert(desktopTargets.linux.target === "x86_64-unknown-linux-gnu");
  assert(desktopTargets.linux.icon);
  assert(desktopTargets.macos.target === "aarch64-apple-darwin");
  assert(!desktopTargets.macos.icon);
  assert(desktopTargets.windows.target === "x86_64-pc-windows-msvc");
  assert(!desktopTargets.windows.icon);
});

Deno.test("release: validates HTTPS release URLs and manifest shape", () => {
  assert(isPublicHttpsUrl("https://downloads.example.com"));
  assert(!isPublicHttpsUrl("http://downloads.example.com"));
  assert(!isPublicHttpsUrl("https://user:password@downloads.example.com"));

  const artifact = {
    label: "Linux",
    fileName: "Writasaurus.AppImage",
    url: "https://downloads.example.com/releases/v1.0.0/Writasaurus.AppImage",
    sizeBytes: 42,
    sha256: "a".repeat(64),
  };
  const macArtifact = {
    ...artifact,
    label: "macOS",
    fileName: "Writasaurus-macos.tar.gz",
    url: "https://downloads.example.com/releases/v1.0.0/Writasaurus-macos.tar.gz",
  };
  const windowsArtifact = {
    ...artifact,
    label: "Windows",
    fileName: "Writasaurus.msi",
    url: "https://downloads.example.com/releases/v1.0.0/Writasaurus.msi",
  };
  const release = {
    version: "1.0.0",
    releasedAt: "2026-10-05T12:00:00.000Z",
    releaseUrl: "https://downloads.example.com/releases/v1.0.0/release.json",
    artifacts: { linux: artifact, macos: macArtifact, windows: windowsArtifact },
  };
  assert(isReleaseManifest(release));
  assert(isReleaseManifest(release, "https://downloads.example.com"));
  assert(
    !isReleaseManifest({
      ...release,
      artifacts: { ...release.artifacts, linux: { ...artifact, url: "javascript:alert(1)" } },
    }),
  );
  assert(!isReleaseManifest(release, "https://other-downloads.example.com"));
});

Deno.test("release: signs R2 requests with the configured account credentials", async () => {
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

Deno.test("release: parses R2 bucket-list XML sizes and continuation tokens", () => {
  const firstPage = parseBucketListing(
    `<ListBucketResult>
      <Contents><Key>release-1&amp;2</Key><Size>42</Size></Contents>
      <Contents><Key>empty</Key><Size>0</Size></Contents>
      <IsTruncated>true</IsTruncated>
      <NextContinuationToken>next&amp;page</NextContinuationToken>
    </ListBucketResult>`,
  );
  assert(firstPage.sizes.length === 2);
  assert(firstPage.sizes[0] === 42 && firstPage.sizes[1] === 0);
  assert(firstPage.truncated);
  assert(firstPage.continuationToken === "next&page");

  const lastPage = parseBucketListing(
    "<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>",
  );
  assert(lastPage.sizes.length === 0);
  assert(!lastPage.truncated);
});

Deno.test("release: rejects malformed R2 bucket-list XML", () => {
  for (
    const xml of [
      "<Error><Message>Not a bucket listing</Message></Error>",
      "<ListBucketResult><Contents><Size>NaN</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>",
      "<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>",
      "<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Size>1</Size></ListBucketResult>",
    ]
  ) {
    let rejected = false;
    try {
      parseBucketListing(xml);
    } catch {
      rejected = true;
    }
    assert(rejected, `Expected malformed listing to be rejected: ${xml}`);
  }
});

Deno.test("release: validates latest.json repair versions", () => {
  assert(releaseVersion(["0.0.1"]) === "0.0.1");
  let rejected = false;
  try {
    releaseVersion(["01.0.0"]);
  } catch {
    rejected = true;
  }
  assert(rejected);
});

Deno.test("release: latest.json generation validates the published manifest and prevents downgrade", async () => {
  const base = "https://downloads.example.com";
  const artifact = {
    label: "Linux",
    fileName: "Writasaurus.AppImage",
    url: `${base}/releases/v1.0.0/Writasaurus.AppImage`,
    sizeBytes: 42,
    sha256: "a".repeat(64),
  };
  const manifest = {
    version: "1.0.0",
    releasedAt: "2026-10-05T12:00:00.000Z",
    releaseUrl: `${base}/releases/v1.0.0/release.json`,
    artifacts: {
      linux: artifact,
      macos: {
        ...artifact,
        label: "macOS",
        fileName: "Writasaurus-macos.tar.gz",
        url: `${base}/releases/v1.0.0/Writasaurus-macos.tar.gz`,
      },
      windows: {
        ...artifact,
        label: "Windows",
        fileName: "Writasaurus.msi",
        url: `${base}/releases/v1.0.0/Writasaurus.msi`,
      },
    },
  };

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (input) => {
      const url = String(input);
      if (url.endsWith("/releases/v1.0.0/release.json")) {
        return Promise.resolve(Response.json(manifest));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    };
    const loaded = await fetchReleaseManifest(base, "1.0.0");
    assert(JSON.stringify(loaded) === JSON.stringify(manifest));
    ensureNotOlderThanLatest(base, "1.0.0", null);
    let rejected = false;
    try {
      ensureNotOlderThanLatest(base, "0.9.0", manifest);
    } catch {
      rejected = true;
    }
    assert(rejected, "Expected latest.json generation to reject overwriting a newer version");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

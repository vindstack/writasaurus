import {
  assertNewReleaseVersion,
  compareVersions,
  desktopTargets,
  parseArguments,
  projectPath,
  publicBaseUrl,
  publicDownloadUrl,
  publish,
  validateArtifact,
} from "../../../scripts/release-desktop.ts";
import {
  parseBucketListing,
  putObject,
  type R2Credentials,
  signR2Request,
} from "../../../scripts/r2.ts";
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

Deno.test("release: public base URL rejects the private R2 API and preserves path prefixes", () => {
  const original = Deno.env.get("WRITASAURUS_R2_PUBLIC_BASE_URL");
  try {
    Deno.env.set("WRITASAURUS_R2_PUBLIC_BASE_URL", "https://account.r2.cloudflarestorage.com");
    let rejected = false;
    try {
      publicBaseUrl();
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("private R2 S3 API");
    }
    assert(rejected);
    Deno.env.set("WRITASAURUS_R2_PUBLIC_BASE_URL", "https://downloads.example.com/apps/");
    assert(
      publicDownloadUrl(publicBaseUrl(), "releases/v1.0.0/release.json") ===
        "https://downloads.example.com/apps/releases/v1.0.0/release.json",
    );
  } finally {
    if (original === undefined) Deno.env.delete("WRITASAURUS_R2_PUBLIC_BASE_URL");
    else Deno.env.set("WRITASAURUS_R2_PUBLIC_BASE_URL", original);
  }
});

Deno.test("release: checks the bucket version and ETag, including legacy manifests", async () => {
  const originalFetch = globalThis.fetch;
  const credentials: R2Credentials = {
    accountId: "a".repeat(32),
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    bucket: "releases",
  };
  try {
    globalThis.fetch = (input, init) => {
      assert(new URL(String(input)).pathname === "/releases/latest.json");
      assert(init?.method === "GET");
      assert(init?.redirect === "error");
      return Promise.resolve(Response.json({ version: "0.9.0" }, { headers: { etag: '"old"' } }));
    };
    assert(await assertNewReleaseVersion("1.0.0", credentials) === '"old"');
    globalThis.fetch = () => Promise.resolve(new Response(null, { status: 404 }));
    assert(await assertNewReleaseVersion("1.0.0", credentials) === null);
    for (
      const [response, expectedError] of [
        [new Response("Unavailable", { status: 503 }), "503"],
        [Response.json(testManifest()), "must be newer"],
        [Response.json({ version: "2.0.0" }), "must be newer"],
        [Response.json({ version: "invalid" }), "invalid version"],
        [Response.json({ version: "0.9.0" }), "missing an ETag"],
      ] as const
    ) {
      globalThis.fetch = () => Promise.resolve(response);
      let rejected = false;
      try {
        await assertNewReleaseVersion("1.0.0", credentials);
      } catch (error) {
        rejected = error instanceof Error && error.message.includes(expectedError);
      }
      assert(rejected, `Expected rejection containing ${expectedError}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("release: publishes the bucket root pointer last with conditional writes", async () => {
  const originalFetch = globalThis.fetch;
  const credentials: R2Credentials = {
    accountId: "a".repeat(32),
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    bucket: "releases",
  };
  const manifest = testManifest();
  try {
    for (const initial of [true, false]) {
      for (const failure of [undefined, "artifact", "conflict"] as const) {
        const puts: string[] = [];
        const stored = new Map<string, { size: number; sha256: string | null }>();
        globalThis.fetch = async (input, init) => {
          const url = new URL(String(input));
          const key = url.pathname.slice("/releases/".length);
          const headers = new Headers(init?.headers);
          assert(headers.get("accept-encoding") === "identity");
          if (init?.method === "GET" && key === "latest.json") {
            return initial
              ? new Response(null, { status: 404 })
              : Response.json({ version: "0.9.0" }, { headers: { etag: '"previous"' } });
          }
          if (init?.method === "GET" && url.searchParams.has("list-type")) {
            return new Response(
              "<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>",
            );
          }
          if (init?.method === "PUT") {
            puts.push(key);
            if (failure === "artifact" && key === manifest.checksums.objectKey) {
              return new Response(null, { status: 500 });
            }
            if (key === "latest.json") {
              assert(puts.at(-2) === "releases/v1.0.0/release.json");
              assert(headers.get("cache-control") === "no-cache");
              assert(headers.get("if-none-match") === (initial ? "*" : null));
              assert(headers.get("if-match") === (initial ? null : '"previous"'));
              assert(init.body instanceof Blob);
              assert(isReleaseManifest(JSON.parse(await init.body.text()), "1.0.0"));
              if (failure === "conflict") return new Response(null, { status: 412 });
            }
            assert(init?.body instanceof Blob);
            stored.set(key, {
              size: init.body.size,
              sha256: headers.get("x-amz-meta-sha256"),
            });
            return new Response(null);
          }
          if (init?.method === "HEAD") {
            const object = stored.get(key);
            assert(object);
            return new Response(null, {
              headers: {
                "content-length": String(object.size),
                ...(object.sha256 ? { "x-amz-meta-sha256": object.sha256 } : {}),
              },
            });
          }
          throw new Error(`Unexpected R2 request: ${init?.method} ${url}`);
        };
        let rejected = false;
        try {
          await publish(manifest, [], credentials);
        } catch (error) {
          rejected = error instanceof Error &&
            (failure === "artifact"
              ? error.message.includes("500")
              : error.message.includes(initial ? "immutable" : "newer release"));
          assert(rejected, `Unexpected publishing error: ${error}`);
        }
        assert(rejected === (failure !== undefined));
        assert(puts.includes("latest.json") === (failure !== "artifact"));
        if (!failure) assert(puts.at(-1) === "latest.json");
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
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

Deno.test("release: upload verification rejects absent and invalid object sizes", async () => {
  const originalFetch = globalThis.fetch;
  const credentials: R2Credentials = {
    accountId: "a".repeat(32),
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    bucket: "releases",
  };
  try {
    for (const length of [null, "invalid", "0", "3"]) {
      globalThis.fetch = (_input, init) => {
        assert(new Headers(init?.headers).get("accept-encoding") === "identity");
        return Promise.resolve(
          new Response(null, {
            headers: init?.method === "HEAD" && length !== null ? { "content-length": length } : {},
          }),
        );
      };
      let rejected = false;
      try {
        await putObject(credentials, "test.txt", new Uint8Array([1, 2, 3]), {
          contentType: "text/plain",
        });
      } catch (error) {
        rejected = error instanceof Error && error.message.includes("upload verification failed");
        assert(rejected, `Unexpected upload error: ${error}`);
      }
      assert(rejected === (length !== "3"));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
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

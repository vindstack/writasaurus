import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import {
  assertNewReleaseVersion,
  assertNativeBuildPlatform,
  compareVersions,
  desktopTargets,
  desktopBuildCommands,
  buildDesktopTargets,
  main,
  parseArguments,
  projectPath,
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

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
}));

const nativePlatform =
  process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

function mockPackaging(exitCode = 0): void {
  vi.mocked(spawn).mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", exitCode, null));
    return child as ReturnType<typeof spawn>;
  });
}

function mockArtifactFiles(): void {
  const appImage = Buffer.alloc(11);
  appImage.set([0x41, 0x49], 8);
  const bytes = (path: unknown): Buffer<ArrayBuffer> => {
    const name = String(path);
    if (name.endsWith(".AppImage")) return appImage;
    if (name.endsWith(".tar.gz")) return Buffer.from([0x1f, 0x8b, 0x08]);
    return Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]);
  };
  vi.mocked(readFile).mockImplementation(async (path) => bytes(path));
  vi.mocked(stat).mockImplementation(
    async (path) =>
      ({
        isFile: () => true,
        size: bytes(path).byteLength,
      }) as Awaited<ReturnType<typeof stat>>,
  );
}

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
        downloadUrl: "/api/releases/linux",
        sizeBytes: 42,
        sha256: "a".repeat(64),
      },
      macos: {
        label: "macOS",
        fileName: "Writasaurus-macos.tar.gz",
        objectKey: `${prefix}Writasaurus-macos.tar.gz`,
        downloadUrl: "/api/releases/macos",
        sizeBytes: 42,
        sha256: "a".repeat(64),
      },
      windows: {
        label: "Windows",
        fileName: "Writasaurus.msi",
        objectKey: `${prefix}Writasaurus.msi`,
        downloadUrl: "/api/releases/windows",
        sizeBytes: 42,
        sha256: "a".repeat(64),
      },
    },
    checksums: {
      fileName: "SHA256SUMS.txt",
      objectKey: `${prefix}SHA256SUMS.txt`,
      downloadUrl: "/api/releases/checksums",
      sha256: "b".repeat(64),
    },
  };
}

function platformManifest(
  version: string,
  platform: "linux" | "macos" | "windows",
): ReleaseManifest {
  const template = testManifest().artifacts[platform]!;
  return {
    version,
    releasedAt: "2026-10-05T12:00:00.000Z",
    artifacts: {
      [platform]: {
        ...template,
        objectKey: `releases/v${version}/${template.fileName}`,
      },
    },
    checksums: {
      fileName: "SHA256SUMS.txt",
      objectKey: `releases/v${version}/${platform}-SHA256SUMS.txt`,
      downloadUrl: "/api/releases/checksums",
      sha256: "b".repeat(64),
    },
  };
}

test("release: validates versions and command arguments", () => {
  assert(isSemanticVersion("1.2.3"));
  assert(isSemanticVersion("2.0.0-rc.1+build.12"));
  assert(!isSemanticVersion("v1.2.3"));
  assert(!isSemanticVersion("01.2.3"));
  const parsed = parseArguments(["1.2.3", "--build-platform", "linux", "--dry-run"]);
  assert(parsed.version === "1.2.3" && parsed.dryRun && parsed.buildPlatform === "linux");
  expect(
    parseArguments(["1.2.3", "--build-platform", "linux", "--skip-build", "--dry-run"]),
  ).toMatchObject({
    version: "1.2.3",
    dryRun: true,
    skipBuild: true,
  });
  expect(parseArguments(["1.2.3", "--build-platform", "macos"])).toMatchObject({
    buildPlatform: "macos",
    skipBuild: false,
  });
  for (const args of [
    ["1.2.3", "--build-platform"],
    ["1.2.3", "--build-platform", "unsupported"],
    ["1.2.3", "--build-platform", "linux", "--build-platform", "macos"],
    ["1.2.3", "--skip-build"],
    ["1.2.3", "--unknown"],
  ])
    expect(() => parseArguments(args)).toThrow("Invalid");
});

test("release: compares stable and prerelease versions", () => {
  assert(compareVersions("1.0.0", "1.0.0-rc.1") > 0);
  assert(compareVersions("1.0.0-rc.2", "1.0.0-rc.10") < 0);
  assert(compareVersions("1.2.3+one", "1.2.3+two") === 0);
});

test("release: constrains artifact paths and maps Electron packaging targets", () => {
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
  assert(desktopTargets.linux.target === "AppImage" && desktopTargets.linux.arch === "--x64");
  assert(desktopTargets.macos.target === "tar.gz" && desktopTargets.macos.arch === "--arm64");
  assert(desktopTargets.windows.target === "msi" && desktopTargets.windows.arch === "--x64");
});

test("release: builds Electron entry points before packaging every platform without publishing", () => {
  const commands = desktopBuildCommands("1.2.3");
  const prefixLength = process.env.npm_execpath ? 1 : 0;
  assert(commands.length === 4);
  assert(commands[0].args.slice(prefixLength).join(" ") === "--filter @writasaurus/desktop build");
  for (const [index, platform] of (["linux", "macos", "windows"] as const).entries()) {
    const { command, args: fullArgs } = commands[index + 1];
    const args = fullArgs.slice(prefixLength);
    const target = desktopTargets[platform];
    assert(command === (process.env.npm_execpath ? process.execPath : "pnpm"));
    assert(args.slice(0, 4).join(" ") === "--filter @writasaurus/desktop exec electron-builder");
    assert(
      args.includes(target.flag) && args.includes(target.target) && args.includes(target.arch),
    );
    assert(args[args.indexOf("--publish") + 1] === "never");
    assert(args.includes("--config.extraMetadata.version=1.2.3"));
    assert(
      args.some(
        (arg) =>
          arg.startsWith("--config.directories.output=") &&
          arg.replaceAll("\\", "/").endsWith(`/desktop/${platform}`),
      ),
    );
    assert(args.some((arg) => arg.endsWith(`.artifactName=${target.fileName}`)));
    assert(!args.some((arg) => arg.includes("deno")));
  }
  let rejected = false;
  try {
    desktopBuildCommands("v1.2.3");
  } catch {
    rejected = true;
  }
  assert(rejected);
});

test("release: executes native packaging sequentially and clears only its stale output", async () => {
  mockPackaging();
  const paths = await buildDesktopTargets("1.2.3", nativePlatform);
  expect(spawn).toHaveBeenCalledTimes(2);
  expect(rm).toHaveBeenCalledTimes(1);
  expect(rm).toHaveBeenCalledWith(expect.any(String), { force: true });
  expect(String(vi.mocked(rm).mock.calls[0][0]).replaceAll("\\", "/")).toContain(
    `desktop/${nativePlatform}/${desktopTargets[nativePlatform].fileName}`,
  );
  for (const [index, planned] of desktopBuildCommands("1.2.3", nativePlatform).entries()) {
    expect(spawn).toHaveBeenNthCalledWith(index + 1, planned.command, planned.args, {
      cwd: expect.any(String),
      stdio: "inherit",
    });
  }
  expect(paths).toEqual({
    linux: "desktop/linux/Writasaurus.AppImage",
    macos: "desktop/macos/Writasaurus-macos.tar.gz",
    windows: "desktop/windows/Writasaurus.msi",
  });
});

test("release: stops packaging after a failed build", async () => {
  mockPackaging(1);
  await expect(buildDesktopTargets("1.2.3", nativePlatform)).rejects.toThrow("exit code 1");
  expect(spawn).toHaveBeenCalledTimes(1);
});

test("release: refuses implicit cross-platform builds before deleting files or spawning", async () => {
  await expect(buildDesktopTargets("1.2.3")).rejects.toThrow("--build-platform");
  expect(rm).not.toHaveBeenCalled();
  expect(spawn).not.toHaveBeenCalled();
  expect(() => assertNativeBuildPlatform("macos", "linux")).toThrow("native darwin runner");
  expect(() => assertNativeBuildPlatform("linux", "win32")).toThrow("native linux runner");
  expect(() => assertNativeBuildPlatform("windows", "darwin")).toThrow("native win32 runner");
  assertNativeBuildPlatform("linux", "linux");
  assertNativeBuildPlatform("macos", "darwin");
  assertNativeBuildPlatform("windows", "win32");
});

test("release: main fails fast without a selected platform", async () => {
  const originalArgs = process.argv;
  process.argv = [process.execPath, "scripts/release-desktop.ts", "1.2.3"];
  try {
    await expect(main()).rejects.toThrow("Invalid release arguments");
    expect(rm).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();
  } finally {
    process.argv = originalArgs;
  }
});

test("release: prebuilt dry run validates every package without credentials, builds, or R2", async () => {
  const originalArgs = process.argv;
  const originalFetch = globalThis.fetch;
  const request = vi.fn<typeof fetch>();
  globalThis.fetch = request;
  process.argv = [
    process.execPath,
    "scripts/release-desktop.ts",
    "1.2.3",
    "--build-platform",
    "linux",
    "--skip-build",
    "--dry-run",
  ];
  for (const name of [
    "WRITASAURUS_R2_ACCOUNT_ID",
    "WRITASAURUS_R2_ACCESS_KEY_ID",
    "WRITASAURUS_R2_SECRET_ACCESS_KEY",
    "WRITASAURUS_R2_BUCKET",
  ])
    vi.stubEnv(name, "");
  mockPackaging();
  mockArtifactFiles();
  try {
    await main();
    expect(spawn).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
    expect(stat).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    expect(mkdir).toHaveBeenCalledWith(expect.any(String), {
      recursive: true,
    });
    expect(String(vi.mocked(mkdir).mock.calls[0][0]).replaceAll("\\", "/")).toContain(
      "release-dry-run/v1.2.3",
    );
    expect(writeFile).toHaveBeenCalledTimes(2);
    const metadata = vi.mocked(writeFile).mock.calls[0][1];
    assert(typeof metadata === "string");
    assert(isReleaseManifest(JSON.parse(metadata), "1.2.3"));
  } finally {
    process.argv = originalArgs;
    globalThis.fetch = originalFetch;
  }
});

test.each(["missing", "empty", "invalid"] as const)(
  "release: prebuilt dry run rejects %s packages without rebuilding or writing metadata",
  async (failure) => {
    const originalArgs = process.argv;
    process.argv = [
      process.execPath,
      "scripts/release-desktop.ts",
      "1.2.3",
      "--build-platform",
      "linux",
      "--skip-build",
      "--dry-run",
    ];
    mockArtifactFiles();
    if (failure === "missing") {
      vi.mocked(stat).mockRejectedValueOnce(
        Object.assign(new Error("missing"), { code: "ENOENT" }),
      );
    } else if (failure === "empty") {
      vi.mocked(stat).mockResolvedValueOnce({
        isFile: () => true,
        size: 0,
      } as Awaited<ReturnType<typeof stat>>);
    } else vi.mocked(readFile).mockResolvedValueOnce(Buffer.from([1, 2, 3]));
    try {
      await expect(main()).rejects.toThrow(
        failure === "missing" ? "not produced" : failure === "empty" ? "non-empty" : "signature",
      );
      expect(spawn).not.toHaveBeenCalled();
      expect(rm).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    } finally {
      process.argv = originalArgs;
    }
  },
);

test("release: native build mode validates one package without release credentials or publishing", async () => {
  const originalArgs = process.argv;
  process.argv = [
    process.execPath,
    "scripts/release-desktop.ts",
    "1.2.3",
    "--build-platform",
    nativePlatform,
    "--dry-run",
  ];
  mockPackaging();
  mockArtifactFiles();
  try {
    await main();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(stat).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledTimes(2);
  } finally {
    process.argv = originalArgs;
  }
});

test("release: prebuilt publishing updates one platform and the latest pointer last", async () => {
  const originalArgs = process.argv;
  const originalFetch = globalThis.fetch;
  process.argv = [
    process.execPath,
    "scripts/release-desktop.ts",
    "1.2.3",
    "--build-platform",
    "linux",
    "--skip-build",
  ];
  vi.stubEnv("WRITASAURUS_R2_ACCOUNT_ID", "a".repeat(32));
  vi.stubEnv("WRITASAURUS_R2_ACCESS_KEY_ID", "test-access-key");
  vi.stubEnv("WRITASAURUS_R2_SECRET_ACCESS_KEY", "test-secret-key");
  vi.stubEnv("WRITASAURUS_R2_BUCKET", "releases");
  mockArtifactFiles();
  const puts: string[] = [];
  const stored = new Map<string, { size: number; sha256: string | null }>();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const key = url.pathname.slice("/releases/".length);
    if (init?.method === "GET" && key === "latest.json") {
      return new Response(null, { status: 404 });
    }
    if (init?.method === "GET" && url.searchParams.has("list-type")) {
      return new Response("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>");
    }
    if (init?.method === "PUT") {
      assert(init.body instanceof Blob);
      const headers = new Headers(init.headers);
      assert(headers.get("if-none-match") === "*");
      puts.push(key);
      stored.set(key, { size: init.body.size, sha256: headers.get("x-amz-meta-sha256") });
      return new Response(null);
    }
    if (init?.method === "HEAD") {
      const object = stored.get(key);
      return object
        ? new Response(null, {
            headers: {
              "content-length": String(object.size),
              ...(object.sha256 ? { "x-amz-meta-sha256": object.sha256 } : {}),
            },
          })
        : new Response(null, { status: 404 });
    }
    throw new Error(`Unexpected R2 request: ${init?.method} ${url}`);
  };
  try {
    await main();
    expect(puts).toEqual([
      "releases/v1.2.3/Writasaurus.AppImage",
      "releases/v1.2.3/linux-SHA256SUMS.txt",
      "releases/v1.2.3/linux-release.json",
      "latest.json",
    ]);
    expect(spawn).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  } finally {
    process.argv = originalArgs;
    globalThis.fetch = originalFetch;
  }
});

test("release: validates Worker download routes and immutable metadata", () => {
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
  assert(!isReleaseManifest(invalidArtifact));
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
  assert(manifest.artifacts.linux);
  assert(!Object.hasOwn(manifest.artifacts.linux, "url"));
  const legacyManifest = {
    ...manifest,
    artifacts: {
      ...manifest.artifacts,
      linux: {
        ...manifest.artifacts.linux,
        downloadUrl: "https://downloads.example.com/releases/v1.0.0/Writasaurus.AppImage",
      },
    },
  };
  assert(isReleaseManifest(legacyManifest));
  const mixedVersions: unknown = {
    ...manifest,
    artifacts: {
      linux: {
        ...manifest.artifacts.linux,
        objectKey: "releases/v1.1.0/Writasaurus.AppImage",
      },
      macos: {
        ...manifest.artifacts.macos,
        objectKey: "releases/v0.9.0/Writasaurus-macos.tar.gz",
      },
    },
    checksums: {
      ...manifest.checksums,
      objectKey: "releases/v1.1.0/linux-SHA256SUMS.txt",
    },
  };
  assert(isReleaseManifest(mixedVersions));
  const emptyPlatform: unknown = { ...manifest, artifacts: { linux: undefined } };
  assert(!isReleaseManifest(emptyPlatform));
});

test("release: validates desktop package file signatures", () => {
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

test("release: compares versions per platform and reads legacy latest manifests", async () => {
  const originalFetch = globalThis.fetch;
  const credentials: R2Credentials = {
    accountId: "a".repeat(32),
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    bucket: "releases",
  };
  try {
    const linuxPrevious = platformManifest("0.9.0", "linux");
    globalThis.fetch = (input, init) => {
      assert(new URL(String(input)).pathname === "/releases/latest.json");
      assert(init?.method === "GET");
      assert(init?.redirect === "error");
      return Promise.resolve(Response.json(linuxPrevious, { headers: { etag: '"old"' } }));
    };
    const latest = await assertNewReleaseVersion("1.0.0", "linux", credentials);
    assert(latest.etag === '"old"' && latest.manifest?.version === "0.9.0");
    const otherPlatform = await assertNewReleaseVersion("0.1.0", "macos", credentials);
    assert(otherPlatform.etag === '"old"');
    globalThis.fetch = () => Promise.resolve(new Response(null, { status: 404 }));
    const firstRelease = await assertNewReleaseVersion("1.0.0", "linux", credentials);
    assert(firstRelease.etag === null && firstRelease.manifest === null);
    for (const [response, expectedError] of [
      [new Response("Unavailable", { status: 503 }), "503"],
      [Response.json(platformManifest("0.9.0", "linux")), "must be newer"],
      [Response.json({ version: "2.0.0" }), "invalid release metadata"],
      [Response.json(platformManifest("0.8.0", "linux")), "missing an ETag"],
    ] as const) {
      globalThis.fetch = () => Promise.resolve(response);
      let rejected = false;
      try {
        await assertNewReleaseVersion("0.9.0", "linux", credentials);
      } catch (error) {
        rejected = error instanceof Error && error.message.includes(expectedError);
      }
      assert(rejected, `Expected rejection containing ${expectedError}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("release: publishes the bucket root pointer last with conditional writes", async () => {
  const originalFetch = globalThis.fetch;
  const credentials: R2Credentials = {
    accountId: "a".repeat(32),
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    bucket: "releases",
  };
  const packageBytes = Buffer.alloc(11);
  packageBytes.set([0x41, 0x49], 8);
  vi.mocked(readFile).mockResolvedValue(packageBytes);
  const manifest = platformManifest("1.1.0", "linux");
  const releaseArtifact = {
    ...manifest.artifacts.linux!,
    sizeBytes: packageBytes.byteLength,
    sha256: createHash("sha256").update(packageBytes).digest("hex"),
  };
  manifest.artifacts.linux = releaseArtifact;
  const artifact = {
    platform: "linux" as const,
    ...releaseArtifact,
    path: "desktop/linux/Writasaurus.AppImage",
  };
  const previousManifest = platformManifest("2.0.0", "macos");
  previousManifest.artifacts.linux = platformManifest("1.0.0", "linux").artifacts.linux;
  mockArtifactFiles();
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
              : Response.json(previousManifest, { headers: { etag: '"previous"' } });
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
              assert(puts.at(-2) === "releases/v1.1.0/linux-release.json");
              assert(headers.get("cache-control") === "no-cache");
              assert(headers.get("if-none-match") === (initial ? "*" : null));
              assert(headers.get("if-match") === (initial ? null : '"previous"'));
              assert(init.body instanceof Blob);
              const latestManifest: unknown = JSON.parse(await init.body.text());
              assert(isReleaseManifest(latestManifest, "1.1.0"));
              assert(
                isReleaseManifest(latestManifest) &&
                  latestManifest.artifacts.linux?.objectKey ===
                    "releases/v1.1.0/Writasaurus.AppImage",
              );
              if (!initial) {
                assert(
                  isReleaseManifest(latestManifest) &&
                    latestManifest.artifacts.macos?.objectKey ===
                      "releases/v2.0.0/Writasaurus-macos.tar.gz",
                );
              }
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
          await publish(manifest, [artifact], credentials);
        } catch (error) {
          rejected =
            error instanceof Error &&
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

test("release: signs R2 requests with configured credentials", async () => {
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

test("release: upload verification rejects absent and invalid object sizes", async () => {
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

test("release: parses R2 bucket listing sizes and continuation tokens", () => {
  const result = parseBucketListing(
    "<ListBucketResult><Contents><Key>a&amp;b</Key><Size>42</Size></Contents>" +
      "<IsTruncated>true</IsTruncated><NextContinuationToken>next&amp;page</NextContinuationToken>" +
      "</ListBucketResult>",
  );
  assert(result.sizes[0] === 42);
  assert(result.truncated && result.continuationToken === "next&page");
});

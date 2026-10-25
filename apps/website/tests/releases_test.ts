import { test } from "vitest";
import { setTestReleaseObjects } from "../src/lib/cloudflare-env.test.ts";
import { request } from "./helpers.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

test("private R2 release endpoint streams fixed artifacts with byte-range support", async () => {
  const prefix = "releases/v1.0.0/";
  const versions: Record<string, string> = { linux: "1.0.0", macos: "0.9.0", windows: "0.8.0" };
  const artifactBytes = new TextEncoder().encode("0123456789");
  const platforms = {
    linux: ["Writasaurus.AppImage", "application/vnd.appimage"],
    macos: ["Writasaurus-macos.tar.gz", "application/gzip"],
    windows: ["Writasaurus.msi", "application/x-msi"],
  } as const;
  const manifest = {
    version: "1.0.0",
    releasedAt: "2026-10-25T00:00:00.000Z",
    artifacts: Object.fromEntries(
      Object.entries(platforms).map(([platform, [fileName]]) => [
        platform,
        {
          label: platform,
          fileName,
          objectKey: `releases/v${versions[platform]}/${fileName}`,
          downloadUrl: `/api/releases/${platform}`,
          sizeBytes: artifactBytes.length,
          sha256: "a".repeat(64),
        },
      ]),
    ),
    checksums: {
      fileName: "SHA256SUMS.txt",
      objectKey: `${prefix}SHA256SUMS.txt`,
      downloadUrl: "/api/releases/checksums",
      sha256: "b".repeat(64),
    },
  };
  setTestReleaseObjects({
    "latest.json": new TextEncoder().encode(JSON.stringify(manifest)),
    [`releases/v1.0.0/Writasaurus.AppImage`]: artifactBytes,
    [`releases/v0.9.0/Writasaurus-macos.tar.gz`]: artifactBytes,
    [`releases/v0.8.0/Writasaurus.msi`]: artifactBytes,
    [`${prefix}SHA256SUMS.txt`]: artifactBytes,
  });

  try {
    const full = await request("/api/releases/linux");
    assert(full.status === 200);
    assert(
      full.headers.get("content-disposition") === 'attachment; filename="Writasaurus.AppImage"',
    );
    assert(full.headers.get("accept-ranges") === "bytes");
    assert(full.headers.get("content-type") === "application/vnd.appimage");
    assert((await full.text()) === "0123456789");

    const head = await request("/api/releases/linux", { method: "HEAD" });
    assert(head.status === 200);
    assert(head.headers.get("content-length") === "10");
    assert((await head.text()) === "");

    const checksumFile = await request("/api/releases/checksums");
    assert(checksumFile.status === 200);
    assert((await checksumFile.text()) === "0123456789");

    const partial = await request("/api/releases/linux", {
      headers: { range: "bytes=2-5" },
    });
    assert(partial.status === 206);
    assert(partial.headers.get("content-range") === "bytes 2-5/10");
    assert((await partial.text()) === "2345");

    const suffix = await request("/api/releases/linux", {
      headers: { range: "bytes=-3" },
    });
    assert(suffix.status === 206);
    assert((await suffix.text()) === "789");

    const invalid = await request("/api/releases/linux", {
      headers: { range: "bytes=10-" },
    });
    assert(invalid.status === 416);
    assert(invalid.headers.get("content-range") === "bytes */10");

    const unknown = await request("/api/releases/latest.json");
    assert(unknown.status === 404);

    const linuxOnlyManifest = {
      ...manifest,
      artifacts: { linux: manifest.artifacts.linux },
    };
    setTestReleaseObjects({
      "latest.json": new TextEncoder().encode(JSON.stringify(linuxOnlyManifest)),
      [`releases/v1.0.0/Writasaurus.AppImage`]: artifactBytes,
      [`${prefix}SHA256SUMS.txt`]: artifactBytes,
    });
    const missingPlatform = await request("/api/releases/macos");
    assert(missingPlatform.status === 404);
  } finally {
    setTestReleaseObjects(undefined);
  }
});

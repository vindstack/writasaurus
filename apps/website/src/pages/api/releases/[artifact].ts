import { env } from "cloudflare:workers";
import { currentRelease } from "../../../lib/releases.ts";

export const prerender = false;

type ByteRange = { offset: number; length: number; header: string };

function requestedRange(value: string | null, size: number): ByteRange | "invalid" | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return undefined;

  let offset: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) return "invalid";
    offset = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    offset = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(end) ||
      offset > end ||
      offset >= size
    ) {
      return "invalid";
    }
    end = Math.min(end, size - 1);
  }
  return { offset, length: end - offset + 1, header: `bytes ${offset}-${end}/${size}` };
}

async function serveArtifact(context: {
  request: Request;
  params: Record<string, string | undefined>;
}): Promise<Response> {
  const artifactName = context.params.artifact;
  if (
    artifactName !== "linux" &&
    artifactName !== "macos" &&
    artifactName !== "windows" &&
    artifactName !== "checksums"
  ) {
    return new Response("Not found", { status: 404 });
  }

  const release = await currentRelease();
  const artifact =
    artifactName === "checksums" ? release.checksums : release.artifacts[artifactName];
  if (!artifact)
    return new Response("This platform's release is not available yet.", { status: 404 });
  const size =
    "sizeBytes" in artifact && artifact.sizeBytes !== undefined
      ? artifact.sizeBytes
      : (await env.R2_DOWNLOAD_DESKTOP_BUCKET.head(artifact.objectKey))?.size;
  if (size === undefined) return new Response("Release file not found", { status: 404 });
  const range = requestedRange(context.request.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes" },
    });
  }

  const object = await env.R2_DOWNLOAD_DESKTOP_BUCKET.get(
    artifact.objectKey,
    range ? { range: { offset: range.offset, length: range.length } } : undefined,
  );
  if (!object) return new Response("Release file not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set(
    "content-type",
    artifactName === "checksums"
      ? "text/plain; charset=utf-8"
      : artifactName === "linux"
        ? "application/vnd.appimage"
        : artifactName === "macos"
          ? "application/gzip"
          : "application/x-msi",
  );
  headers.set("content-disposition", `attachment; filename="${artifact.fileName}"`);
  headers.set("content-length", String(range?.length ?? object.size));
  headers.set("accept-ranges", "bytes");
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  if (range) headers.set("content-range", range.header);

  if (context.request.method === "HEAD") await object.body.cancel();
  return new Response(context.request.method === "HEAD" ? null : object.body, {
    status: range ? 206 : 200,
    headers,
  });
}

export async function GET(context: {
  request: Request;
  params: Record<string, string | undefined>;
}): Promise<Response> {
  return await serveArtifact(context);
}

export async function HEAD(context: {
  request: Request;
  params: Record<string, string | undefined>;
}): Promise<Response> {
  return await serveArtifact(context);
}

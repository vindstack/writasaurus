import type { R2Bucket } from "./d1.ts";

type TestBindings = { R2_DOWNLOAD_DESKTOP_BUCKET?: R2Bucket };
const testGlobal = globalThis as typeof globalThis & { __writasaurusCloudflareEnv?: TestBindings };
export const env = (testGlobal.__writasaurusCloudflareEnv ??= {});

export function setTestReleaseObjects(objects: Record<string, Uint8Array> | undefined): void {
  if (!objects) {
    delete env.R2_DOWNLOAD_DESKTOP_BUCKET;
    return;
  }
  env.R2_DOWNLOAD_DESKTOP_BUCKET = {
    async head(key) {
      const source = objects[key];
      return source ? { size: source.byteLength } : null;
    },
    async get(key, options) {
      const source = objects[key];
      if (!source) return null;
      let bytes = source;
      if (options?.range && "offset" in options.range) {
        bytes = source.slice(options.range.offset, options.range.offset + options.range.length);
      } else if (options?.range && "suffix" in options.range) {
        bytes = source.slice(-options.range.suffix);
      }
      return {
        body: new Blob([Uint8Array.from(bytes)]).stream(),
        size: source.byteLength,
        httpEtag: '"test-release-etag"',
        writeHttpMetadata(headers) {
          headers.set("content-type", "application/octet-stream");
        },
      };
    },
  };
}

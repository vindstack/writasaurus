export interface R2Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

interface SignedRequest {
  url: URL;
  headers: Headers;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes)));
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)),
  );
}

function asBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function canonicalQuery(url: URL): string {
  const encode = (value: string) =>
    encodeURIComponent(value).replaceAll(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  return [...url.searchParams.entries()]
    .map(([key, value]) => [encode(key), encode(value)] as const)
    .sort(([keyA, valueA], [keyB, valueB]) =>
      keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB)
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export async function signR2Request(
  method: string,
  url: URL,
  payloadHash: string,
  headers: Headers,
  credentials: R2Credentials,
  now: Date,
): Promise<SignedRequest> {
  const date = now.toISOString().replaceAll(/[:-]|\.\d{3}/g, "");
  const shortDate = date.slice(0, 8);
  headers.set("x-amz-date", date);
  headers.set("x-amz-content-sha256", payloadHash);

  const canonicalHeaders = new Map<string, string>([
    ["host", url.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", date],
  ]);
  for (
    const name of [
      "content-disposition",
      "content-type",
      "cache-control",
      "if-match",
      "if-none-match",
      "x-amz-meta-sha256",
    ]
  ) {
    const value = headers.get(name);
    if (value !== null) canonicalHeaders.set(name, value.trim().replaceAll(/\s+/g, " "));
  }

  const signedHeaders = [...canonicalHeaders.keys()].sort().join(";");
  const canonicalHeaderString = [...canonicalHeaders.keys()].sort()
    .map((name) => `${name}:${canonicalHeaders.get(name)}\n`).join("");
  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery(url),
    canonicalHeaderString,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${shortDate}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    date,
    scope,
    await sha256(asBytes(canonicalRequest)),
  ].join("\n");

  const dateKey = await hmac(asBytes(`AWS4${credentials.secretAccessKey}`), shortDate);
  const regionKey = await hmac(dateKey, "auto");
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = toHex(
    await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey(
        "raw",
        toArrayBuffer(signingKey),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      ),
      toArrayBuffer(asBytes(stringToSign)),
    ),
  );

  headers.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );
  return { url, headers };
}

export function r2ObjectUrl(credentials: R2Credentials, key: string): URL {
  const path = [credentials.bucket, ...key.split("/")].map(encodeURIComponent).join("/");
  return new URL(`https://${credentials.accountId}.r2.cloudflarestorage.com/${path}`);
}

export async function requestR2(
  method: string,
  key: string,
  credentials: R2Credentials,
  options: {
    body?: Uint8Array;
    headers?: HeadersInit;
    now?: Date;
    query?: URLSearchParams;
  } = {},
): Promise<Response> {
  const body = options.body ?? new Uint8Array();
  const payloadHash = await sha256(body);
  const headers = new Headers(options.headers);
  const url = r2ObjectUrl(credentials, key);
  if (options.query) url.search = options.query.toString();
  const signed = await signR2Request(
    method,
    url,
    payloadHash,
    headers,
    credentials,
    options.now ?? new Date(),
  );
  return await fetch(signed.url, {
    method,
    headers: signed.headers,
    ...(method === "GET" || method === "HEAD" ? {} : { body: new Blob([toArrayBuffer(body)]) }),
    redirect: "error",
  });
}

export async function objectExists(credentials: R2Credentials, key: string): Promise<boolean> {
  const response = await requestR2("HEAD", key, credentials);
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`R2 HEAD ${key} failed (${response.status} ${response.statusText}).`);
  }
  return true;
}

export async function readObject(
  credentials: R2Credentials,
  key: string,
): Promise<Uint8Array | null> {
  const response = await requestR2("GET", key, credentials);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 GET ${key} failed (${response.status} ${response.statusText}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function putObject(
  credentials: R2Credentials,
  key: string,
  body: Uint8Array,
  options: {
    contentType: string;
    sha256?: string;
    immutable?: boolean;
    ifMatch?: string;
    cacheControl?: string;
  },
): Promise<void> {
  const headers = new Headers({ "content-type": options.contentType });
  headers.set("content-disposition", `attachment; filename="${key.split("/").pop()}"`);
  if (options.cacheControl) headers.set("cache-control", options.cacheControl);
  if (options.sha256) headers.set("x-amz-meta-sha256", options.sha256);
  if (options.immutable) headers.set("if-none-match", "*");
  if (options.ifMatch) headers.set("if-match", options.ifMatch);
  const response = await requestR2("PUT", key, credentials, { body, headers });
  if (response.status === 412 && options.immutable) {
    throw new Error(`Refusing to overwrite immutable R2 object ${key}.`);
  }
  if (response.status === 412 && options.ifMatch) {
    throw new Error(
      "A newer release changed latest.json during upload; latest.json was not changed.",
    );
  }
  if (!response.ok) {
    throw new Error(`R2 PUT ${key} failed (${response.status} ${response.statusText}).`);
  }

  const verification = await requestR2("HEAD", key, credentials);
  if (!verification.ok) {
    throw new Error(`R2 upload verification failed for ${key} (${verification.status}).`);
  }
  const contentLength = Number(verification.headers.get("content-length"));
  if (contentLength !== body.byteLength) {
    throw new Error(
      `R2 upload verification failed for ${key}: expected ${body.byteLength} bytes, got ${contentLength}.`,
    );
  }
  if (
    options.sha256 && verification.headers.get("x-amz-meta-sha256") !== options.sha256
  ) {
    throw new Error(`R2 upload verification failed: checksum metadata mismatch for ${key}.`);
  }
}

function decodeXmlText(value: string): string {
  if (value.replace(/&[^;]*;/g, "").includes("&")) {
    throw new Error("R2 returned invalid XML text.");
  }
  const decoded = value.replace(/&([^;]*);/g, (_entity, name: string) => {
    switch (name) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default: {
        const codePoint = /^#x[0-9a-f]+$/i.test(name)
          ? Number.parseInt(name.slice(2), 16)
          : /^#\d+$/.test(name)
          ? Number.parseInt(name.slice(1), 10)
          : Number.NaN;
        if (
          !Number.isInteger(codePoint) ||
          codePoint < 0x20 && ![0x09, 0x0a, 0x0d].includes(codePoint) ||
          codePoint > 0x10ffff || codePoint >= 0xd800 && codePoint <= 0xdfff
        ) {
          throw new Error(`R2 returned invalid XML entity &${name};.`);
        }
        return String.fromCodePoint(codePoint);
      }
    }
  });
  return decoded;
}

function xmlTagText(xml: string, tagName: string): string {
  const matches = [...xml.matchAll(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "g"))];
  if (matches.length !== 1) {
    throw new Error(`R2 returned invalid bucket-list XML: expected one ${tagName} value.`);
  }
  return decodeXmlText(matches[0][1].trim());
}

export function parseBucketListing(xml: string): {
  sizes: number[];
  truncated: boolean;
  continuationToken?: string;
} {
  if (!/<ListBucketResult(?:\s[^>]*)?>[\s\S]*<\/ListBucketResult>/.test(xml)) {
    throw new Error("R2 returned invalid bucket-list XML.");
  }
  const openingContents = [...xml.matchAll(/<Contents(?:\s[^>]*)?>/g)].length;
  const closingContents = [...xml.matchAll(/<\/Contents>/g)].length;
  if (openingContents !== closingContents) {
    throw new Error("R2 returned invalid bucket-list XML: malformed Contents entry.");
  }

  const sizes: number[] = [];
  for (const [, content] of xml.matchAll(/<Contents(?:\s[^>]*)?>([\s\S]*?)<\/Contents>/g)) {
    const sizeText = xmlTagText(content, "Size");
    if (!/^\d+$/.test(sizeText)) {
      throw new Error("R2 returned an invalid object size; cannot confirm storage usage.");
    }
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size)) {
      throw new Error("R2 returned an invalid object size; cannot confirm storage usage.");
    }
    sizes.push(size);
  }

  const truncatedText = xmlTagText(xml, "IsTruncated");
  if (truncatedText !== "true" && truncatedText !== "false") {
    throw new Error("R2 returned invalid bucket-list XML: invalid IsTruncated value.");
  }
  if (truncatedText === "false") return { sizes, truncated: false };
  const continuationToken = xmlTagText(xml, "NextContinuationToken");
  if (!continuationToken) {
    throw new Error("R2 indicated more objects without a continuation token.");
  }
  return { sizes, truncated: true, continuationToken };
}

export async function bucketStorageBytes(credentials: R2Credentials): Promise<number> {
  let total = 0;
  let continuationToken: string | undefined;
  do {
    const query = new URLSearchParams({ "list-type": "2", "max-keys": "1000" });
    if (continuationToken) query.set("continuation-token", continuationToken);
    const response = await requestR2("GET", "", credentials, { query });
    if (!response.ok) {
      throw new Error(
        `R2 bucket listing failed (${response.status} ${response.statusText}); ` +
          "cannot confirm the free-tier storage limit.",
      );
    }
    const listing = parseBucketListing(await response.text());
    for (const size of listing.sizes) {
      total += size;
      if (!Number.isSafeInteger(total)) {
        throw new Error("R2 bucket size exceeds the safe storage accounting range.");
      }
    }
    continuationToken = listing.truncated ? listing.continuationToken : undefined;
  } while (continuationToken);
  return total;
}

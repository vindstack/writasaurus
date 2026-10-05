import { defineMiddleware } from "astro:middleware";
import { getPlatform } from "./lib/platform.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DESKTOP_ONLY_PATHS = new Set(["/welcome", "/open", "/settings", "/about"]);

function isDesktopOnlyPath(pathname: string): boolean {
  let decodedPath = pathname;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  const path = decodedPath.replace(/\/+$/, "") || "/";
  return DESKTOP_ONLY_PATHS.has(path) || path === "/api/editor" ||
    path.startsWith("/api/editor/");
}

function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function contentSecurityPolicy(nonce: string): string {
  const dev = import.meta.env.DEV;
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    `style-src 'self' ${dev ? "'unsafe-inline' " : ""}https://fonts.googleapis.com`,
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    `connect-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com${
      dev ? " ws: wss:" : ""
    }`,
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

async function addNonce(response: Response, nonce: string): Promise<Response> {
  if (!response.headers.get("content-type")?.includes("text/html") || !response.body) {
    return response;
  }
  const html = await response.text();
  const securedHtml = html.replace(
    /<(script|style)\b([^>]*)>/gi,
    (tag, element: string, attributes: string) =>
      /\bnonce\s*=/.test(attributes) ? tag : `<${element} nonce="${nonce}"${attributes}>`,
  );
  return new Response(securedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const nonce = makeNonce();
  context.locals.cspNonce = nonce;

  let response: Response;
  if (
    !SAFE_METHODS.has(context.request.method) &&
    !isSameOriginRequest(context.request)
  ) {
    response = new Response("Forbidden", { status: 403 });
  } else if (
    !await getPlatform().isDesktop() &&
    isDesktopOnlyPath(context.url.pathname)
  ) {
    response = new Response("Not Found", { status: 404 });
  } else {
    response = await next();
  }
  response.headers.set("content-security-policy", contentSecurityPolicy(nonce));
  return await addNonce(response, nonce);
});

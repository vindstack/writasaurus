const LOCAL_DESKTOP_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

export function licenseCorsHeaders(request: Request): Headers {
  const headers = new Headers({
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && LOCAL_DESKTOP_ORIGIN.test(origin)) {
    headers.set("access-control-allow-origin", origin);
  }
  return headers;
}

export function isAllowedDesktopOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && LOCAL_DESKTOP_ORIGIN.test(origin);
}

export const OFFLINE_EDITOR_PAGES = [
  "/editor",
  "/editor/welcome",
  "/editor/settings",
  "/editor/project-settings",
  "/editor/goal",
  "/editor/about",
  "/editor/open",
] as const;

/**
 * Opt in only after rendering a public, anonymous editor shell. Never use this for
 * personalized HTML, account pages, or pages that contain user-specific data.
 */
export function markOfflineEditorPage(request: Request, response: Response): Response {
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.headers.get("x-writasaurus-offline") !== "precache" ||
    request.headers.has("cookie") ||
    request.headers.has("authorization") ||
    url.search ||
    !OFFLINE_EDITOR_PAGES.includes(url.pathname as (typeof OFFLINE_EDITOR_PAGES)[number]) ||
    response.status !== 200 ||
    !response.headers.get("content-type")?.toLowerCase().includes("text/html") ||
    /\b(?:private|no-store)\b/i.test(response.headers.get("cache-control") ?? "") ||
    response.headers.has("set-cookie")
  ) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("x-writasaurus-offline", "public");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

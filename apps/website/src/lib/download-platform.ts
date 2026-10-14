export function detectDownloadPlatform(
  platform: string,
  userAgent: string,
  maxTouchPoints = 0,
): "linux" | "macos" | "windows" | "" {
  const normalized = platform.toLowerCase();
  if (
    /android|iphone|ipad|ipod|cros/i.test(userAgent) ||
    (normalized.includes("mac") && maxTouchPoints > 1)
  ) {
    return "";
  }
  if (normalized.includes("mac")) return "macos";
  if (normalized.includes("win")) return "windows";
  if (normalized.includes("linux") || normalized.includes("x11")) return "linux";
  return "";
}

import { detectDownloadPlatform } from "../src/lib/download-platform.ts";

Deno.test("download platform detection recognizes desktops and excludes unsupported devices", () => {
  const cases = [
    { platform: "Win32", userAgent: "Windows NT 10.0", expected: "windows" },
    { platform: "MacIntel", userAgent: "Macintosh", expected: "macos" },
    { platform: "Linux x86_64", userAgent: "X11; Linux x86_64", expected: "linux" },
    { platform: "X11", userAgent: "X11", expected: "linux" },
    { platform: "Linux armv8l", userAgent: "Android", expected: "" },
    { platform: "iPhone", userAgent: "iPhone", expected: "" },
    { platform: "iPad", userAgent: "iPad", expected: "" },
    { platform: "MacIntel", userAgent: "Macintosh", touchPoints: 5, expected: "" },
    { platform: "Linux x86_64", userAgent: "X11; CrOS x86_64", expected: "" },
    { platform: "unknown", userAgent: "unknown", expected: "" },
  ];
  for (const { platform, userAgent, touchPoints, expected } of cases) {
    const actual = detectDownloadPlatform(platform, userAgent, touchPoints);
    if (actual !== expected) {
      throw new Error(`Expected ${platform} / ${userAgent} to resolve to "${expected}", got "${actual}"`);
    }
  }
});

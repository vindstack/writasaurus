import type { Browser } from "playwright";

export async function launchBrowser(): Promise<Browser> {
  const nodeFs = await import("node:fs");
  const existsSync = nodeFs.default.existsSync;
  // Deno cannot grant access to Playwright's WSL probes; these tests launch native browsers.
  nodeFs.default.existsSync = (path) => {
    if (path === "/proc/sys/fs/binfmt_misc/WSLInterop" || path === "/run/WSL") return false;
    return existsSync(path);
  };
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } finally {
    nodeFs.default.existsSync = existsSync;
  }

  const configuredPath = Deno.env.get("PLAYWRIGHT_CHROME_PATH");
  if (configuredPath) {
    return await chromium.launch({
      executablePath: configuredPath,
      headless: true,
      args: ["--no-sandbox"],
    });
  }
  for (
    const executablePath of [
      "/snap/bin/chromium",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/usr/bin/brave-browser",
    ]
  ) {
    try {
      const stat = await Deno.stat(executablePath);
      if (!stat.isFile && !stat.isSymlink) continue;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
    return await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  }
  return await chromium.launch({ executablePath: chromium.executablePath(), headless: true });
}

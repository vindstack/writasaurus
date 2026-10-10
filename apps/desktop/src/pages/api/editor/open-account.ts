/// <reference types="astro/client" />

import type { APIRoute } from "astro";

function systemBrowserCommand(url: string): { command: string; args: string[] } {
  if (Deno.build.os === "linux") return { command: "xdg-open", args: [url] };
  if (Deno.build.os === "darwin") return { command: "open", args: [url] };
  return {
    command: "powershell",
    args: ["-NoProfile", "-NonInteractive", "-Command", "Start-Process -FilePath $args[0]", url],
  };
}

export const POST: APIRoute = async () => {
  const configuredApiUrl = import.meta.env.PUBLIC_LICENSE_API_URL?.trim();
  if (!configuredApiUrl) {
    return new Response("License website is not configured.", { status: 503 });
  }

  let accountUrl: URL;
  try {
    accountUrl = new URL("/account", configuredApiUrl);
  } catch {
    return new Response("License website URL is invalid.", { status: 500 });
  }
  if (
    accountUrl.protocol !== "https:" &&
    !(accountUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(accountUrl.hostname))
  ) {
    return new Response("License website must use HTTPS.", { status: 500 });
  }

  const { command, args } = systemBrowserCommand(accountUrl.href);
  const result = await new Deno.Command(command, {
    args,
    stdout: "null",
    stderr: "null",
  }).output();
  if (!result.success) {
    console.error(`Could not open the license website using ${command}.`);
    return new Response("Could not open the license website in your browser.", { status: 502 });
  }
  return new Response(null, { status: 204 });
};

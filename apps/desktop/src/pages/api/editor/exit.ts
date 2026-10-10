import { getPlatform } from "../../../lib/platform.ts";

export const prerender = false;

export function POST(): Response {
  const { exit } = getPlatform();
  setTimeout(exit, 50);
  return Response.json({ ok: true });
}

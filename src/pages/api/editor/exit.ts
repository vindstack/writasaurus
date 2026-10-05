import { getPlatform } from "../../../lib/platform.ts";

export const prerender = false;

export async function POST(): Promise<Response> {
  const { isDesktop, exit } = getPlatform();
  if (await isDesktop()) setTimeout(exit, 50);
  return Response.json({ ok: true });
}

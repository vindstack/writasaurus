import { clearSessionCookie, revokeSession } from "../../../lib/auth.ts";

export const prerender = false;

export async function POST(context: { request: Request }): Promise<Response> {
  await revokeSession(context.request);
  return new Response(null, {
    status: 303,
    headers: {
      location: "/account",
      "set-cookie": clearSessionCookie(),
    },
  });
}

interface AstroServer {
  handle(request: Request): Response | Promise<Response>;
}

const { handle } = await import(
  new URL("../dist/server/entry.mjs", import.meta.url).href
) as AstroServer;

export async function request(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `http://localhost${path}`;
  return await handle(new Request(url, init));
}

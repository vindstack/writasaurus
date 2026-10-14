interface AstroServer {
  handle(request: Request): Response | Promise<Response>;
}

export const { handle } = await import(
  new URL("../dist/server/entry.mjs", import.meta.url).href
) as AstroServer;

export async function request(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `http://localhost${path}`;
  return await handle(new Request(url, init));
}

export async function removeTestFile(path: string): Promise<void> {
  try {
    await Deno.remove(path);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

import { fetchApp } from "../app.ts";

export async function request(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `http://localhost${path}`;
  return await fetchApp(new Request(url, init));
}

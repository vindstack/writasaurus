import type { D1Database } from "./d1.ts";

type TestBindings = { DB?: D1Database };
const testGlobal = globalThis as typeof globalThis & { __writasaurusCloudflareEnv?: TestBindings };
export const env = (testGlobal.__writasaurusCloudflareEnv ??= {});

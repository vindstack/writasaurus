import type { Pool as PoolType, PoolClient } from "@db/postgres";

export type { PoolClient };

// Load the JSR driver through Deno, since Vite's dev module runner cannot resolve JSR imports.
const loadPostgres = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<typeof import("@db/postgres")>;
const { Pool } = await loadPostgres("jsr:@db/postgres@0.19.5");

let pool: PoolType | undefined;

export function getDatabasePool(): PoolType {
  if (pool) return pool;
  const connectionString = Deno.env.get("DATABASE_URL")?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  pool = new Pool(connectionString, 3, true);
  return pool;
}

export async function withConnection<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDatabasePool().connect();
  try {
    return await operation(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return await withConnection(async (client) => {
    await client.queryArray`BEGIN`;
    try {
      const result = await operation(client);
      await client.queryArray`COMMIT`;
      return result;
    } catch (error) {
      await client.queryArray`ROLLBACK`;
      throw error;
    }
  });
}

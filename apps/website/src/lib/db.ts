import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type { PoolClient };

let pool: Pool | undefined;

export function getDatabasePool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  pool = new Pool({ connectionString, max: 3 });
  return pool;
}

export function query<Row extends QueryResultRow = QueryResultRow>(client: PoolClient) {
  return (parts: TemplateStringsArray, ...values: unknown[]) => {
    const text = parts.reduce(
      (sql, part, index) => sql + (index === 0 ? "" : `$${index}`) + part,
      "",
    );
    return client.query<Row>({ text, values });
  };
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
    await client.query("BEGIN");
    try {
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

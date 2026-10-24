import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PoolClient } from "pg";

const mocks = vi.hoisted(() => {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  return {
    client,
    connect: vi.fn().mockResolvedValue(client),
    pool: vi.fn(),
  };
});

vi.mock("pg", () => ({
  Pool: class {
    constructor(options: unknown) {
      mocks.pool(options);
    }
    connect = mocks.connect;
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://localhost/writasaurus");
  mocks.client.query.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("Postgres pools are lazy, bounded, and reuse their connections", async () => {
  const { getDatabasePool, withConnection } = await import("../src/lib/db.ts");
  expect(mocks.pool).not.toHaveBeenCalled();
  expect(getDatabasePool()).toBe(getDatabasePool());
  expect(mocks.pool).toHaveBeenCalledExactlyOnceWith({
    connectionString: "postgres://localhost/writasaurus",
    max: 3,
  });
  await expect(withConnection(async () => "result")).resolves.toBe("result");
  expect(mocks.client.release).toHaveBeenCalledOnce();
});

test("Postgres requires an explicit connection string", async () => {
  vi.stubEnv("DATABASE_URL", " ");
  const { getDatabasePool } = await import("../src/lib/db.ts");
  expect(getDatabasePool).toThrow("DATABASE_URL is not configured.");
  expect(mocks.pool).not.toHaveBeenCalled();
});

test("SQL interpolation passes values separately to pg", async () => {
  const { query } = await import("../src/lib/db.ts");
  const email = "'; DROP TABLE auth_codes; --";
  await query(mocks.client as unknown as PoolClient)`
    SELECT email FROM auth_sessions WHERE email = ${email} AND expires_at > ${new Date(0)}
  `;
  expect(mocks.client.query).toHaveBeenCalledWith({
    text: "\n    SELECT email FROM auth_sessions WHERE email = $1 AND expires_at > $2\n  ",
    values: [email, new Date(0)],
  });
});

test("transactions commit and release successful connections", async () => {
  const { withTransaction } = await import("../src/lib/db.ts");
  await expect(withTransaction(async () => "result")).resolves.toBe("result");
  expect(mocks.client.query.mock.calls).toEqual([["BEGIN"], ["COMMIT"]]);
  expect(mocks.client.release).toHaveBeenCalledOnce();
});

test("transactions roll back and release failed connections", async () => {
  const { withTransaction } = await import("../src/lib/db.ts");
  const failure = new Error("Operation failed");
  await expect(
    withTransaction(async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(mocks.client.query.mock.calls).toEqual([["BEGIN"], ["ROLLBACK"]]);
  expect(mocks.client.release).toHaveBeenCalledOnce();
});

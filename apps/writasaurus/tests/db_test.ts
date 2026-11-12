import { expect, test, vi } from "vitest";
import type { D1Database } from "../src/lib/d1.ts";

type MockStatement = {
  sql: string;
  values: unknown[];
  bind(...values: unknown[]): MockStatement;
  first(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};

function mockDatabase() {
  const statements: MockStatement[] = [];
  let firstResult: Record<string, unknown> | null = null;
  let allResults: unknown[] = [];
  const db = {
    prepare(sql: string): MockStatement {
      const statement: MockStatement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        first: vi.fn(async () => firstResult),
        all: vi.fn().mockImplementation(async () => ({ results: allResults })),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      statements.push(statement);
      return statement;
    },
    batch: vi.fn().mockResolvedValue([{ results: [] }, { results: [{ id: "new-code" }] }]),
  } as unknown as D1Database;
  return {
    db,
    statements,
    setFirstResult: (result: Record<string, unknown> | null) => {
      firstResult = result;
    },
    setAllResults: (results: unknown[]) => {
      allResults = results;
    },
  };
}

test("D1 auth code creation applies a one-hour cap and inserts atomically", async () => {
  const { db, statements } = mockDatabase();
  const { D1WebsiteStore } = await import("../src/lib/website-store.ts");
  const created = await new D1WebsiteStore(db).createAuthCode("writer@example.com", "hash");

  expect(created).toBe(true);
  expect(db.batch).toHaveBeenCalledOnce();
  expect(statements).toHaveLength(2);
  expect(statements[0].sql).toContain("SELECT COUNT(*)");
  expect(statements[1].sql).toContain("RETURNING id");
  expect(statements[1].values).toEqual([
    expect.any(String),
    "writer@example.com",
    "hash",
    expect.any(Number),
    expect.any(Number),
    "writer@example.com",
    expect.any(Number),
  ]);
});

test("D1 auth code verification records failed attempts", async () => {
  const { db, statements, setFirstResult } = mockDatabase();
  setFirstResult({ id: "code-id", codeHash: "correct" });
  const { D1WebsiteStore } = await import("../src/lib/website-store.ts");

  await expect(new D1WebsiteStore(db).verifyAuthCode("writer@example.com", "wrong")).resolves.toBe(
    false,
  );
  expect(statements[1].sql).toContain("attempts = attempts + 1");
  expect(statements[1].values).toEqual(["code-id", expect.any(Number)]);
});

test("D1 auth code verification consumes a valid code only once", async () => {
  const { db, statements, setFirstResult, setAllResults } = mockDatabase();
  setFirstResult({ id: "code-id", codeHash: "correct" });
  setAllResults([{ id: "code-id" }]);
  const { D1WebsiteStore } = await import("../src/lib/website-store.ts");
  const store = new D1WebsiteStore(db);

  await expect(store.verifyAuthCode("writer@example.com", "correct")).resolves.toBe(true);
  expect(statements[1].sql).toContain("consumed_at IS NULL");
  expect(statements[1].sql).toContain("RETURNING id");
  setAllResults([]);
  await expect(store.verifyAuthCode("writer@example.com", "correct")).resolves.toBe(false);
});

test("D1 sessions retain expiry and support revocation", async () => {
  const { db, statements, setFirstResult } = mockDatabase();
  const { D1WebsiteStore } = await import("../src/lib/website-store.ts");
  const store = new D1WebsiteStore(db);
  const expiry = new Date("2026-10-24T12:00:00Z");

  await store.saveSession("token-hash", "writer@example.com", expiry);
  expect(statements[0].values).toEqual([
    "token-hash",
    "writer@example.com",
    expect.any(Number),
    expiry.getTime(),
  ]);
  setFirstResult({ email: "writer@example.com" });
  await expect(store.getSession("token-hash")).resolves.toEqual({ email: "writer@example.com" });
  expect(statements[1].sql).toContain("expires_at > ?");
  await store.deleteSession("token-hash");
  expect(statements[2].values).toEqual(["token-hash"]);
});

test("D1 email preferences are stored and read with parameterized queries", async () => {
  const { db, statements, setFirstResult } = mockDatabase();
  const { D1WebsiteStore } = await import("../src/lib/website-store.ts");
  const store = new D1WebsiteStore(db);

  await store.setMarketingPreference("writer@example.com", false);
  expect(statements[0].sql).toContain("ON CONFLICT (email) DO UPDATE");
  expect(statements[0].values).toEqual(["writer@example.com", 0, expect.any(Number)]);
  setFirstResult({ optedIn: 0 });
  await expect(store.getMarketingPreference("writer@example.com")).resolves.toBe(false);
  expect(statements[1].values).toEqual(["writer@example.com"]);
  setFirstResult({ optedIn: 1 });
  await expect(store.getMarketingPreference("writer@example.com")).resolves.toBe(true);
  setFirstResult(null);
  await expect(store.getMarketingPreference("writer@example.com")).resolves.toBeNull();
});

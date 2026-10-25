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
        all: vi.fn().mockResolvedValue({ results: [] }),
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
  };
}

test("D1 auth code creation applies a one-hour cap and inserts atomically", async () => {
  const { db, statements } = mockDatabase();
  const { D1WebsiteStore } = await import("../src/lib/donation-store.ts");
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
  const { D1WebsiteStore } = await import("../src/lib/donation-store.ts");

  await expect(new D1WebsiteStore(db).verifyAuthCode("writer@example.com", "wrong")).resolves.toBe(
    false,
  );
  expect(statements[1].sql).toContain("attempts = attempts + 1");
  expect(statements[1].values).toEqual(["code-id", expect.any(Number)]);
});

test("D1 donation rows retain dates and parameterized lookups", async () => {
  const { db, statements, setFirstResult } = mockDatabase();
  setFirstResult({
    id: "donation-id",
    stripeSessionId: "cs_test_session",
    paymentIntentId: "pi_test_intent",
    email: "writer@example.com",
    amountTotal: 1000,
    currency: "usd",
    status: "paid",
    receiptUrl: null,
    donatedAt: 1_800_000_000_000,
  });
  const { D1WebsiteStore } = await import("../src/lib/donation-store.ts");

  const donation = await new D1WebsiteStore(db).getDonationBySession("cs_test_session");
  expect(donation?.donatedAt).toEqual(new Date(1_800_000_000_000));
  expect(statements[0].sql).toContain("stripe_session_id = ?");
  expect(statements[0].values).toEqual(["cs_test_session"]);
});

test("D1 donation writes record matching Stripe events in one batch", async () => {
  const donatedAt = new Date("2026-10-24T12:00:00Z");
  const input = {
    id: "donation-id",
    stripeSessionId: "cs_test_session",
    paymentIntentId: "pi_test_intent",
    email: "writer@example.com",
    amountTotal: 1000,
    currency: "usd",
    receiptUrl: null,
    donatedAt,
  };
  const { db, statements, setFirstResult } = mockDatabase();
  setFirstResult({
    ...input,
    stripeSessionId: input.stripeSessionId,
    donatedAt: donatedAt.getTime(),
    status: "paid",
  });
  const { D1WebsiteStore } = await import("../src/lib/donation-store.ts");

  await expect(
    new D1WebsiteStore(db).recordDonation(input, "evt_test_event"),
  ).resolves.toMatchObject(input);
  expect(db.batch).toHaveBeenCalledOnce();
  expect(statements[0].sql).toContain("NOT EXISTS");
  expect(statements[1].sql).toContain("processed_stripe_events");
  expect(statements[2].sql).toContain("receipt_url IS NULL");
});

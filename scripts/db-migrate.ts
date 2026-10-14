import { Pool } from "@db/postgres";

const databaseUrl = Deno.env.get("DATABASE_URL")?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required to run migrations.");
const reset = Deno.args.includes("--reset");
if (Deno.args.some((argument) => argument !== "--reset")) {
  throw new TypeError("The only supported argument is --reset.");
}

const pool = new Pool(databaseUrl, 1, true);
const client = await pool.connect();
try {
  await client.queryArray`BEGIN`;
  await client.queryArray`SELECT pg_advisory_xact_lock(824593287)`;
  if (reset) {
    console.warn("Resetting the Writasaurus database and deleting all existing data.");
    await client.queryArray`
      DROP TABLE IF EXISTS
        activations,
        auth_codes,
        auth_sessions,
        donations,
        email_deliveries,
        email_preferences,
        key_reveal_claims,
        licenses,
        license_audit_events,
        processed_stripe_events,
        purchases,
        refund_operations,
        schema_migrations
      CASCADE
    `;
  }
  await client.queryArray`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  const { rows: applied } = await client.queryObject<{ name: string }>`
    SELECT name FROM schema_migrations WHERE name = '001_initial.sql'
  `;
  if (applied.length) {
    console.log("Database schema is already up to date.");
    await client.queryArray`COMMIT`;
  } else {
    const migration = await Deno.readTextFile("apps/website/migrations/001_initial.sql");
    for (const statement of migration.split(";").map((part) => part.trim()).filter(Boolean)) {
      await client.queryArray(statement);
    }
    await client.queryArray`
      INSERT INTO schema_migrations (name) VALUES ('001_initial.sql')
    `;
    await client.queryArray`COMMIT`;
    console.log("Applied migration 001_initial.sql.");
  }
} catch (error) {
  await client.queryArray`ROLLBACK`;
  throw error;
} finally {
  client.release();
  await pool.end();
}

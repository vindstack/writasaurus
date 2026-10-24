import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required to run migrations.");
const args = process.argv.slice(2);
const reset = args.includes("--reset");
if (args.some((argument) => argument !== "--reset")) {
  throw new TypeError("The only supported argument is --reset.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(824593287)");
    if (reset) {
      console.warn("Resetting the Writasaurus database and deleting all existing data.");
      await client.query(`
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
      `);
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows: applied } = await client.query<{ name: string }>(`
      SELECT name FROM schema_migrations WHERE name = '001_initial.sql'
    `);
    if (applied.length) {
      console.log("Database schema is already up to date.");
      await client.query("COMMIT");
    } else {
      const migration = await readFile(
        new URL("../apps/website/migrations/001_initial.sql", import.meta.url),
        "utf8",
      );
      for (const statement of migration
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)) {
        await client.query(statement);
      }
      await client.query(`
        INSERT INTO schema_migrations (name) VALUES ('001_initial.sql')
      `);
      await client.query("COMMIT");
      console.log("Applied migration 001_initial.sql.");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

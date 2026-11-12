import { env } from "cloudflare:workers";
import type { D1Database } from "./d1.ts";

export interface WebsiteStore {
  createAuthCode(email: string, codeHash: string): Promise<boolean>;
  verifyAuthCode(email: string, codeHash: string): Promise<boolean>;
  saveSession(tokenHash: string, email: string, expiresAt: Date): Promise<void>;
  getSession(tokenHash: string): Promise<{ email: string } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  setMarketingPreference(email: string, optedIn: boolean): Promise<void>;
  getMarketingPreference(email: string): Promise<boolean | null>;
}

export class D1WebsiteStore implements WebsiteStore {
  constructor(private readonly db: D1Database) {}

  async createAuthCode(email: string, codeHash: string): Promise<boolean> {
    const now = Date.now();
    const rateLimitArgs = [email, now - 3_600_000];
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE auth_codes SET consumed_at = ?
           WHERE email = ? AND consumed_at IS NULL
             AND (SELECT COUNT(*) FROM auth_codes WHERE email = ? AND created_at > ?) < 5`,
        )
        .bind(now, email, ...rateLimitArgs),
      this.db
        .prepare(
          `INSERT INTO auth_codes (id, email, code_hash, created_at, expires_at)
           SELECT ?, ?, ?, ?, ?
           WHERE (SELECT COUNT(*) FROM auth_codes WHERE email = ? AND created_at > ?) < 5
           RETURNING id`,
        )
        .bind(crypto.randomUUID(), email, codeHash, now, now + 600_000, ...rateLimitArgs),
    ]);
    return results[1].results.length > 0;
  }

  async verifyAuthCode(email: string, codeHash: string): Promise<boolean> {
    const now = Date.now();
    const code = await this.db
      .prepare(
        `SELECT id, code_hash AS codeHash FROM auth_codes
         WHERE email = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < 5
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(email, now)
      .first<{ id: string; codeHash: string }>();
    if (!code) return false;

    if (code.codeHash !== codeHash) {
      await this.db
        .prepare(
          `UPDATE auth_codes SET attempts = attempts + 1
           WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < 5`,
        )
        .bind(code.id, now)
        .run();
      return false;
    }

    const consumed = await this.db
      .prepare(
        `UPDATE auth_codes SET consumed_at = ?
         WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < 5
         RETURNING id`,
      )
      .bind(now, code.id, now)
      .all();
    return consumed.results.length > 0;
  }

  async saveSession(tokenHash: string, email: string, expiresAt: Date): Promise<void> {
    const now = Date.now();
    await this.db
      .prepare(
        "INSERT INTO auth_sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)",
      )
      .bind(tokenHash, email, now, expiresAt.getTime())
      .run();
  }

  async getSession(tokenHash: string): Promise<{ email: string } | null> {
    return await this.db
      .prepare("SELECT email FROM auth_sessions WHERE token_hash = ? AND expires_at > ?")
      .bind(tokenHash, Date.now())
      .first<{ email: string }>();
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }

  async setMarketingPreference(email: string, optedIn: boolean): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO email_preferences (email, marketing_opt_in, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT (email) DO UPDATE
         SET marketing_opt_in = excluded.marketing_opt_in, updated_at = excluded.updated_at`,
      )
      .bind(email, optedIn ? 1 : 0, Date.now())
      .run();
  }

  async getMarketingPreference(email: string): Promise<boolean | null> {
    const row = await this.db
      .prepare("SELECT marketing_opt_in AS optedIn FROM email_preferences WHERE email = ?")
      .bind(email)
      .first<{ optedIn: number }>();
    return row ? Boolean(row.optedIn) : null;
  }
}

export class MemoryWebsiteStore implements WebsiteStore {
  readonly codes = new Map<
    string,
    { hash: string; createdAt: number; expiresAt: number; attempts: number }
  >();
  readonly sessions = new Map<string, { email: string; expiresAt: number }>();
  readonly preferences = new Map<string, boolean>();
  private readonly codeRequests = new Map<string, number[]>();

  async createAuthCode(email: string, codeHash: string): Promise<boolean> {
    const now = Date.now();
    const recent = (this.codeRequests.get(email) ?? []).filter((time) => time > now - 3_600_000);
    if (recent.length >= 5) return false;
    this.codeRequests.set(email, [...recent, now]);
    for (const key of this.codes.keys()) {
      if (key.startsWith(`${email}:`)) this.codes.delete(key);
    }
    this.codes.set(`${email}:${crypto.randomUUID()}`, {
      hash: codeHash,
      createdAt: now,
      expiresAt: now + 600_000,
      attempts: 0,
    });
    return true;
  }

  async verifyAuthCode(email: string, codeHash: string): Promise<boolean> {
    const entry = [...this.codes.entries()]
      .reverse()
      .find(
        ([key, code]) =>
          key.startsWith(`${email}:`) && code.expiresAt > Date.now() && code.attempts < 5,
      );
    if (!entry) return false;
    const [key, code] = entry;
    if (code.hash !== codeHash) {
      code.attempts++;
      return false;
    }
    this.codes.delete(key);
    return true;
  }

  async saveSession(tokenHash: string, email: string, expiresAt: Date): Promise<void> {
    this.sessions.set(tokenHash, { email, expiresAt: expiresAt.getTime() });
  }

  async getSession(tokenHash: string): Promise<{ email: string } | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= Date.now()) return null;
    return { email: session.email };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async setMarketingPreference(email: string, optedIn: boolean): Promise<void> {
    this.preferences.set(email, optedIn);
  }

  async getMarketingPreference(email: string): Promise<boolean | null> {
    return this.preferences.get(email) ?? null;
  }
}

let activeStore: WebsiteStore | undefined;

export function getWebsiteStore(): WebsiteStore {
  if (activeStore) return activeStore;
  if (env.DB) {
    activeStore = new D1WebsiteStore(env.DB);
  } else if (process.env.NODE_ENV !== "production") {
    activeStore = new MemoryWebsiteStore();
  } else {
    throw new Error("Cloudflare D1 binding DB is not configured.");
  }
  return activeStore;
}

export function setWebsiteStoreForTests(store: WebsiteStore | undefined): void {
  activeStore = store;
}

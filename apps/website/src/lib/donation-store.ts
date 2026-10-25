import { env } from "cloudflare:workers";
import type { D1Database } from "./d1.ts";

export interface DonationRecord {
  id: string;
  stripeSessionId: string;
  paymentIntentId: string;
  email: string;
  amountTotal: number;
  currency: string;
  status: "paid" | "refunded" | "disputed";
  receiptUrl: string | null;
  donatedAt: Date;
}

export interface DonationInput {
  id: string;
  stripeSessionId: string;
  paymentIntentId: string;
  email: string;
  amountTotal: number;
  currency: string;
  receiptUrl: string | null;
  donatedAt: Date;
}

export interface WebsiteStore {
  createAuthCode(email: string, codeHash: string): Promise<boolean>;
  verifyAuthCode(email: string, codeHash: string): Promise<boolean>;
  saveSession(tokenHash: string, email: string, expiresAt: Date): Promise<void>;
  getSession(tokenHash: string): Promise<{ email: string } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  getDonationsByEmail(email: string): Promise<DonationRecord[]>;
  getDonationBySession(sessionId: string): Promise<DonationRecord | null>;
  recordDonation(input: DonationInput, eventId?: string): Promise<DonationRecord>;
  setMarketingPreference(email: string, optedIn: boolean): Promise<void>;
  getMarketingPreference(email: string): Promise<boolean | null>;
  setDonationStatus(
    eventId: string,
    paymentIntentId: string,
    status: "refunded" | "disputed",
  ): Promise<void>;
}

type DonationRow = {
  id: string;
  stripeSessionId: string;
  paymentIntentId: string;
  email: string;
  amountTotal: number;
  currency: string;
  status: DonationRecord["status"];
  receiptUrl: string | null;
  donatedAt: number;
};

function mapDonation(row: DonationRow): DonationRecord {
  return {
    ...row,
    amountTotal: Number(row.amountTotal),
    donatedAt: new Date(Number(row.donatedAt)),
  };
}

const DONATION_COLUMNS = `
  id, stripe_session_id AS stripeSessionId, payment_intent_id AS paymentIntentId,
  email, amount_total AS amountTotal, currency, status, receipt_url AS receiptUrl,
  donated_at AS donatedAt
`;

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

  async getDonationsByEmail(email: string): Promise<DonationRecord[]> {
    const result = await this.db
      .prepare(`SELECT ${DONATION_COLUMNS} FROM donations WHERE email = ? ORDER BY donated_at DESC`)
      .bind(email)
      .all<DonationRow>();
    return result.results.map(mapDonation);
  }

  async getDonationBySession(sessionId: string): Promise<DonationRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${DONATION_COLUMNS} FROM donations WHERE stripe_session_id = ?`)
      .bind(sessionId)
      .first<DonationRow>();
    return row ? mapDonation(row) : null;
  }

  async recordDonation(input: DonationInput, eventId?: string): Promise<DonationRecord> {
    const values = [
      input.id,
      input.stripeSessionId,
      input.paymentIntentId,
      input.email,
      input.amountTotal,
      input.currency,
      input.receiptUrl,
      input.donatedAt.getTime(),
    ];
    const statements = [
      eventId
        ? this.db
            .prepare(
              `INSERT INTO donations (
                 id, stripe_session_id, payment_intent_id, email, amount_total,
                 currency, status, receipt_url, donated_at
               )
               SELECT ?, ?, ?, ?, ?, ?, 'paid', ?, ?
               WHERE NOT EXISTS (
                 SELECT 1 FROM processed_stripe_events WHERE event_id = ?
               )
               ON CONFLICT (stripe_session_id) DO NOTHING`,
            )
            .bind(...values, eventId)
        : this.db
            .prepare(
              `INSERT INTO donations (
                 id, stripe_session_id, payment_intent_id, email, amount_total,
                 currency, status, receipt_url, donated_at
               ) VALUES (?, ?, ?, ?, ?, ?, 'paid', ?, ?)
               ON CONFLICT (stripe_session_id) DO NOTHING`,
            )
            .bind(...values),
      ...(eventId
        ? [
            this.db
              .prepare(
                `INSERT INTO processed_stripe_events (event_id, event_type, processed_at)
                 SELECT ?, 'donation.completed', ?
                 WHERE EXISTS (
                   SELECT 1 FROM donations
                   WHERE stripe_session_id = ? AND email = ? AND payment_intent_id = ?
                     AND amount_total = ? AND currency = ?
                 )
                 ON CONFLICT (event_id) DO NOTHING`,
              )
              .bind(
                eventId,
                Date.now(),
                input.stripeSessionId,
                input.email,
                input.paymentIntentId,
                input.amountTotal,
                input.currency,
              ),
          ]
        : []),
      this.db
        .prepare(
          `UPDATE donations SET receipt_url = ?
           WHERE stripe_session_id = ? AND receipt_url IS NULL AND ? IS NOT NULL`,
        )
        .bind(input.receiptUrl, input.stripeSessionId, input.receiptUrl),
    ];
    await this.db.batch(statements);

    const donation = await this.getDonationBySession(input.stripeSessionId);
    if (!donation) {
      throw new Error("Stripe event was already processed without a matching donation.");
    }
    if (
      donation.email !== input.email ||
      donation.paymentIntentId !== input.paymentIntentId ||
      donation.amountTotal !== input.amountTotal ||
      donation.currency !== input.currency
    ) {
      throw new Error("Stripe session conflicts with the recorded donation.");
    }
    return donation;
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

  async setDonationStatus(
    eventId: string,
    paymentIntentId: string,
    status: "refunded" | "disputed",
  ): Promise<void> {
    await this.db.batch([
      this.db
        .prepare("UPDATE donations SET status = ? WHERE payment_intent_id = ?")
        .bind(status, paymentIntentId),
      this.db
        .prepare(
          `INSERT INTO processed_stripe_events (event_id, event_type, processed_at)
           SELECT ?, ?, ? WHERE EXISTS (
             SELECT 1 FROM donations WHERE payment_intent_id = ?
           )
           ON CONFLICT (event_id) DO NOTHING`,
        )
        .bind(eventId, status, Date.now(), paymentIntentId),
    ]);
  }
}

export class MemoryWebsiteStore implements WebsiteStore {
  readonly donations = new Map<string, DonationRecord>();
  readonly codes = new Map<
    string,
    { hash: string; createdAt: number; expiresAt: number; attempts: number }
  >();
  readonly sessions = new Map<string, { email: string; expiresAt: number }>();
  readonly preferences = new Map<string, boolean>();
  readonly events = new Set<string>();

  async createAuthCode(email: string, codeHash: string): Promise<boolean> {
    const recent = [...this.codes.entries()].filter(
      ([key, code]) => key.startsWith(`${email}:`) && code.createdAt > Date.now() - 3_600_000,
    );
    if (recent.length >= 5) return false;
    for (const key of this.codes.keys()) {
      if (key.startsWith(`${email}:`)) this.codes.delete(key);
    }
    this.codes.set(`${email}:${crypto.randomUUID()}`, {
      hash: codeHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
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

  async getDonationsByEmail(email: string): Promise<DonationRecord[]> {
    return [...this.donations.values()]
      .filter((donation) => donation.email === email)
      .sort((left, right) => right.donatedAt.getTime() - left.donatedAt.getTime());
  }

  async getDonationBySession(sessionId: string): Promise<DonationRecord | null> {
    return this.donations.get(sessionId) ?? null;
  }

  async recordDonation(input: DonationInput, eventId?: string): Promise<DonationRecord> {
    const existing = this.donations.get(input.stripeSessionId);
    if (existing) return existing;
    const donation: DonationRecord = { ...input, status: "paid" };
    this.donations.set(input.stripeSessionId, donation);
    if (eventId) this.events.add(eventId);
    return donation;
  }

  async setMarketingPreference(email: string, optedIn: boolean): Promise<void> {
    this.preferences.set(email, optedIn);
  }

  async getMarketingPreference(email: string): Promise<boolean | null> {
    return this.preferences.get(email) ?? null;
  }

  async setDonationStatus(
    eventId: string,
    paymentIntentId: string,
    status: "refunded" | "disputed",
  ): Promise<void> {
    if (this.events.has(eventId)) return;
    const donation = [...this.donations.values()].find(
      (entry) => entry.paymentIntentId === paymentIntentId,
    );
    if (!donation) return;
    donation.status = status;
    this.events.add(eventId);
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

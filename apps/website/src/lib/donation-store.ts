import { env } from "node:process";
import { type PoolClient, query, withConnection, withTransaction } from "./db.ts";

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

function mapDonation(row: Record<string, unknown>): DonationRecord {
  return {
    id: String(row.id),
    stripeSessionId: String(row.stripeSessionId),
    paymentIntentId: String(row.paymentIntentId),
    email: String(row.email),
    amountTotal: Number(row.amountTotal),
    currency: String(row.currency).trim(),
    status: row.status as DonationRecord["status"],
    receiptUrl: row.receiptUrl === null ? null : String(row.receiptUrl),
    donatedAt: new Date(row.donatedAt as string | number | Date),
  };
}

async function selectDonation(
  client: PoolClient,
  sessionId: string,
): Promise<DonationRecord | null> {
  const result = await query<Record<string, unknown>>(client)`
    SELECT id, stripe_session_id AS "stripeSessionId",
      payment_intent_id AS "paymentIntentId", email, amount_total AS "amountTotal",
      currency, status, receipt_url AS "receiptUrl", donated_at AS "donatedAt"
    FROM donations WHERE stripe_session_id = ${sessionId}
  `;
  return result.rows[0] ? mapDonation(result.rows[0]) : null;
}

export class PostgresWebsiteStore implements WebsiteStore {
  async createAuthCode(email: string, codeHash: string): Promise<boolean> {
    return await withTransaction(async (client) => {
      await query(client)`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
      const recent = await query<{ count: number }>(client)`
        SELECT count(*)::int AS count FROM auth_codes
        WHERE email = ${email} AND created_at > now() - interval '1 hour'
      `;
      if ((recent.rows[0]?.count ?? 0) >= 5) return false;
      await query(client)`
        UPDATE auth_codes SET consumed_at = now()
        WHERE email = ${email} AND consumed_at IS NULL
      `;
      await query(client)`
        INSERT INTO auth_codes (id, email, code_hash, expires_at)
        VALUES (${crypto.randomUUID()}, ${email}, ${codeHash}, now() + interval '10 minutes')
      `;
      return true;
    });
  }

  async verifyAuthCode(email: string, codeHash: string): Promise<boolean> {
    return await withTransaction(async (client) => {
      const result = await query<{ id: string; codeHash: string }>(client)`
        SELECT id, code_hash AS "codeHash" FROM auth_codes
        WHERE email = ${email} AND consumed_at IS NULL AND expires_at > now() AND attempts < 5
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE
      `;
      const code = result.rows[0];
      if (!code) return false;
      if (code.codeHash !== codeHash) {
        await query(client)`UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ${code.id}`;
        return false;
      }
      await query(client)`UPDATE auth_codes SET consumed_at = now() WHERE id = ${code.id}`;
      return true;
    });
  }

  async saveSession(tokenHash: string, email: string, expiresAt: Date): Promise<void> {
    await withConnection(
      (client) =>
        query(client)`
        INSERT INTO auth_sessions (token_hash, email, expires_at)
        VALUES (${tokenHash}, ${email}, ${expiresAt})
      `,
    );
  }

  async getSession(tokenHash: string): Promise<{ email: string } | null> {
    return await withConnection(async (client) => {
      const result = await query<{ email: string }>(client)`
        SELECT email FROM auth_sessions WHERE token_hash = ${tokenHash} AND expires_at > now()
      `;
      return result.rows[0] ?? null;
    });
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await withConnection(
      (client) => query(client)`DELETE FROM auth_sessions WHERE token_hash = ${tokenHash}`,
    );
  }

  async getDonationsByEmail(email: string): Promise<DonationRecord[]> {
    return await withConnection(async (client) => {
      const result = await query<Record<string, unknown>>(client)`
        SELECT id, stripe_session_id AS "stripeSessionId",
          payment_intent_id AS "paymentIntentId", email, amount_total AS "amountTotal",
          currency, status, receipt_url AS "receiptUrl", donated_at AS "donatedAt"
        FROM donations WHERE email = ${email} ORDER BY donated_at DESC
      `;
      return result.rows.map(mapDonation);
    });
  }

  async getDonationBySession(sessionId: string): Promise<DonationRecord | null> {
    return await withConnection((client) => selectDonation(client, sessionId));
  }

  async recordDonation(input: DonationInput, eventId?: string): Promise<DonationRecord> {
    return await withTransaction(async (client) => {
      if (eventId) {
        const event = await query<{ eventId: string }>(client)`
          INSERT INTO processed_stripe_events (event_id, event_type)
          VALUES (${eventId}, 'donation.completed')
          ON CONFLICT (event_id) DO NOTHING
          RETURNING event_id AS "eventId"
        `;
        if (!event.rows[0]) {
          const existing = await selectDonation(client, input.stripeSessionId);
          if (existing) return existing;
          throw new Error("Stripe event was already processed without a matching donation.");
        }
      }
      const existing = await selectDonation(client, input.stripeSessionId);
      if (existing) {
        if (
          existing.email !== input.email ||
          existing.paymentIntentId !== input.paymentIntentId ||
          existing.amountTotal !== input.amountTotal ||
          existing.currency !== input.currency
        )
          throw new Error("Stripe session conflicts with the recorded donation.");
        if (!existing.receiptUrl && input.receiptUrl) {
          await query(client)`
            UPDATE donations SET receipt_url = ${input.receiptUrl}
            WHERE stripe_session_id = ${input.stripeSessionId}
          `;
          existing.receiptUrl = input.receiptUrl;
        }
        return existing;
      }
      await query(client)`
        INSERT INTO donations (
          id, stripe_session_id, payment_intent_id, email, amount_total, currency,
          status, receipt_url, donated_at
        ) VALUES (
          ${input.id}, ${input.stripeSessionId}, ${input.paymentIntentId}, ${input.email},
          ${input.amountTotal}, ${input.currency}, 'paid', ${input.receiptUrl}, ${input.donatedAt}
        )
      `;
      const donation = await selectDonation(client, input.stripeSessionId);
      if (!donation) throw new Error("Donation was inserted but could not be read back.");
      return donation;
    });
  }

  async setMarketingPreference(email: string, optedIn: boolean): Promise<void> {
    await withConnection(
      (client) =>
        query(client)`
        INSERT INTO email_preferences (email, marketing_opt_in, updated_at)
        VALUES (${email}, ${optedIn}, now())
        ON CONFLICT (email) DO UPDATE
        SET marketing_opt_in = EXCLUDED.marketing_opt_in, updated_at = now()
      `,
    );
  }

  async getMarketingPreference(email: string): Promise<boolean | null> {
    return await withConnection(async (client) => {
      const result = await query<{ optedIn: boolean }>(client)`
        SELECT marketing_opt_in AS "optedIn" FROM email_preferences WHERE email = ${email}
      `;
      return result.rows[0]?.optedIn ?? null;
    });
  }

  async setDonationStatus(
    eventId: string,
    paymentIntentId: string,
    status: "refunded" | "disputed",
  ): Promise<void> {
    await withTransaction(async (client) => {
      const updated = await query<{ id: string }>(client)`
        UPDATE donations SET status = ${status}
        WHERE payment_intent_id = ${paymentIntentId}
        RETURNING id
      `;
      if (!updated.rows.length) return;
      await query(client)`
        INSERT INTO processed_stripe_events (event_id, event_type)
        VALUES (${eventId}, ${status})
        ON CONFLICT (event_id) DO NOTHING
      `;
    });
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
  if (process.env.DATABASE_URL) {
    activeStore = new PostgresWebsiteStore();
  } else if (env.NODE_ENV !== "production") {
    activeStore = new MemoryWebsiteStore();
  } else {
    throw new Error("DATABASE_URL is not configured.");
  }
  return activeStore;
}

export function setWebsiteStoreForTests(store: WebsiteStore | undefined): void {
  activeStore = store;
}

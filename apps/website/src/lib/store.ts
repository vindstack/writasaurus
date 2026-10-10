// deno-lint-ignore-file require-await

import { getDatabasePool, type PoolClient, withConnection, withTransaction } from "./db.ts";

export type UserRole = "customer" | "admin";
export type PaymentStatus = "paid" | "refunded" | "disputed";
export type RefundStatus = "pending" | "succeeded" | "failed";

export interface PurchaseRecord {
  id: string;
  licenseId: string;
  stripeSessionId: string;
  paymentIntentId: string | null;
  email: string;
  amountTotal: number;
  currency: string;
  status: PaymentStatus;
  receiptUrl: string | null;
  purchasedAt: Date;
  licenseStatus: "active" | "revoked";
  maxDevices: number;
  encryptedKey: string;
  keyHash: string;
}

export interface FulfillmentInput {
  eventId?: string;
  eventType?: string;
  licenseId: string;
  purchaseId: string;
  keyHash: string;
  encryptedKey: string;
  email: string;
  stripeSessionId: string;
  paymentIntentId: string | null;
  amountTotal: number;
  currency: string;
  receiptUrl: string | null;
  purchasedAt: Date;
  claimHash: string;
}

export interface ActivationRecord {
  licenseId: string;
  deviceHash: string;
  maxDevices: number;
}

export interface RefundRecord {
  id: string;
  purchase: PurchaseRecord;
  idempotencyKey: string;
  refundId: string | null;
  status: RefundStatus;
}

export interface AdminLicenseRecord {
  id: string;
  email: string;
  status: "active" | "revoked";
  maxDevices: number;
  createdAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
  activationCount: number;
}

export interface AdminActivationRecord {
  id: string;
  deviceHash: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface LicenseStore {
  fulfill(input: FulfillmentInput): Promise<{ purchase: PurchaseRecord; created: boolean }>;
  startEmailDelivery(licenseId: string, template: string, recipient: string): Promise<boolean>;
  emailWasSent(licenseId: string, template: string): Promise<boolean>;
  finishEmailDelivery(
    licenseId: string,
    template: string,
    status: "sent" | "failed",
    errorCode?: string,
  ): Promise<void>;
  getPurchaseBySession(sessionId: string): Promise<PurchaseRecord | null>;
  getPurchasesByEmail(email: string): Promise<PurchaseRecord[]>;
  claimKeyReveal(sessionId: string, claimHash: string): Promise<PurchaseRecord | null>;
  getPurchaseByLicenseKey(keyHash: string): Promise<PurchaseRecord | null>;
  activate(licenseId: string, deviceHash: string): Promise<ActivationRecord | null>;
  refresh(licenseId: string, deviceHash: string): Promise<ActivationRecord | null>;
  hasPurchase(email: string): Promise<boolean>;
  createAuthCode(email: string, role: UserRole, codeHash: string): Promise<boolean>;
  verifyAuthCode(email: string, role: UserRole, codeHash: string): Promise<boolean>;
  saveSession(tokenHash: string, email: string, role: UserRole, expiresAt: Date): Promise<void>;
  getSession(tokenHash: string): Promise<{ email: string; role: UserRole } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  beginRefund(purchaseId: string, idempotencyKey: string, refundId: string): Promise<RefundRecord>;
  completeRefund(purchaseId: string, status: RefundStatus, stripeRefundId?: string): Promise<void>;
  applyStripeRefund(eventId: string, eventType: string, paymentIntentId: string): Promise<void>;
  listLicenses(search: string): Promise<AdminLicenseRecord[]>;
  listActivations(licenseId: string): Promise<AdminActivationRecord[]>;
  revokeLicense(id: string, adminEmail: string, reason: string): Promise<void>;
  restoreLicense(id: string, adminEmail: string, reason: string): Promise<void>;
  resetActivation(licenseId: string, activationId: string, adminEmail: string): Promise<void>;
}

function mapPurchase(row: Record<string, unknown>): PurchaseRecord {
  return {
    id: String(row.id),
    licenseId: String(row.licenseId),
    stripeSessionId: String(row.stripeSessionId),
    paymentIntentId: row.paymentIntentId === null ? null : String(row.paymentIntentId),
    email: String(row.email),
    amountTotal: Number(row.amountTotal),
    currency: String(row.currency).trim(),
    status: row.status as PaymentStatus,
    receiptUrl: row.receiptUrl === null ? null : String(row.receiptUrl),
    purchasedAt: new Date(row.purchasedAt as string | number | Date),
    licenseStatus: row.licenseStatus as PurchaseRecord["licenseStatus"],
    maxDevices: Number(row.maxDevices),
    encryptedKey: String(row.encryptedKey),
    keyHash: String(row.keyHash),
  };
}

async function selectPurchase(
  client: PoolClient,
  clause: string,
  value: string,
): Promise<PurchaseRecord | null> {
  const result = await client.queryObject<Record<string, unknown>>(
    {
      text: `SELECT p.id, p.license_id AS "licenseId", p.stripe_session_id AS "stripeSessionId",
          p.payment_intent_id AS "paymentIntentId", p.email, p.amount_total AS "amountTotal",
          p.currency, p.status, p.receipt_url AS "receiptUrl", p.purchased_at AS "purchasedAt",
          l.status AS "licenseStatus", l.max_devices AS "maxDevices", l.encrypted_key AS "encryptedKey",
          l.key_hash AS "keyHash"
        FROM purchases p JOIN licenses l ON l.id = p.license_id WHERE ${clause}`,
      args: [value],
    },
  );
  return result.rows[0] ? mapPurchase(result.rows[0]) : null;
}

export class PostgresLicenseStore implements LicenseStore {
  async fulfill(input: FulfillmentInput): Promise<{ purchase: PurchaseRecord; created: boolean }> {
    return await withTransaction(async (client) => {
      if (input.eventId) {
        const event = await client.queryObject<{ eventId: string }>`
          INSERT INTO processed_stripe_events (event_id, event_type)
          VALUES (${input.eventId}, ${input.eventType ?? "checkout.session.completed"})
          ON CONFLICT DO NOTHING
          RETURNING event_id AS "eventId"
        `;
        if (!event.rows.length) {
          const existing = await selectPurchase(
            client,
            "p.stripe_session_id = $1",
            input.stripeSessionId,
          );
          if (existing) return { purchase: existing, created: false };
        }
      }
      const existing = await selectPurchase(
        client,
        "p.stripe_session_id = $1",
        input.stripeSessionId,
      );
      if (existing) return { purchase: existing, created: false };
      await client.queryArray`
        INSERT INTO licenses (id, key_hash, encrypted_key, email)
        VALUES (${input.licenseId}, ${input.keyHash}, ${input.encryptedKey}, ${input.email})
      `;
      await client.queryArray`
        INSERT INTO purchases (
          id, license_id, stripe_session_id, payment_intent_id, email, amount_total, currency,
          status, receipt_url, purchased_at
        )
        VALUES (
          ${input.purchaseId}, ${input.licenseId}, ${input.stripeSessionId}, ${input.paymentIntentId},
          ${input.email}, ${input.amountTotal}, ${input.currency}, 'paid', ${input.receiptUrl},
          ${input.purchasedAt}
        )
      `;
      await client.queryArray`
        INSERT INTO key_reveal_claims (purchase_id, claim_hash, expires_at)
        VALUES (${input.purchaseId}, ${input.claimHash}, ${new Date(Date.now() + 86_400_000)})
      `;
      const purchase = await selectPurchase(client, "p.id = $1", input.purchaseId);
      if (!purchase) throw new Error("Purchase was created but could not be read back.");
      return { purchase, created: true };
    });
  }

  async getPurchaseBySession(sessionId: string): Promise<PurchaseRecord | null> {
    return await withConnection((client) =>
      selectPurchase(client, "p.stripe_session_id = $1", sessionId)
    );
  }

  async startEmailDelivery(
    licenseId: string,
    template: string,
    recipient: string,
  ): Promise<boolean> {
    return await withTransaction(async (client) => {
      await client.queryArray`
        INSERT INTO email_deliveries (id, license_id, template, recipient, status)
        VALUES (${crypto.randomUUID()}, ${licenseId}, ${template}, ${recipient}, 'pending')
        ON CONFLICT (license_id, template) DO NOTHING
      `;
      const row = await client.queryObject<{ status: string; updatedAt: Date }>`
        SELECT status, updated_at AS "updatedAt" FROM email_deliveries
        WHERE license_id = ${licenseId} AND template = ${template} FOR UPDATE
      `;
      const delivery = row.rows[0];
      if (!delivery) return false;
      if (
        delivery.status === "sent" &&
        (!template.startsWith("key-recovery") ||
          Date.now() - new Date(delivery.updatedAt).getTime() < 300_000)
      ) return false;
      if (
        delivery.status === "sending" &&
        Date.now() - new Date(delivery.updatedAt).getTime() < 300_000
      ) return false;
      if (
        delivery.status === "failed" &&
        Date.now() - new Date(delivery.updatedAt).getTime() < 60_000
      ) return false;
      await client.queryArray`
        UPDATE email_deliveries SET status = 'sending', attempts = attempts + 1,
          updated_at = now(), last_error_code = NULL
        WHERE license_id = ${licenseId} AND template = ${template}
      `;
      return true;
    });
  }

  async finishEmailDelivery(
    licenseId: string,
    template: string,
    status: "sent" | "failed",
    errorCode?: string,
  ): Promise<void> {
    await withConnection((client) =>
      client.queryArray`
      UPDATE email_deliveries SET status = ${status}, updated_at = now(),
        sent_at = CASE WHEN ${status} = 'sent' THEN now() ELSE sent_at END,
        last_error_code = ${errorCode ?? null}
      WHERE license_id = ${licenseId} AND template = ${template}
    `
    );
  }

  async emailWasSent(licenseId: string, template: string): Promise<boolean> {
    return await withConnection(async (client) => {
      const result = await client.queryObject<{ sent: boolean }>`
        SELECT EXISTS(
          SELECT 1 FROM email_deliveries
          WHERE license_id = ${licenseId} AND template = ${template} AND status = 'sent'
        ) AS sent
      `;
      return Boolean(result.rows[0]?.sent);
    });
  }

  async getPurchasesByEmail(email: string): Promise<PurchaseRecord[]> {
    return await withConnection(async (client) => {
      const result = await client.queryObject<Record<string, unknown>>({
        text: `SELECT p.id, p.license_id AS "licenseId", p.stripe_session_id AS "stripeSessionId",
            p.payment_intent_id AS "paymentIntentId", p.email, p.amount_total AS "amountTotal",
            p.currency, p.status, p.receipt_url AS "receiptUrl", p.purchased_at AS "purchasedAt",
            l.status AS "licenseStatus", l.max_devices AS "maxDevices",
            l.encrypted_key AS "encryptedKey", l.key_hash AS "keyHash"
          FROM purchases p JOIN licenses l ON l.id = p.license_id
          WHERE lower(p.email) = lower($1) ORDER BY p.purchased_at DESC`,
        args: [email],
      });
      return result.rows.map(mapPurchase);
    });
  }

  async claimKeyReveal(sessionId: string, claimHash: string): Promise<PurchaseRecord | null> {
    return await withTransaction(async (client) => {
      const result = await client.queryObject<{ purchaseId: string }>`
        UPDATE key_reveal_claims k SET claimed_at = now()
        FROM purchases p
        WHERE k.purchase_id = p.id AND p.stripe_session_id = ${sessionId}
          AND k.claim_hash = ${claimHash} AND k.claimed_at IS NULL AND k.expires_at > now()
          AND p.status = 'paid'
        RETURNING k.purchase_id AS "purchaseId"
      `;
      return result.rows[0]
        ? await selectPurchase(client, "p.id = $1", result.rows[0].purchaseId)
        : null;
    });
  }

  async getPurchaseByLicenseKey(keyHash: string): Promise<PurchaseRecord | null> {
    return await withConnection((client) => selectPurchase(client, "l.key_hash = $1", keyHash));
  }

  async activate(licenseId: string, deviceHash: string): Promise<ActivationRecord | null> {
    return await withTransaction(async (client) => {
      const license = await client.queryObject<{ status: string; maxDevices: number }>`
        SELECT status, max_devices AS "maxDevices" FROM licenses WHERE id = ${licenseId} FOR UPDATE
      `;
      const row = license.rows[0];
      if (!row || row.status !== "active") return null;
      const existing = await client.queryObject<{ id: string }>`
        SELECT id FROM activations WHERE license_id = ${licenseId} AND device_hash = ${deviceHash}
      `;
      if (!existing.rows.length) {
        const count = await client.queryObject<{ count: number }>`
          SELECT count(*)::int AS count FROM activations WHERE license_id = ${licenseId}
        `;
        if (Number(count.rows[0]?.count ?? 0) >= Number(row.maxDevices)) return null;
        await client.queryArray`
          INSERT INTO activations (id, license_id, device_hash)
          VALUES (${crypto.randomUUID()}, ${licenseId}, ${deviceHash})
        `;
      } else {
        await client.queryArray`
          UPDATE activations SET last_seen_at = now()
          WHERE license_id = ${licenseId} AND device_hash = ${deviceHash}
        `;
      }
      return { licenseId, deviceHash, maxDevices: Number(row.maxDevices) };
    });
  }

  async refresh(licenseId: string, deviceHash: string): Promise<ActivationRecord | null> {
    return await withTransaction(async (client) => {
      const rows = await client.queryObject<{ status: string; maxDevices: number }>`
        SELECT l.status, l.max_devices AS "maxDevices"
        FROM licenses l JOIN activations a ON a.license_id = l.id
        WHERE l.id = ${licenseId} AND a.device_hash = ${deviceHash}
        FOR UPDATE OF l
      `;
      const license = rows.rows[0];
      if (!license || license.status !== "active") return null;
      await client.queryArray`
        UPDATE activations SET last_seen_at = now()
        WHERE license_id = ${licenseId} AND device_hash = ${deviceHash}
      `;
      return { licenseId, deviceHash, maxDevices: Number(license.maxDevices) };
    });
  }

  async hasPurchase(email: string): Promise<boolean> {
    return await withConnection(async (client) => {
      const result = await client.queryObject<{ found: boolean }>`
        SELECT EXISTS(SELECT 1 FROM purchases WHERE lower(email) = lower(${email})) AS found
      `;
      return Boolean(result.rows[0]?.found);
    });
  }

  async createAuthCode(email: string, role: UserRole, codeHash: string): Promise<boolean> {
    return await withTransaction(async (client) => {
      const recent = await client.queryObject<{ count: number }>`
        SELECT count(*)::int AS count FROM auth_codes
        WHERE email = ${email} AND purpose = ${role} AND created_at > now() - interval '1 hour'
      `;
      if (Number(recent.rows[0]?.count ?? 0) >= 5) return false;
      await client.queryArray`
        UPDATE auth_codes SET consumed_at = now()
        WHERE email = ${email} AND purpose = ${role} AND consumed_at IS NULL
      `;
      await client.queryArray`
        INSERT INTO auth_codes (id, email, purpose, code_hash, expires_at)
        VALUES (${crypto.randomUUID()}, ${email}, ${role}, ${codeHash}, ${new Date(
        Date.now() + 600_000,
      )})
      `;
      return true;
    });
  }

  async verifyAuthCode(email: string, role: UserRole, codeHash: string): Promise<boolean> {
    return await withTransaction(async (client) => {
      const code = await client.queryObject<{ id: string; codeHash: string }>`
        SELECT id, code_hash AS "codeHash" FROM auth_codes
        WHERE email = ${email} AND purpose = ${role} AND consumed_at IS NULL
          AND expires_at > now() AND attempts < 5
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE
      `;
      const row = code.rows[0];
      if (!row) return false;
      if (row.codeHash !== codeHash) {
        await client.queryArray`UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ${row.id}`;
        return false;
      }
      await client.queryArray`UPDATE auth_codes SET consumed_at = now() WHERE id = ${row.id}`;
      return true;
    });
  }

  async saveSession(
    tokenHash: string,
    email: string,
    role: UserRole,
    expiresAt: Date,
  ): Promise<void> {
    await withConnection((client) =>
      client.queryArray`
      INSERT INTO auth_sessions (token_hash, email, role, expires_at)
      VALUES (${tokenHash}, ${email}, ${role}, ${expiresAt})
    `
    );
  }

  async getSession(tokenHash: string): Promise<{ email: string; role: UserRole } | null> {
    return await withConnection(async (client) => {
      const result = await client.queryObject<{ email: string; role: UserRole }>`
        SELECT email, role FROM auth_sessions
        WHERE token_hash = ${tokenHash} AND expires_at > now()
      `;
      return result.rows[0] ?? null;
    });
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await withConnection((client) =>
      client.queryArray`DELETE FROM auth_sessions WHERE token_hash = ${tokenHash}`
    );
  }

  async beginRefund(
    purchaseId: string,
    idempotencyKey: string,
    refundId: string,
  ): Promise<RefundRecord> {
    return await withTransaction(async (client) => {
      await client.queryArray`
        SELECT p.id FROM purchases p JOIN licenses l ON l.id = p.license_id
        WHERE p.id = ${purchaseId} FOR UPDATE OF p, l
      `;
      const purchase = await selectPurchase(client, "p.id = $1", purchaseId);
      if (!purchase) throw new Error("Purchase not found.");
      const previous = await client.queryObject<{
        id: string;
        stripeRefundId: string | null;
        status: RefundStatus;
        key: string;
      }>`
        SELECT id, stripe_refund_id AS "stripeRefundId", status,
          stripe_idempotency_key AS key
        FROM refund_operations WHERE purchase_id = ${purchaseId} FOR UPDATE
      `;
      let row = previous.rows[0];
      if (!row) {
        if (
          purchase.status !== "paid" || purchase.licenseStatus !== "active" ||
          Date.now() >= purchase.purchasedAt.getTime() + 7 * 24 * 60 * 60 * 1000
        ) {
          throw new Error("This purchase is not eligible for a refund.");
        }
        await client.queryArray`
          INSERT INTO refund_operations (id, purchase_id, stripe_idempotency_key, status)
          VALUES (${refundId}, ${purchaseId}, ${idempotencyKey}, 'pending')
        `;
        row = { id: refundId, stripeRefundId: null, status: "pending", key: idempotencyKey };
      } else if (row.status === "failed") {
        await client.queryArray`
          UPDATE refund_operations SET status = 'pending', error_code = NULL, updated_at = now()
          WHERE id = ${row.id}
        `;
        row.status = "pending";
      }
      return {
        id: row.id,
        purchase,
        idempotencyKey: row.key,
        refundId: row.stripeRefundId,
        status: row.status,
      };
    });
  }

  async completeRefund(
    purchaseId: string,
    status: RefundStatus,
    stripeRefundId?: string,
  ): Promise<void> {
    await withTransaction(async (client) => {
      await client.queryArray`
        UPDATE refund_operations SET status = ${status},
          stripe_refund_id = COALESCE(${stripeRefundId ?? null}, stripe_refund_id),
          updated_at = now()
        WHERE purchase_id = ${purchaseId}
      `;
      if (status === "succeeded") {
        const purchase = await client.queryObject<{ licenseId: string }>`
          UPDATE purchases SET status = 'refunded', updated_at = now()
          WHERE id = ${purchaseId} RETURNING license_id AS "licenseId"
        `;
        const licenseId = purchase.rows[0]?.licenseId;
        if (licenseId) {
          const prior = await client.queryObject<{ status: string }>`
            SELECT status FROM licenses WHERE id = ${licenseId} FOR UPDATE
          `;
          if (prior.rows[0]?.status !== "revoked") {
            await client.queryArray`
              UPDATE licenses SET status = 'revoked', revocation_reason = 'refund',
                revoked_at = now() WHERE id = ${licenseId}
            `;
            await client.queryArray`
              INSERT INTO license_audit_events (
                id, license_id, action, reason, previous_status, new_status
              ) VALUES (
                ${crypto.randomUUID()}, ${licenseId}, 'revoke', 'refund', ${prior.rows[0]?.status},
                'revoked'
              )
            `;
          }
        }
      }
    });
  }

  async applyStripeRefund(
    eventId: string,
    eventType: string,
    paymentIntentId: string,
  ): Promise<void> {
    await withTransaction(async (client) => {
      const rows = await client.queryObject<
        { purchaseId: string; licenseId: string; status: string }
      >`
        SELECT p.id AS "purchaseId", l.id AS "licenseId", l.status
        FROM purchases p JOIN licenses l ON l.id = p.license_id
        WHERE p.payment_intent_id = ${paymentIntentId} FOR UPDATE OF p, l
      `;
      const row = rows.rows[0];
      if (!row) throw new Error("Purchase for Stripe refund event is not available yet.");
      const inserted = await client.queryObject<{ eventId: string }>`
        INSERT INTO processed_stripe_events (event_id, event_type)
        VALUES (${eventId}, ${eventType}) ON CONFLICT DO NOTHING RETURNING event_id AS "eventId"
      `;
      if (!inserted.rows.length) return;
      const state = eventType === "charge.dispute.created" ? "disputed" : "refunded";
      await client.queryArray`
        UPDATE purchases SET status = ${state}, updated_at = now() WHERE id = ${row.purchaseId}
      `;
      await client.queryArray`
        UPDATE licenses SET status = 'revoked', revocation_reason = ${state},
          revoked_at = COALESCE(revoked_at, now()) WHERE id = ${row.licenseId}
      `;
      await client.queryArray`
        INSERT INTO license_audit_events (
          id, license_id, action, reason, previous_status, new_status
        ) VALUES (
          ${crypto.randomUUID()}, ${row.licenseId}, 'revoke', ${state}, ${row.status}, 'revoked'
        )
      `;
    });
  }

  async listLicenses(search: string): Promise<AdminLicenseRecord[]> {
    return await withConnection(async (client) => {
      const result = await client.queryObject<Record<string, unknown>>({
        text: `SELECT l.id, l.email, l.status, l.max_devices AS "maxDevices",
            l.created_at AS "createdAt", l.revoked_at AS "revokedAt",
            l.revocation_reason AS "revocationReason",
            (SELECT count(*)::int FROM activations a WHERE a.license_id = l.id) AS "activationCount"
          FROM licenses l WHERE lower(l.email) LIKE lower($1)
          ORDER BY l.created_at DESC LIMIT 200`,
        args: [`%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`],
      });
      return result.rows.map((row) => ({
        id: String(row.id),
        email: String(row.email),
        status: row.status as AdminLicenseRecord["status"],
        maxDevices: Number(row.maxDevices),
        createdAt: new Date(row.createdAt as string | number | Date),
        revokedAt: row.revokedAt ? new Date(row.revokedAt as string | number | Date) : null,
        revocationReason: row.revocationReason ? String(row.revocationReason) : null,
        activationCount: Number(row.activationCount),
      }));
    });
  }

  async listActivations(licenseId: string): Promise<AdminActivationRecord[]> {
    return await withConnection(async (client) => {
      const result = await client.queryObject<Record<string, unknown>>`
        SELECT id, device_hash AS "deviceHash", first_seen_at AS "firstSeenAt",
          last_seen_at AS "lastSeenAt"
        FROM activations WHERE license_id = ${licenseId}
        ORDER BY last_seen_at DESC
      `;
      return result.rows.map((row) => ({
        id: String(row.id),
        deviceHash: String(row.deviceHash),
        firstSeenAt: new Date(row.firstSeenAt as string | number | Date),
        lastSeenAt: new Date(row.lastSeenAt as string | number | Date),
      }));
    });
  }

  async revokeLicense(id: string, adminEmail: string, reason: string): Promise<void> {
    await withTransaction(async (client) => {
      const current = await client.queryObject<{ status: string }>`
        SELECT status FROM licenses WHERE id = ${id} FOR UPDATE
      `;
      const previous = current.rows[0]?.status;
      if (!previous) throw new Error("License not found.");
      await client.queryArray`
        UPDATE licenses SET status = 'revoked', revocation_reason = ${reason}, revoked_at = now()
        WHERE id = ${id}
      `;
      await client.queryArray`
        INSERT INTO license_audit_events (
          id, license_id, admin_email, action, reason, previous_status, new_status
        ) VALUES (
          ${crypto.randomUUID()}, ${id}, ${adminEmail}, 'revoke', ${reason}, ${previous}, 'revoked'
        )
      `;
    });
  }

  async restoreLicense(id: string, adminEmail: string, reason: string): Promise<void> {
    await withTransaction(async (client) => {
      const current = await client.queryObject<{ status: string; purchaseStatus: string }>`
        SELECT l.status, p.status AS "purchaseStatus"
        FROM licenses l JOIN purchases p ON p.license_id = l.id
        WHERE l.id = ${id} FOR UPDATE OF l, p
      `;
      const previous = current.rows[0]?.status;
      if (!previous) throw new Error("License not found.");
      if (current.rows[0].purchaseStatus !== "paid") {
        throw new Error("A refunded or disputed license cannot be restored.");
      }
      await client.queryArray`
        UPDATE licenses SET status = 'active', revocation_reason = NULL, revoked_at = NULL
        WHERE id = ${id}
      `;
      await client.queryArray`
        INSERT INTO license_audit_events (
          id, license_id, admin_email, action, reason, previous_status, new_status
        ) VALUES (
          ${crypto.randomUUID()}, ${id}, ${adminEmail}, 'restore', ${reason}, ${previous}, 'active'
        )
      `;
    });
  }

  async resetActivation(
    licenseId: string,
    activationId: string,
    adminEmail: string,
  ): Promise<void> {
    await withTransaction(async (client) => {
      const result = await client.queryObject<{ deviceHash: string }>`
        DELETE FROM activations WHERE id = ${activationId} AND license_id = ${licenseId}
        RETURNING device_hash AS "deviceHash"
      `;
      if (!result.rows.length) throw new Error("Activation not found.");
      await client.queryArray`
        INSERT INTO license_audit_events (id, license_id, admin_email, action, details)
        VALUES (
          ${crypto.randomUUID()}, ${licenseId}, ${adminEmail}, 'reset-device',
          jsonb_build_object('deviceHash', ${result.rows[0].deviceHash})
        )
      `;
    });
  }
}

export function createPostgresLicenseStore(): LicenseStore {
  getDatabasePool();
  return new PostgresLicenseStore();
}

interface MemoryCode {
  email: string;
  role: UserRole;
  hash: string;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
}

interface MemorySession {
  email: string;
  role: UserRole;
  expiresAt: number;
}

interface MemoryActivation {
  id: string;
  deviceHash: string;
  lastSeenAt: Date;
}

export class MemoryLicenseStore implements LicenseStore {
  readonly purchases = new Map<string, PurchaseRecord>();
  readonly revealClaims = new Map<string, { hash: string; expiresAt: number; claimed: boolean }>();
  readonly activations = new Map<string, Map<string, MemoryActivation>>();
  readonly codes: MemoryCode[] = [];
  readonly sessions = new Map<string, MemorySession>();
  readonly refunds = new Map<string, RefundRecord>();
  readonly audits: { licenseId: string; adminEmail: string; action: string; reason: string }[] = [];
  readonly emailDeliveries = new Map<string, "sending" | "sent" | "failed">();
  private readonly emailDeliveryAt = new Map<string, number>();

  async fulfill(input: FulfillmentInput): Promise<{ purchase: PurchaseRecord; created: boolean }> {
    const existing = this.purchases.get(input.stripeSessionId);
    if (existing) return { purchase: existing, created: false };
    const purchase: PurchaseRecord = {
      id: input.purchaseId,
      licenseId: input.licenseId,
      stripeSessionId: input.stripeSessionId,
      paymentIntentId: input.paymentIntentId,
      email: input.email,
      amountTotal: input.amountTotal,
      currency: input.currency,
      status: "paid",
      receiptUrl: input.receiptUrl,
      purchasedAt: input.purchasedAt,
      licenseStatus: "active",
      maxDevices: 2,
      encryptedKey: input.encryptedKey,
      keyHash: input.keyHash,
    };
    this.purchases.set(purchase.stripeSessionId, purchase);
    this.revealClaims.set(purchase.stripeSessionId, {
      hash: input.claimHash,
      expiresAt: Date.now() + 86_400_000,
      claimed: false,
    });
    return { purchase, created: true };
  }

  async getPurchaseBySession(sessionId: string): Promise<PurchaseRecord | null> {
    return this.purchases.get(sessionId) ?? null;
  }

  async startEmailDelivery(
    licenseId: string,
    template: string,
    _recipient: string,
  ): Promise<boolean> {
    const key = `${licenseId}:${template}`;
    const status = this.emailDeliveries.get(key);
    const updatedAt = this.emailDeliveryAt.get(key) ?? 0;
    if (
      status === "sending" && Date.now() - updatedAt < 300_000 ||
      status === "sent" &&
        (!template.startsWith("key-recovery") || Date.now() - updatedAt < 300_000) ||
      status === "failed" && Date.now() - updatedAt < 60_000
    ) {
      return false;
    }
    this.emailDeliveries.set(key, "sending");
    this.emailDeliveryAt.set(key, Date.now());
    return true;
  }

  async finishEmailDelivery(
    licenseId: string,
    template: string,
    status: "sent" | "failed",
  ): Promise<void> {
    const key = `${licenseId}:${template}`;
    this.emailDeliveries.set(key, status);
    this.emailDeliveryAt.set(key, Date.now());
  }

  async emailWasSent(licenseId: string, template: string): Promise<boolean> {
    return this.emailDeliveries.get(`${licenseId}:${template}`) === "sent";
  }

  async getPurchasesByEmail(email: string): Promise<PurchaseRecord[]> {
    return [...this.purchases.values()].filter((purchase) =>
      purchase.email.toLowerCase() === email.toLowerCase()
    ).sort((left, right) => right.purchasedAt.getTime() - left.purchasedAt.getTime());
  }

  async claimKeyReveal(sessionId: string, claimHash: string): Promise<PurchaseRecord | null> {
    const claim = this.revealClaims.get(sessionId);
    const purchase = this.purchases.get(sessionId);
    if (
      !claim || !purchase || claim.hash !== claimHash || claim.claimed ||
      claim.expiresAt <= Date.now() || purchase.status !== "paid"
    ) return null;
    claim.claimed = true;
    return purchase;
  }

  async getPurchaseByLicenseKey(keyHash: string): Promise<PurchaseRecord | null> {
    return [...this.purchases.values()].find((purchase) => purchase.keyHash === keyHash) ?? null;
  }

  async activate(licenseId: string, deviceHash: string): Promise<ActivationRecord | null> {
    const purchase = [...this.purchases.values()].find((item) => item.licenseId === licenseId);
    if (!purchase || purchase.licenseStatus !== "active" || purchase.status !== "paid") return null;
    const devices = this.activations.get(licenseId) ?? new Map<string, MemoryActivation>();
    if (!devices.has(deviceHash) && devices.size >= purchase.maxDevices) return null;
    devices.set(deviceHash, {
      id: devices.get(deviceHash)?.id ?? crypto.randomUUID(),
      deviceHash,
      lastSeenAt: new Date(),
    });
    this.activations.set(licenseId, devices);
    return { licenseId, deviceHash, maxDevices: purchase.maxDevices };
  }

  async refresh(licenseId: string, deviceHash: string): Promise<ActivationRecord | null> {
    return await this.activate(licenseId, deviceHash);
  }

  async hasPurchase(email: string): Promise<boolean> {
    return (await this.getPurchasesByEmail(email)).length > 0;
  }

  async createAuthCode(email: string, role: UserRole, codeHash: string): Promise<boolean> {
    const recent = this.codes.filter((item) =>
      item.email === email && item.role === role && item.expiresAt > Date.now() - 3_600_000
    );
    if (recent.length >= 5) return false;
    for (const code of this.codes) {
      if (code.email === email && code.role === role && !code.consumed) code.consumed = true;
    }
    this.codes.push({
      email,
      role,
      hash: codeHash,
      expiresAt: Date.now() + 600_000,
      attempts: 0,
      consumed: false,
    });
    return true;
  }

  async verifyAuthCode(email: string, role: UserRole, codeHash: string): Promise<boolean> {
    const code = [...this.codes].reverse().find((item) =>
      item.email === email && item.role === role && !item.consumed && item.expiresAt > Date.now() &&
      item.attempts < 5
    );
    if (!code) return false;
    if (code.hash !== codeHash) {
      code.attempts++;
      return false;
    }
    code.consumed = true;
    return true;
  }

  async saveSession(
    tokenHash: string,
    email: string,
    role: UserRole,
    expiresAt: Date,
  ): Promise<void> {
    this.sessions.set(tokenHash, { email, role, expiresAt: expiresAt.getTime() });
  }

  async getSession(tokenHash: string): Promise<{ email: string; role: UserRole } | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= Date.now()) return null;
    return { email: session.email, role: session.role };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async beginRefund(
    purchaseId: string,
    idempotencyKey: string,
    refundId: string,
  ): Promise<RefundRecord> {
    const purchase = [...this.purchases.values()].find((item) => item.id === purchaseId);
    if (!purchase) throw new Error("Purchase not found.");
    const previous = this.refunds.get(purchaseId);
    if (previous) {
      if (previous.status === "failed") previous.status = "pending";
      return previous;
    }
    if (
      purchase.status !== "paid" || purchase.licenseStatus !== "active" ||
      Date.now() >= purchase.purchasedAt.getTime() + 7 * 24 * 60 * 60 * 1000
    ) throw new Error("This purchase is not eligible for a refund.");
    const refund: RefundRecord = {
      id: refundId,
      purchase,
      idempotencyKey,
      refundId: null,
      status: "pending",
    };
    this.refunds.set(purchaseId, refund);
    return refund;
  }

  async completeRefund(
    purchaseId: string,
    status: RefundStatus,
    stripeRefundId?: string,
  ): Promise<void> {
    const refund = this.refunds.get(purchaseId);
    if (refund) {
      refund.status = status;
      refund.refundId = stripeRefundId ?? refund.refundId;
      if (status === "succeeded") {
        refund.purchase.status = "refunded";
        refund.purchase.licenseStatus = "revoked";
      }
    }
  }

  async applyStripeRefund(
    _eventId: string,
    eventType: string,
    paymentIntentId: string,
  ): Promise<void> {
    const purchase = [...this.purchases.values()].find((item) =>
      item.paymentIntentId === paymentIntentId
    );
    if (!purchase) return;
    purchase.status = eventType === "charge.dispute.created" ? "disputed" : "refunded";
    purchase.licenseStatus = "revoked";
  }

  async listActivations(licenseId: string): Promise<AdminActivationRecord[]> {
    return [...(this.activations.get(licenseId)?.values() ?? [])].map((activation) => ({
      id: activation.id,
      deviceHash: activation.deviceHash,
      firstSeenAt: activation.lastSeenAt,
      lastSeenAt: activation.lastSeenAt,
    }));
  }

  async listLicenses(search: string): Promise<AdminLicenseRecord[]> {
    const matches = [...this.purchases.values()].filter((purchase) =>
      !search || purchase.email.toLowerCase().includes(search.toLowerCase())
    ).sort((left, right) => right.purchasedAt.getTime() - left.purchasedAt.getTime()).slice(0, 200);
    return matches.map((purchase) => ({
      id: purchase.licenseId,
      email: purchase.email,
      status: purchase.licenseStatus,
      maxDevices: purchase.maxDevices,
      createdAt: purchase.purchasedAt,
      revokedAt: purchase.licenseStatus === "revoked" ? new Date() : null,
      revocationReason: purchase.status === "refunded" ? "refund" : null,
      activationCount: this.activations.get(purchase.licenseId)?.size ?? 0,
    }));
  }

  async revokeLicense(id: string, adminEmail: string, reason: string): Promise<void> {
    const purchase = [...this.purchases.values()].find((item) => item.licenseId === id);
    if (!purchase) throw new Error("License not found.");
    purchase.licenseStatus = "revoked";
    this.audits.push({ licenseId: id, adminEmail, action: "revoke", reason });
  }

  async restoreLicense(id: string, adminEmail: string, reason: string): Promise<void> {
    const purchase = [...this.purchases.values()].find((item) => item.licenseId === id);
    if (!purchase) throw new Error("License not found.");
    if (purchase.status !== "paid") {
      throw new Error("A refunded or disputed license cannot be restored.");
    }
    purchase.licenseStatus = "active";
    this.audits.push({ licenseId: id, adminEmail, action: "restore", reason });
  }

  async resetActivation(
    licenseId: string,
    activationId: string,
    adminEmail: string,
  ): Promise<void> {
    const devices = this.activations.get(licenseId);
    const entry = [...(devices?.entries() ?? [])].find(([, activation]) =>
      activation.id === activationId
    );
    if (!devices || !entry) throw new Error("Activation not found.");
    devices.delete(entry[0]);
    this.audits.push({
      licenseId,
      adminEmail,
      action: "reset-device",
      reason: entry[0],
    });
  }
}

let activeStore: LicenseStore | undefined;

export function getLicenseStore(): LicenseStore {
  if (activeStore) return activeStore;
  if (Deno.env.get("DATABASE_URL")) {
    activeStore = createPostgresLicenseStore();
    return activeStore;
  }
  if (
    Deno.env.get("PAYMENT_PROVIDER") === "mock" &&
    Deno.env.get("DENO_DEPLOYMENT_ID") === undefined
  ) {
    activeStore = new MemoryLicenseStore();
    return activeStore;
  }
  throw new Error("DATABASE_URL is required for website license operations.");
}

export function setLicenseStoreForTests(store: LicenseStore | undefined): void {
  activeStore = store;
}

CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY,
  key_hash text NOT NULL UNIQUE,
  encrypted_key text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  revocation_reason text,
  max_devices smallint NOT NULL DEFAULT 2 CHECK (max_devices BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY,
  license_id uuid NOT NULL UNIQUE REFERENCES licenses(id),
  stripe_session_id text NOT NULL UNIQUE,
  payment_intent_id text UNIQUE,
  email text NOT NULL,
  amount_total integer NOT NULL CHECK (amount_total > 0),
  currency char(3) NOT NULL,
  status text NOT NULL CHECK (status IN ('paid', 'refunded', 'disputed')),
  receipt_url text,
  purchased_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchases_email_purchased_at_idx
  ON purchases (email, purchased_at DESC);

CREATE TABLE IF NOT EXISTS activations (
  id uuid PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  device_hash text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (license_id, device_hash)
);

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS key_reveal_claims (
  purchase_id uuid PRIMARY KEY REFERENCES purchases(id) ON DELETE CASCADE,
  claim_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz
);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id uuid PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  template text NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (license_id, template)
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('customer', 'admin')),
  code_hash text NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_codes_lookup_idx
  ON auth_codes (email, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('customer', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS refund_operations (
  id uuid PRIMARY KEY,
  purchase_id uuid NOT NULL UNIQUE REFERENCES purchases(id),
  stripe_idempotency_key text NOT NULL UNIQUE,
  stripe_refund_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS license_audit_events (
  id uuid PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES licenses(id),
  admin_email text,
  action text NOT NULL,
  reason text,
  previous_status text,
  new_status text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS license_audit_events_license_created_idx
  ON license_audit_events (license_id, created_at DESC);

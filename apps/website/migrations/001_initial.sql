CREATE TABLE IF NOT EXISTS donations (
  id uuid PRIMARY KEY,
  stripe_session_id text NOT NULL UNIQUE,
  payment_intent_id text NOT NULL UNIQUE,
  email text NOT NULL,
  amount_total integer NOT NULL CHECK (amount_total >= 50),
  currency char(3) NOT NULL CHECK (currency = 'usd'),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'disputed')),
  receipt_url text,
  donated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS donations_email_donated_at_idx
  ON donations (email, donated_at DESC);

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_preferences (
  email text PRIMARY KEY,
  marketing_opt_in boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_codes_lookup_idx
  ON auth_codes (email, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_expiration_idx
  ON auth_sessions (expires_at);

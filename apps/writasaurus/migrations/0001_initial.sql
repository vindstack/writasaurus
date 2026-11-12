CREATE TABLE donations (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT NOT NULL UNIQUE,
  payment_intent_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  amount_total INTEGER NOT NULL CHECK (amount_total >= 50),
  currency TEXT NOT NULL CHECK (currency = 'usd'),
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'disputed')),
  receipt_url TEXT,
  donated_at INTEGER NOT NULL
);

CREATE INDEX donations_email_donated_at_idx ON donations (email, donated_at DESC);

CREATE TABLE processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE email_preferences (
  email TEXT PRIMARY KEY,
  marketing_opt_in INTEGER NOT NULL DEFAULT 1 CHECK (marketing_opt_in IN (0, 1)),
  updated_at INTEGER NOT NULL
);

CREATE TABLE auth_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX auth_codes_lookup_idx ON auth_codes (email, created_at DESC);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX auth_sessions_expiration_idx ON auth_sessions (expires_at);

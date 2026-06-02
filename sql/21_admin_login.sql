-- Admin login codes and login waitlist tables
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE UNIQUE INDEX IF NOT EXISTS

-- admin_login_codes: stores hashed one-time codes for admin email login
CREATE TABLE IF NOT EXISTS admin_login_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (char_length(email) <= 320),
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alc_email_created
  ON admin_login_codes (email, created_at);

ALTER TABLE admin_login_codes ENABLE ROW LEVEL SECURITY;
-- No RLS policies = no public access. Service role only.
REVOKE ALL ON admin_login_codes FROM anon, authenticated;

-- login_waitlist: stores non-admin emails that requested access
CREATE TABLE IF NOT EXISTS login_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (char_length(email) <= 320),
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index on normalized (lowercase) email
CREATE UNIQUE INDEX IF NOT EXISTS idx_lw_lower_email
  ON login_waitlist (lower(email));

ALTER TABLE login_waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_waitlist FROM anon, authenticated;

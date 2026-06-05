-- Email OTP codes for Teskeið user auth (passwordless email-code flow)
-- Separate from admin_login_codes — different security scope
-- Idempotent: all statements use IF NOT EXISTS
--
-- gen_random_uuid() is a Postgres 13+ built-in (no extension needed).
-- Supabase runs PG 15. sql/21_admin_login.sql uses the same function without issues.

CREATE TABLE IF NOT EXISTS auth_email_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL CHECK (char_length(email) <= 320),
  code_hash  text        NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  attempts   int         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Supports rate-limit check (latest codes per email) and cleanup
CREATE INDEX IF NOT EXISTS idx_aec_email_created
  ON auth_email_codes (email, created_at DESC);

-- Supports fast lookup of active (unused) codes during verification
CREATE INDEX IF NOT EXISTS idx_aec_active
  ON auth_email_codes (email, expires_at)
  WHERE used_at IS NULL;

ALTER TABLE auth_email_codes ENABLE ROW LEVEL SECURITY;

-- No policies = service role only, no public or authenticated access
REVOKE ALL ON auth_email_codes FROM anon, authenticated;

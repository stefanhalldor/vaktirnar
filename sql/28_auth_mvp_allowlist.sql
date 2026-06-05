-- Allowlist for Teskeið auth MVP during hidden testing phase
-- Only emails in this table may receive login codes or create sessions.
-- Admin inserts rows directly via SQL:
--   insert into auth_mvp_allowlist (email, note)
--   values ('name@example.com', 'test user')
--   on conflict (email) do nothing;
-- Idempotent: all statements use IF NOT EXISTS / CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS auth_mvp_allowlist (
  email      text        PRIMARY KEY CHECK (email = lower(email)),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auth_mvp_allowlist ENABLE ROW LEVEL SECURITY;

-- No policies = service role only, no public or authenticated access
REVOKE ALL ON auth_mvp_allowlist FROM anon, authenticated;

-- Migration: 45_recent_read_state
-- Creates server-side read-state for the Nýlegt section on /auth-mvp/heim.
--
-- Access model:
--   - Only service_role server code reads/writes this table.
--   - No grants to anon or authenticated — all access goes through server actions.
--   - No RLS policies needed beyond ENABLE: service_role bypasses RLS, and
--     actor-visibility enforcement is handled in the server action before upsert.
--
-- Rollback: DROP TABLE IF EXISTS public.loan_recent_read_state;

CREATE TABLE IF NOT EXISTS public.loan_recent_read_state (
  user_id  uuid        NOT NULL,
  loan_id  uuid        NOT NULL REFERENCES public.loan_items(id) ON DELETE CASCADE,
  read_key text        NOT NULL CHECK (read_key ~ '^[0-9a-f]{32}$'),
  read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, loan_id)
);

CREATE INDEX IF NOT EXISTS loan_recent_read_state_user_read_at_idx
  ON public.loan_recent_read_state (user_id, read_at DESC);

ALTER TABLE public.loan_recent_read_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.loan_recent_read_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_recent_read_state TO service_role;

-- =============================================================================
-- sql/39_legacy_access.sql
-- Schema + grants for Krakkavaktin legacy entitlement table.
--
-- DEPLOYMENT ORDER — must be followed exactly:
--   1. Run this migration on the target Postgres instance FIRST (schema only).
--   2. Run the production read-only preflight queries (separate step, requires
--      Stebbi approval — reads user IDs and display names from profiles and
--      parent_child; the allowlist-overlap join also reads auth.users.email
--      internally even if email values are not output to the console).
--   3. Stebbi confirms Q1 and Q3 (legacy user definition and test-account
--      exclusions).
--   4. Apply sql/40_legacy_access_backfill.sql AFTER Stebbi's confirmation.
--   5. Only THEN deploy updated application code.
--
-- WARNING: If application code is deployed before legacy_access is populated,
-- all Krakkavaktin legacy users will be locked out (guardLegacyAccess returns
-- 404 for every user with no row in this table).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.legacy_access;
--   No cascade to other tables. No dependent views or RPCs.
--
-- This migration is schema + grants only — no rows are inserted or modified.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.legacy_access (
  user_id    uuid        PRIMARY KEY
                         REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.legacy_access ENABLE ROW LEVEL SECURITY;

-- No RLS policies: service_role bypasses RLS via BYPASSRLS attribute.
-- authenticated and anon clients have no table-level privilege and therefore
-- cannot read, insert, update or delete rows regardless of RLS state.
REVOKE ALL ON public.legacy_access FROM PUBLIC, anon, authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.legacy_access TO service_role;

COMMENT ON TABLE public.legacy_access IS
  'Allowlist for Krakkavaktin legacy users. '
  'Managed by service_role only via SQL or sql/40 backfill migration. '
  'Never exposed to authenticated Supabase clients — '
  'guardLegacyAccess() reads it via the service_role client only.';

COMMIT;

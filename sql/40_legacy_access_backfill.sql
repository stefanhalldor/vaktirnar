-- =============================================================================
-- sql/40_legacy_access_backfill.sql
-- Backfill: insert confirmed Krakkavaktin legacy users into public.legacy_access.
--
-- Preflight basis:
--   Run date    : 2026-06-08
--   Q1 confirmed: all users with ≥1 row in parent_child are legacy users.
--   Q3 confirmed: exclusion list is empty — no user_ids excluded.
--   Q4          : 1 candidate, 1 also on auth_mvp_allowlist, 0 not on allowlist.
--   Confirmed by: Stebbi, 8. júní 2026
--
-- Candidates inserted: 1
--   9321ee0e-910d-4ac8-ba95-dab905bda264
--
-- Idempotent: ON CONFLICT (user_id) DO NOTHING.
-- Safe to re-run: no row is modified or deleted if already present.
--
-- DEPLOYMENT ORDER (see sql/39_legacy_access.sql for full context):
--   1. sql/39 already applied (schema + grants).    ✓ Done 2026-06-08
--   2. Preflight Q1–Q4 run and confirmed by Stebbi. ✓ Done 2026-06-08
--   3. Apply THIS migration (sql/40).
--   4. Only THEN deploy updated application code.
--
-- WARNING: Do not deploy application code before this migration is applied.
-- guardLegacyAccess() returns 404 for any user_id not in legacy_access.
--
-- Rollback:
--   DELETE FROM public.legacy_access
--   WHERE user_id = '9321ee0e-910d-4ac8-ba95-dab905bda264';
-- =============================================================================

BEGIN;

INSERT INTO public.legacy_access (user_id)
VALUES ('9321ee0e-910d-4ac8-ba95-dab905bda264')
ON CONFLICT (user_id) DO NOTHING;

COMMIT;

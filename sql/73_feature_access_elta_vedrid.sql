-- Migration 73: widen feature_access CHECK constraint to allow 'ferdalagid' and 'elta-vedrid'.
--
-- 'ferdalagid' was added to guard.ts and admin API (dirty worktree) but never in a migration.
-- 'elta-vedrid' is the new per-user gate for the Elta veðrið validation view.
--
-- Do not run this migration until Stebbi gives explicit Supabase approval.
--
-- Rollback:
--   ALTER TABLE public.feature_access
--     DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;
--   ALTER TABLE public.feature_access
--     ADD CONSTRAINT feature_access_feature_key_check
--     CHECK (feature_key IN ('umonnun', 'tengsl', 'facebook-oauth', 'vedrid'));

BEGIN;

ALTER TABLE public.feature_access
  DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;

ALTER TABLE public.feature_access
  ADD CONSTRAINT feature_access_feature_key_check
  CHECK (feature_key IN ('umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'ferdalagid', 'elta-vedrid'));

COMMIT;

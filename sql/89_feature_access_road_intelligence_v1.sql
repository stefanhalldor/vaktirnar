-- sql/89_feature_access_road_intelligence_v1.sql
-- Adds 'road-intelligence-v1' to the feature_access_feature_key_check constraint.
-- Idempotent: drops and recreates the constraint.
--
-- 'road-intelligence-v1' is the per-user gate for the experimental Road Intelligence
-- panel on /auth-mvp/vedrid. It is gated behind ROAD_INTELLIGENCE_V1_ENABLED=true
-- (env var) AND a feature_access row — there is no graduation path for this feature.
-- Public /vedrid never sees Road Intelligence UI regardless of this constraint.
--
-- Run AFTER sql/88 (status_filter_mode must already be in place).
-- Do not run this migration until Stebbi gives explicit Supabase approval.
--
-- RLS/grants: no new table, no RLS change. The existing feature_access table
-- is service-role only. Adding a new allowed value to the CHECK constraint does
-- not change any grant or policy.
--
-- Rollback: see bottom of file.

BEGIN;

ALTER TABLE public.feature_access
  DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;

ALTER TABLE public.feature_access
  ADD CONSTRAINT feature_access_feature_key_check
  CHECK (feature_key IN (
    'umonnun',
    'tengsl',
    'facebook-oauth',
    'vedrid',
    'ferdalagid',
    'elta-vedrid',
    'weather-provider-vedurstofan',
    'weather-pulse',
    'weather-provider-vegagerdin',
    'road-intelligence-v1'
  ));

COMMIT;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- To undo (removes road-intelligence-v1 — will fail if rows exist with that key):
--
-- BEGIN;
-- ALTER TABLE public.feature_access
--   DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;
-- ALTER TABLE public.feature_access
--   ADD CONSTRAINT feature_access_feature_key_check
--   CHECK (feature_key IN (
--     'umonnun', 'tengsl', 'facebook-oauth', 'vedrid',
--     'ferdalagid', 'elta-vedrid', 'weather-provider-vedurstofan',
--     'weather-pulse', 'weather-provider-vegagerdin'
--   ));
-- COMMIT;

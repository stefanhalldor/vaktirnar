-- sql/80_feature_access_weather_provider_vegagerdin.sql
-- Adds 'weather-provider-vegagerdin' to the feature_access_feature_key_check constraint.
-- Idempotent: drops and recreates the constraint.
--
-- 'weather-provider-vegagerdin' is the per-user gate for Vegagerðin current-measurement
-- provider access. It follows the same graduation pattern as 'weather-provider-vedurstofan':
--   WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true → per-user gate (feature_access row required)
--   unset/false/other                                → open to all weather users (graduation path)
--
-- Run AFTER sql/79 (weather-pulse must already be in the constraint).
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
    'weather-provider-vegagerdin'
  ));

COMMIT;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- To undo (removes weather-provider-vegagerdin — will fail if rows exist):
--
-- BEGIN;
-- ALTER TABLE public.feature_access
--   DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;
-- ALTER TABLE public.feature_access
--   ADD CONSTRAINT feature_access_feature_key_check
--   CHECK (feature_key IN (
--     'umonnun', 'tengsl', 'facebook-oauth', 'vedrid',
--     'ferdalagid', 'elta-vedrid', 'weather-provider-vedurstofan', 'weather-pulse'
--   ));
-- COMMIT;

-- sql/79_feature_access_weather_pulse.sql
-- Adds 'weather-pulse' to the feature_access_feature_key_check constraint.
-- Idempotent: drops and recreates the constraint.
-- Run AFTER sql/78 (chat tables must exist for context, though not a hard DB dep).
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
    'weather-pulse'
  ));

COMMIT;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- To undo (removes weather-pulse from allowed keys — will fail if rows exist):
--
-- BEGIN;
-- ALTER TABLE public.feature_access
--   DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;
-- ALTER TABLE public.feature_access
--   ADD CONSTRAINT feature_access_feature_key_check
--   CHECK (feature_key IN (
--     'umonnun', 'tengsl', 'facebook-oauth', 'vedrid',
--     'ferdalagid', 'elta-vedrid', 'weather-provider-vedurstofan'
--   ));
-- COMMIT;

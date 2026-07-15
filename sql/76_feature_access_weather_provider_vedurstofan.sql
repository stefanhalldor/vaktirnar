-- Migration 76: widen feature_access CHECK constraint to allow 'weather-provider-vedurstofan'.
--
-- 'weather-provider-vedurstofan' is the per-user gate for Veðurstofan travel-layer access.
-- It is provider-specific so that Vegagerðin can later get its own independent key
-- ('weather-provider-vegagerdin') without ambiguity.
-- 'elta-vedrid' remains in the constraint for the station validator/explorer route.
--
-- Do not run this migration until Stebbi gives explicit Supabase approval.
--
-- Rollback:
--   ALTER TABLE public.feature_access
--     DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;
--   ALTER TABLE public.feature_access
--     ADD CONSTRAINT feature_access_feature_key_check
--     CHECK (feature_key IN ('umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'ferdalagid', 'elta-vedrid'));

BEGIN;

ALTER TABLE public.feature_access
  DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;

ALTER TABLE public.feature_access
  ADD CONSTRAINT feature_access_feature_key_check
  CHECK (feature_key IN ('umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'ferdalagid', 'elta-vedrid', 'weather-provider-vedurstofan'));

COMMIT;

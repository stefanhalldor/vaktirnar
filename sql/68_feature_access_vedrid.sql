-- Migration 68: widen feature_access CHECK constraint to allow 'vedrid'.
--
-- Rollback:
--   ALTER TABLE public.feature_access
--     DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;
--   ALTER TABLE public.feature_access
--     ADD CONSTRAINT feature_access_feature_key_check
--     CHECK (feature_key IN ('umonnun', 'tengsl', 'facebook-oauth'));

BEGIN;

ALTER TABLE public.feature_access
  DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;

ALTER TABLE public.feature_access
  ADD CONSTRAINT feature_access_feature_key_check
  CHECK (feature_key IN ('umonnun', 'tengsl', 'facebook-oauth', 'vedrid'));

COMMIT;

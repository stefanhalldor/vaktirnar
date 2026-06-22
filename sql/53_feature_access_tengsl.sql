-- Migration 53: widen feature_access constraint to allow 'tengsl' feature key.
--
-- Only changes the check constraint on feature_access.
-- Does NOT touch tables, data, functions, grants, or RLS.
--
-- Rollback:
--   ALTER TABLE public.feature_access
--     DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;
--   ALTER TABLE public.feature_access
--     ADD CONSTRAINT feature_access_feature_key_check
--       CHECK (feature_key IN ('umonnun'));

BEGIN;

ALTER TABLE public.feature_access
  DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;

ALTER TABLE public.feature_access
  ADD CONSTRAINT feature_access_feature_key_check
    CHECK (feature_key IN ('umonnun', 'tengsl'));

COMMIT;

-- sql/91_feature_access_teskeid_routing_v1.sql
-- Adds the strict per-user Teskeið routing feature key to feature_access.
--
-- Runtime contract:
--   TESKEID_ROUTE_CANDIDATE_ENABLED=true is the global kill-switch, and
--   the authenticated user must also have feature_key = 'teskeid-routing-v1'.
--
-- This migration changes only the existing CHECK constraint. It does not add
-- tables, policies, grants, functions, user data, or route/travel data.
-- Existing RLS remains enabled and feature_access remains service-role only.
--
-- Do NOT run this migration until Stebbi explicitly chooses to do so.

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
    'road-intelligence-v1',
    'teskeid-routing-v1'
  ));

COMMIT;

-- Rollback (fails if teskeid-routing-v1 rows still exist):
-- BEGIN;
-- ALTER TABLE public.feature_access
--   DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;
-- ALTER TABLE public.feature_access
--   ADD CONSTRAINT feature_access_feature_key_check
--   CHECK (feature_key IN (
--     'umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'ferdalagid',
--     'elta-vedrid', 'weather-provider-vedurstofan', 'weather-pulse',
--     'weather-provider-vegagerdin', 'road-intelligence-v1'
--   ));
-- COMMIT;

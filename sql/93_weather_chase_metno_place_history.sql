-- sql/93_weather_chase_metno_place_history.sql
-- Extends the existing service-role-only met.no history table to the canonical
-- ROAD_MAP_PLACES used by the provider-neutral forecast comparison.
--
-- No user IDs, searches, routes or arbitrary coordinates are stored. Only the
-- fixed public place registry and provider forecast values are eligible.
--
-- IMPORTANT: Writing this migration does not apply it. Stebbi runs it manually.

BEGIN;

ALTER TABLE public.metno_point_forecasts_history
  DROP CONSTRAINT IF EXISTS metno_point_forecasts_history_target_type_check;

ALTER TABLE public.metno_point_forecasts_history
  ADD CONSTRAINT metno_point_forecasts_history_target_type_check
  CHECK (target_type IN ('vedurstofan_station', 'road_map_place'));

CREATE INDEX IF NOT EXISTS metno_point_forecasts_history_place_time_idx
  ON public.metno_point_forecasts_history (
    target_type,
    target_id,
    forecast_time,
    metno_updated_at DESC
  );

REVOKE ALL ON public.metno_point_forecasts_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metno_point_forecasts_history TO service_role;
ALTER TABLE public.metno_point_forecasts_history ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.metno_point_forecasts_history IS
  'Service-role-only met.no forecast cycles for fixed provider points and canonical ROAD_MAP_PLACES; no user data.';

COMMIT;

-- Recovery: remove road_map_place rows first, then restore the old constraint.
-- This is destructive for accumulated place history and requires explicit approval:
-- BEGIN;
-- DELETE FROM public.metno_point_forecasts_history WHERE target_type = 'road_map_place';
-- ALTER TABLE public.metno_point_forecasts_history
--   DROP CONSTRAINT IF EXISTS metno_point_forecasts_history_target_type_check;
-- ALTER TABLE public.metno_point_forecasts_history
--   ADD CONSTRAINT metno_point_forecasts_history_target_type_check
--   CHECK (target_type IN ('vedurstofan_station'));
-- DROP INDEX IF EXISTS public.metno_point_forecasts_history_place_time_idx;
-- COMMIT;

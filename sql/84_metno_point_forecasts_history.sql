-- sql/84_metno_point_forecasts_history.sql
-- Normalized history/cache table for met.no/Yr forecast rows at fixed provider points.
--
-- Purpose:
--   Stores structured met.no forecast data paired to specific provider station points
--   so that /vedrid scrubber and Yr comparison can read pre-normalized rows without
--   re-parsing raw weather_cache JSONB on every request.
--
-- First target: target_type = 'vedurstofan_station'
-- Generic shape allows later addition of 'vegagerdin_station' without a second table.
--
-- Read/write model:
--   - WRITE: written by service-role-only projector code after fetching met.no for a
--     specific station coordinate. weather_cache remains the upstream raw cache.
--     Conflict key: (target_type, target_id, metno_updated_at, forecast_time).
--     On conflict, updates all forecast columns and last_fetched_at.
--     first_fetched_at is preserved from the original insert.
--   - READ: /vedrid station detail and scrubber read pre-normalized rows instead of
--     parsing raw JSONB. Only fetch met.no for selected/visible stations, not all 280.
--
-- Access:
--   - service_role only. No anon or authenticated access.
--
-- Dependencies (must be applied before this migration):
--   sql/04_teskeid_schema.sql — defines public.teskeid_set_updated_at()
--   Migration order: numbered after sql/83; no dependency on sql/83 table content.
--
-- Do NOT run this migration without explicit Stebbi approval.

BEGIN;

CREATE TABLE IF NOT EXISTS public.metno_point_forecasts_history (
  target_type                  text          NOT NULL,
  target_id                    text          NOT NULL,
  target_name                  text,
  target_lat                   numeric(9, 6) NOT NULL,
  target_lon                   numeric(9, 6) NOT NULL,

  metno_updated_at             timestamptz   NOT NULL,
  forecast_time                timestamptz   NOT NULL,

  paired_provider              text,
  paired_provider_cycle_time   timestamptz,

  wind_speed_ms                numeric(6, 2),
  wind_direction_deg           numeric(6, 1),
  temperature_c                numeric(5, 1),
  precipitation_mm_per_hour    numeric(6, 2),
  weather_symbol_code          text,

  metno_cache_key              text,
  expires_at                   timestamptz,
  first_fetched_at             timestamptz   NOT NULL DEFAULT now(),
  last_fetched_at              timestamptz   NOT NULL,
  created_at                   timestamptz   NOT NULL DEFAULT now(),
  updated_at                   timestamptz   NOT NULL DEFAULT now(),

  PRIMARY KEY (target_type, target_id, metno_updated_at, forecast_time),

  CONSTRAINT metno_point_forecasts_history_target_type_check
    CHECK (target_type IN ('vedurstofan_station')),

  CONSTRAINT metno_point_forecasts_history_paired_provider_check
    CHECK (paired_provider IS NULL OR paired_provider IN ('vedurstofan'))
);

-- Explicit privilege grant — service_role only; no public or user access
REVOKE ALL ON public.metno_point_forecasts_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metno_point_forecasts_history TO service_role;

-- Enable RLS (no policy needed — REVOKE above handles access; service_role bypasses RLS)
ALTER TABLE public.metno_point_forecasts_history ENABLE ROW LEVEL SECURITY;

-- Target/cycle lookup index: primary read path for station detail + scrubber
CREATE INDEX IF NOT EXISTS metno_point_forecasts_history_target_cycle_idx
  ON public.metno_point_forecasts_history (
    target_type,
    target_id,
    paired_provider,
    paired_provider_cycle_time,
    forecast_time
  );

-- Forecast time index: useful for time-range queries across all points
CREATE INDEX IF NOT EXISTS metno_point_forecasts_history_forecast_time_idx
  ON public.metno_point_forecasts_history (forecast_time);

-- metno_updated_at index: used for retention cleanup and newest-cycle lookups
CREATE INDEX IF NOT EXISTS metno_point_forecasts_history_updated_at_idx
  ON public.metno_point_forecasts_history (metno_updated_at DESC);

-- updated_at trigger — reuses shared function from sql/04_teskeid_schema.sql
DROP TRIGGER IF EXISTS metno_point_forecasts_history_updated_at
  ON public.metno_point_forecasts_history;

CREATE TRIGGER metno_point_forecasts_history_updated_at
  BEFORE UPDATE ON public.metno_point_forecasts_history
  FOR EACH ROW
  EXECUTE FUNCTION public.teskeid_set_updated_at();

COMMIT;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- To undo (drops all met.no forecast history data):
--
-- BEGIN;
-- DROP TABLE IF EXISTS public.metno_point_forecasts_history CASCADE;
-- COMMIT;
-- Note: public.teskeid_set_updated_at() is shared — do NOT drop it here.

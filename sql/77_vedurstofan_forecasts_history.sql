-- Migration 77: vedurstofan_forecasts_history — accumulated forecast rows per cycle.
--
-- Adds a history layer on top of vedurstofan_forecasts_latest. Unlike latest,
-- which only keeps the most-recently-fetched rows per station, this table keeps
-- one row per (station_id, atime, forecast_time) triple: every forecast slot
-- from every analysis cycle, deduplicated by cycle.
--
-- Purpose:
--   When a user opens the travel weather page at e.g. 22:55 and the current
--   forecast cycle is 18:00, the previous slot (21:00) has already passed and
--   is no longer returned by the Veðurstofan API. This table preserves it so
--   the UI can show the "prev / used / next" forecast rows around the ETA.
--
-- Retention: rows older than 14 days are pruned by the projector after each
-- successful station upsert. 14 days is enough for debugging and display;
-- long-term analytics belong in a separate pipeline.
--
-- Access: service_role only. No client, anon, or authenticated access.
-- RLS is enabled with no policies, so only service_role bypasses it.
--
-- Dependencies:
--   sql/04_teskeid_schema.sql — defines public.teskeid_set_updated_at()
--   sql/74_vedurstofan_product_tables.sql — defines public.vedurstofan_stations
--
-- Rollback:
--   DROP TABLE IF EXISTS public.vedurstofan_forecasts_history;

BEGIN;

CREATE TABLE IF NOT EXISTS public.vedurstofan_forecasts_history (
  station_id                  text NOT NULL
                                REFERENCES public.vedurstofan_stations (station_id)
                                ON DELETE CASCADE,
  atime                       timestamptz NOT NULL,           -- forecast cycle reference time (analysis time)
  forecast_time               timestamptz NOT NULL,           -- the forecast valid time (ftime)
  wind_speed_ms               numeric(6, 2),
  wind_direction_text         text,
  temperature_c               numeric(5, 1),
  precipitation_mm_per_hour   numeric(6, 2),
  weather_text                text,
  expires_at                  timestamptz,
  first_fetched_at            timestamptz NOT NULL DEFAULT now(),  -- set once on INSERT, never updated
  last_fetched_at             timestamptz NOT NULL,                -- updated on every upsert
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, atime, forecast_time)
);

ALTER TABLE public.vedurstofan_forecasts_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vedurstofan_forecasts_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vedurstofan_forecasts_history TO service_role;

-- Fast lookup for the history reader: given a set of station IDs and an atime,
-- return all forecast rows in a time window.
CREATE INDEX IF NOT EXISTS vedurstofan_forecasts_history_station_atime_idx
  ON public.vedurstofan_forecasts_history (station_id, atime, forecast_time);

-- Retention cleanup: find and delete rows older than the retention window.
CREATE INDEX IF NOT EXISTS vedurstofan_forecasts_history_atime_idx
  ON public.vedurstofan_forecasts_history (atime);

-- Trigger to keep updated_at current.
-- Reuses public.teskeid_set_updated_at() defined in sql/04_teskeid_schema.sql.
DROP TRIGGER IF EXISTS vedurstofan_forecasts_history_set_updated_at
  ON public.vedurstofan_forecasts_history;

CREATE TRIGGER vedurstofan_forecasts_history_set_updated_at
  BEFORE UPDATE ON public.vedurstofan_forecasts_history
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();

COMMIT;

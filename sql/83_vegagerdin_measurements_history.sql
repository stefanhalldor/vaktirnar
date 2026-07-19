-- sql/83_vegagerdin_measurements_history.sql
-- Persistent history table for Vegagerðin current measurements.
--
-- Purpose:
--   Keeps the most recent batch of Vegagerðin station measurements so that
--   /vedrid can continue to show Vegagerðin markers even when the short-lived
--   weather_cache row has expired or is missing (e.g. after a Vercel deploy,
--   a cron miss, or a cold-start before the first warm-vegagerdin run).
--
-- Read/write model:
--   - WRITE: cron/warm-vegagerdin upserts rows after every successful upstream fetch.
--     Conflict key: (station_id, measured_at). On conflict, updates all measurement
--     columns and last_fetched_at. first_fetched_at is preserved from the original insert.
--   - READ: /api/teskeid/weather/vegagerdin/current falls back to history when
--     weather_cache is missing or expired. Reads all rows from the newest fetch
--     batch by last_fetched_at (exact match), no older than 24 hours.
--
-- Access:
--   - service_role only. No anon or authenticated access. No RLS policy needed;
--     REVOKE from PUBLIC/anon/authenticated is sufficient.
--
-- Dependencies (must be applied before this migration):
--   sql/04_teskeid_schema.sql — defines public.teskeid_set_updated_at()
--   Migration order: numbered after sql/82; no dependency on sql/82 table content.
--
-- Do NOT run this migration without explicit Stebbi approval.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vegagerdin_measurements_history (
  station_id            text          NOT NULL,
  measured_at           timestamptz   NOT NULL,
  station_name          text          NOT NULL,
  lat                   numeric(9,6)  NOT NULL,
  lon                   numeric(9,6)  NOT NULL,
  mean_wind_ms          numeric(6,2),
  gust_last_10_min_ms   numeric(6,2),
  wind_direction_deg    numeric(6,1),
  wind_direction_text   text,
  air_temperature_c     numeric(5,1),
  road_temperature_c    numeric(5,1),
  data_quality          text          NOT NULL CHECK (data_quality IN ('complete', 'partial')),
  fetched_at            timestamptz   NOT NULL,
  first_fetched_at      timestamptz   NOT NULL DEFAULT now(),
  last_fetched_at       timestamptz   NOT NULL,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  PRIMARY KEY (station_id, measured_at)
);

-- Explicit privilege grant — service_role only; no public or user access
REVOKE ALL ON public.vegagerdin_measurements_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vegagerdin_measurements_history TO service_role;

-- Enable RLS (no policy needed — REVOKE above handles access; service_role bypasses RLS)
ALTER TABLE public.vegagerdin_measurements_history ENABLE ROW LEVEL SECURITY;

-- Indexes for efficient batch-lookup queries
-- Newest batch lookup by last_fetched_at: used by history fallback to find most recent fetch batch.
-- This is the primary index for readVegagerdinCurrentFromHistory().
CREATE INDEX IF NOT EXISTS vegagerdin_measurements_history_last_fetched_at_desc_idx
  ON public.vegagerdin_measurements_history (last_fetched_at DESC);

-- measured_at index: available for trend or ordering queries if needed
CREATE INDEX IF NOT EXISTS vegagerdin_measurements_history_measured_at_desc_idx
  ON public.vegagerdin_measurements_history (measured_at DESC);

-- Per-station history: useful for individual station trend queries
CREATE INDEX IF NOT EXISTS vegagerdin_measurements_history_station_measured_at_idx
  ON public.vegagerdin_measurements_history (station_id, measured_at DESC);

-- updated_at trigger — reuses shared function from sql/04_teskeid_schema.sql
DROP TRIGGER IF EXISTS vegagerdin_measurements_history_updated_at
  ON public.vegagerdin_measurements_history;

CREATE TRIGGER vegagerdin_measurements_history_updated_at
  BEFORE UPDATE ON public.vegagerdin_measurements_history
  FOR EACH ROW
  EXECUTE FUNCTION public.teskeid_set_updated_at();

COMMIT;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- To undo (drops all history data):
--
-- BEGIN;
-- DROP TABLE IF EXISTS public.vegagerdin_measurements_history CASCADE;
-- COMMIT;
-- Note: public.teskeid_set_updated_at() is shared — do NOT drop it here.

-- Migration 74: Veðurstofan product tables.
--
-- Adds a queryable product layer on top of the raw weather_cache key/value store.
-- weather_cache stays as the raw/provider cache layer.
-- These tables are the structured product layer for Veðurstofan data.
--
-- Tables:
--   vedurstofan_stations          - station registry and metadata (280 stations)
--   vedurstofan_forecasts_latest  - latest type=forec forecast rows per station
--   vedurstofan_observations_latest - latest type=obs observation per station
--   weather_fetch_runs            - background job run history and status
--
-- Access: service_role only. No client or anon access.
-- RLS is enabled on all tables with no policies, so only service_role bypasses it.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.weather_fetch_runs;
--   DROP TABLE IF EXISTS public.vedurstofan_observations_latest;
--   DROP TABLE IF EXISTS public.vedurstofan_forecasts_latest;
--   DROP TABLE IF EXISTS public.vedurstofan_stations;

BEGIN;

-- ── vedurstofan_stations ───────────────────────────────────────────────────────
-- One row per Veðurstofan station. Populated from the generated registry and
-- updated when the registry is re-generated or stations are re-verified.

CREATE TABLE IF NOT EXISTS public.vedurstofan_stations (
  station_id           text PRIMARY KEY,           -- e.g. '31392'
  slug                 text NOT NULL,              -- e.g. 'hellh'
  name                 text NOT NULL,              -- e.g. 'Hellisheiði'
  station_type         text,                       -- e.g. 'Sjálfvirk veðurathugunarstöð'
  wmo_number           text,                       -- e.g. '4836', null if none
  abbreviation         text NOT NULL,              -- e.g. 'hellh'
  forecast_area_name   text,                       -- e.g. 'Suðurland'
  forecast_area_code   text,                       -- e.g. 'su'
  lat                  numeric(9, 6),              -- WGS84 latitude
  lon                  numeric(9, 6),              -- WGS84 longitude (negative = west)
  coordinates_raw      text,                       -- original string from source page
  elevation_m          integer,
  start_year           integer,
  owner                text,                       -- e.g. 'Vegagerðin'
  source_url           text NOT NULL,              -- official vedur.is station page
  mapping_status       text NOT NULL DEFAULT 'source-provided'
                         CHECK (mapping_status IN (
                           'source-provided',
                           'missing-coordinates',
                           'verified',
                           'needs-verification',
                           'ambiguous'
                         )),
  registry_generated_at timestamptz,               -- when the registry TS file was generated
  synced_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vedurstofan_stations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vedurstofan_stations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vedurstofan_stations TO service_role;

CREATE INDEX IF NOT EXISTS vedurstofan_stations_slug_idx
  ON public.vedurstofan_stations (slug);

CREATE INDEX IF NOT EXISTS vedurstofan_stations_forecast_area_idx
  ON public.vedurstofan_stations (forecast_area_code);

-- ── vedurstofan_forecasts_latest ──────────────────────────────────────────────
-- Latest set of type=forec forecast rows per station.
-- On each background refresh, old rows for a station are deleted and replaced.
-- PK = (station_id, forecast_time) so each future time slot is one row.

CREATE TABLE IF NOT EXISTS public.vedurstofan_forecasts_latest (
  station_id              text NOT NULL
                            REFERENCES public.vedurstofan_stations (station_id)
                            ON DELETE CASCADE,
  forecast_time           timestamptz NOT NULL,    -- the forecast valid time (ftime)
  wind_speed_ms           numeric(6, 2),           -- F
  wind_direction_text     text,                    -- D (e.g. 'N', 'NV')
  temperature_c           numeric(5, 1),           -- T
  precipitation_mm_per_hour numeric(6, 2),         -- R
  weather_text            text,                    -- W (Icelandic description)
  atime                   timestamptz,             -- analysis/reference time from XML
  expires_at              timestamptz,             -- when this data is considered stale (set by background job)
  fetched_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, forecast_time)
);

ALTER TABLE public.vedurstofan_forecasts_latest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vedurstofan_forecasts_latest FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vedurstofan_forecasts_latest TO service_role;

CREATE INDEX IF NOT EXISTS vedurstofan_forecasts_latest_station_idx
  ON public.vedurstofan_forecasts_latest (station_id);

CREATE INDEX IF NOT EXISTS vedurstofan_forecasts_latest_time_idx
  ON public.vedurstofan_forecasts_latest (forecast_time);

-- ── vedurstofan_observations_latest ───────────────────────────────────────────
-- Latest type=obs observation per station. One row per station, upserted on
-- each background refresh.

CREATE TABLE IF NOT EXISTS public.vedurstofan_observations_latest (
  station_id              text PRIMARY KEY
                            REFERENCES public.vedurstofan_stations (station_id)
                            ON DELETE CASCADE,
  obs_time                timestamptz,             -- time of the observation
  wind_speed_ms           numeric(6, 2),           -- F
  wind_direction_text     text,                    -- D
  wind_gust_fx_ms         numeric(6, 2),           -- FX (10-min max)
  wind_gust_fg_ms         numeric(6, 2),           -- FG (gust)
  temperature_c           numeric(5, 1),           -- T
  weather_text            text,                    -- W
  visibility_m            numeric(10, 0),          -- V, meters (confirm unit during obs parser implementation)
  precipitation_mm        numeric(6, 2),           -- R, mm for the period (confirm unit during obs parser implementation)
  expires_at              timestamptz,             -- when this data is considered stale (set by background job)
  fetched_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vedurstofan_observations_latest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vedurstofan_observations_latest FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vedurstofan_observations_latest TO service_role;

-- ── weather_fetch_runs ────────────────────────────────────────────────────────
-- One row per background fetch job run. Tracks which source/type was fetched,
-- how many stations succeeded or failed, and any error summary.

CREATE TABLE IF NOT EXISTS public.weather_fetch_runs (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source               text NOT NULL               -- 'vedurstofan' only for now; extend with ALTER TABLE when MET/Yr runs are added
                         CHECK (source IN ('vedurstofan')),
  fetch_type           text NOT NULL               -- 'obs' | 'forec' (Veðurstofan-specific types)
                         CHECK (fetch_type IN ('obs', 'forec')),
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz,
  stations_attempted   integer NOT NULL DEFAULT 0,
  stations_succeeded   integer NOT NULL DEFAULT 0,
  stations_failed      integer NOT NULL DEFAULT 0,
  error_summary        text
);

ALTER TABLE public.weather_fetch_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.weather_fetch_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_fetch_runs TO service_role;

CREATE INDEX IF NOT EXISTS weather_fetch_runs_source_type_idx
  ON public.weather_fetch_runs (source, fetch_type, started_at DESC);

COMMIT;

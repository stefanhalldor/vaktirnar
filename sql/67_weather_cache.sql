-- Migration 67: weather_cache table for met.no Locationforecast responses.
--
-- Server-only cache. No client access. Service role reads and writes
-- through getAdmin() helpers in lib/weather/metno.server.ts.
--
-- Cache key format: metno:locationforecast:2.0:compact:{lat3}:{lon3}
-- Coordinates rounded to 3 decimal places for cache hit consistency.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.weather_cache;

BEGIN;

CREATE TABLE IF NOT EXISTS public.weather_cache (
  cache_key    text PRIMARY KEY,
  response_body jsonb NOT NULL,
  expires_at   timestamptz NOT NULL,
  last_modified text,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

-- No policies: service_role only
REVOKE ALL ON public.weather_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_cache TO service_role;

COMMIT;

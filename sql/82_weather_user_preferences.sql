-- sql/82_weather_user_preferences.sql
-- Creates the weather_user_preferences table for authenticated users to save
-- their default wind thresholds (cautionWindMs / redWindMs).
--
-- These saved thresholds apply across both /vedrid overview and /vedrid/ferdalagid
-- so the user sees consistent defaults when switching between the two views.
--
-- Dedicated table rather than columns on profiles:
--   - keeps schema ownership clean
--   - easy to extend with more preferences later
--   - simpler RLS policy (user_id = auth.uid())
--
-- API routes (not yet deployed):
--   GET  /api/teskeid/weather/preferences/thresholds
--   PUT  /api/teskeid/weather/preferences/thresholds
--
-- Validation (enforced in API layer, not DB):
--   - cautionWindMs and redWindMs must be finite positive numbers in (0, 40]
--   - cautionWindMs < redWindMs
--
-- Dependencies (must be applied before this migration):
--   sql/01_schema.sql         — defines public.profiles table
--   sql/04_teskeid_schema.sql — defines public.teskeid_set_updated_at()
--   Migration order: numbered after sql/81; no chat-table dependency.
--
-- Do NOT run this migration without explicit Stebbi approval.
--
-- RLS: authenticated users can manage only their own row.
-- No anon access. service_role bypasses RLS as usual.

BEGIN;

CREATE TABLE IF NOT EXISTS public.weather_user_preferences (
  user_id        uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  caution_wind_ms numeric(5,2) NOT NULL,
  red_wind_ms     numeric(5,2) NOT NULL,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT weather_user_preferences_ordering_check
    CHECK (caution_wind_ms < red_wind_ms),

  CONSTRAINT weather_user_preferences_caution_range_check
    CHECK (caution_wind_ms > 0 AND caution_wind_ms <= 40),

  CONSTRAINT weather_user_preferences_red_range_check
    CHECK (red_wind_ms > 0 AND red_wind_ms <= 40)
);

-- Explicit privilege grant (idempotent-safe: REVOKE ALL + re-grant)
REVOKE ALL ON public.weather_user_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_user_preferences TO service_role;

-- Enable RLS
ALTER TABLE public.weather_user_preferences ENABLE ROW LEVEL SECURITY;

-- Drop policy before (re-)creating so migration is idempotent
DROP POLICY IF EXISTS "weather_user_preferences_own_row" ON public.weather_user_preferences;

-- Authenticated users: full CRUD on their own row only
CREATE POLICY "weather_user_preferences_own_row"
  ON public.weather_user_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Drop trigger before (re-)creating so migration is idempotent
DROP TRIGGER IF EXISTS weather_user_preferences_updated_at ON public.weather_user_preferences;

-- updated_at trigger — reuses the shared function defined in sql/04_teskeid_schema.sql,
-- same as sql/69 (weather_saved_places), sql/77 (vedurstofan_forecasts_history), etc.
CREATE TRIGGER weather_user_preferences_updated_at
  BEFORE UPDATE ON public.weather_user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.teskeid_set_updated_at();

COMMIT;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- To undo (drops all preferences data):
--
-- BEGIN;
-- DROP TABLE IF EXISTS public.weather_user_preferences CASCADE;
-- COMMIT;
-- Note: public.teskeid_set_updated_at() is shared — do NOT drop it here.

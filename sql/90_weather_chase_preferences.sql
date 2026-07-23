-- sql/90_weather_chase_preferences.sql
-- Stores each authenticated user's default "Elta veðrið" setup:
-- selected provider places, their display order, and optional weather wish criteria.
--
-- Privacy:
--   Stores provider IDs, labels, optional coordinates, and simple numeric criteria only.
--   No raw addresses, route geometry, trips, chat content, or third-party API payloads.
--
-- API route:
--   GET /api/teskeid/weather/preferences/chase
--   PUT /api/teskeid/weather/preferences/chase
--
-- Dependencies:
--   sql/01_schema.sql         — defines public.profiles table
--   sql/04_teskeid_schema.sql — defines public.teskeid_set_updated_at()
--
-- Do NOT run this migration without explicit Stebbi approval.

BEGIN;

CREATE TABLE IF NOT EXISTS public.weather_chase_preferences (
  user_id        uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  selected_items jsonb       NOT NULL DEFAULT '[]'::jsonb,
  criteria       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT weather_chase_preferences_selected_items_array_check
    CHECK (jsonb_typeof(selected_items) = 'array'),

  CONSTRAINT weather_chase_preferences_criteria_object_check
    CHECK (jsonb_typeof(criteria) = 'object')
);

REVOKE ALL ON public.weather_chase_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_chase_preferences TO service_role;

ALTER TABLE public.weather_chase_preferences ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS weather_chase_preferences_updated_at
  ON public.weather_chase_preferences;

CREATE TRIGGER weather_chase_preferences_updated_at
  BEFORE UPDATE ON public.weather_chase_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.teskeid_set_updated_at();

COMMENT ON TABLE public.weather_chase_preferences IS
  'Per-user default Elta veðrið setup: selected provider places and optional weather wish criteria.';

COMMENT ON COLUMN public.weather_chase_preferences.selected_items IS
  'Ordered provider place selections. No raw search text or third-party payloads.';

COMMENT ON COLUMN public.weather_chase_preferences.criteria IS
  'Optional numeric weather wish criteria for graying non-matching forecast cells.';

COMMIT;

-- Rollback:
-- BEGIN;
-- DROP TABLE IF EXISTS public.weather_chase_preferences CASCADE;
-- COMMIT;

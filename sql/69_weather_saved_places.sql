-- Migration 69: weather_saved_places — recent/saved route places for Ferðaveðrið.
--
-- Private user data. No anonymous or cross-user access.
-- RLS is the hard boundary; all four policies use user_id = auth.uid().
-- API routes use the authenticated Supabase server client so RLS is exercised.
--
-- place_key is computed server-side: lat.toFixed(5) + ':' + lon.toFixed(5)
-- Coordinates are the dedupe key because PlaceSearch does not require placeId.
--
-- Row cap: enforced in the API layer (POST handler) — keep latest 50 per user.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.weather_saved_places;

BEGIN;

CREATE TABLE IF NOT EXISTS public.weather_saved_places (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_key         text NOT NULL,
  name              text NOT NULL,
  formatted_address text NOT NULL DEFAULT '',
  lat               double precision NOT NULL,
  lon               double precision NOT NULL,
  usage_count       integer NOT NULL DEFAULT 1,
  last_used_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT weather_saved_places_place_key_check CHECK (
    place_key = lower(trim(place_key))
    AND place_key <> ''
    AND char_length(place_key) <= 220
  ),
  CONSTRAINT weather_saved_places_name_check CHECK (
    trim(name) <> ''
    AND char_length(name) <= 160
  ),
  CONSTRAINT weather_saved_places_formatted_address_check CHECK (
    char_length(formatted_address) <= 300
  ),
  CONSTRAINT weather_saved_places_usage_count_check CHECK (usage_count >= 1),
  CONSTRAINT weather_saved_places_lat_check CHECK (lat BETWEEN 62 AND 68),
  CONSTRAINT weather_saved_places_lon_check CHECK (lon BETWEEN -26 AND -11),
  UNIQUE (user_id, place_key)
);

CREATE INDEX IF NOT EXISTS weather_saved_places_user_last_used_idx
  ON public.weather_saved_places (user_id, last_used_at DESC);

DROP TRIGGER IF EXISTS weather_saved_places_set_updated_at
  ON public.weather_saved_places;

CREATE TRIGGER weather_saved_places_set_updated_at
  BEFORE UPDATE ON public.weather_saved_places
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();

ALTER TABLE public.weather_saved_places ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.weather_saved_places FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_saved_places TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_saved_places TO service_role;

DROP POLICY IF EXISTS "weather_saved_places_select_own" ON public.weather_saved_places;
CREATE POLICY "weather_saved_places_select_own"
  ON public.weather_saved_places
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "weather_saved_places_insert_own" ON public.weather_saved_places;
CREATE POLICY "weather_saved_places_insert_own"
  ON public.weather_saved_places
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "weather_saved_places_update_own" ON public.weather_saved_places;
CREATE POLICY "weather_saved_places_update_own"
  ON public.weather_saved_places
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "weather_saved_places_delete_own" ON public.weather_saved_places;
CREATE POLICY "weather_saved_places_delete_own"
  ON public.weather_saved_places
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMIT;

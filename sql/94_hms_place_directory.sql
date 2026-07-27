-- Migration 94: HMS place directory with versioned last-known-good datasets.
--
-- Source: official HMS Staðfangaskrá CSV. A service-role-only refresh worker
-- downloads, validates and inserts a new immutable dataset version before this
-- migration's promotion function atomically switches the active version.
--
-- READ: server-side service role through capped search/reverse RPCs only.
-- WRITE: service-role-only refresh worker. No user searches, GPS coordinates,
-- saved places or other user data are stored in these tables.
--
-- IMPORTANT: Writing this migration does not apply it. Stebbi runs it manually.

BEGIN;

CREATE TABLE IF NOT EXISTS public.hms_place_dataset_versions (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version              integer     NOT NULL DEFAULT 1,
  source_name                 text        NOT NULL DEFAULT 'hms_stadfangaskra',
  source_url                  text        NOT NULL,
  status                      text        NOT NULL DEFAULT 'building',
  triggered_by                text        NOT NULL,
  source_content_sha256       text,
  source_bytes                bigint,
  source_fetched_at           timestamptz,
  source_row_count            integer,
  valid_point_count           integer,
  canonical_place_count       integer,
  rejected_row_count          integer,
  duplicate_point_count       integer,
  municipality_mapping_source text,
  municipality_mapping_count integer,
  validation                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  failure_code                text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  finished_at                 timestamptz,
  promoted_at                 timestamptz,
  retired_at                  timestamptz,

  CONSTRAINT hms_place_dataset_versions_schema_version_check
    CHECK (schema_version > 0),
  CONSTRAINT hms_place_dataset_versions_source_name_check
    CHECK (source_name = 'hms_stadfangaskra'),
  CONSTRAINT hms_place_dataset_versions_source_url_check
    CHECK (
      source_url = 'https://hmsstgsftpprodweu001.blob.core.windows.net/fasteignaskra/Stadfangaskra.csv'
    ),
  CONSTRAINT hms_place_dataset_versions_status_check
    CHECK (status IN ('building', 'ready', 'active', 'retired', 'failed', 'unchanged')),
  CONSTRAINT hms_place_dataset_versions_triggered_by_check
    CHECK (triggered_by IN ('cron', 'admin')),
  CONSTRAINT hms_place_dataset_versions_hash_check
    CHECK (source_content_sha256 IS NULL OR source_content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT hms_place_dataset_versions_mapping_source_check
    CHECK (municipality_mapping_source IS NULL OR municipality_mapping_source IN ('hagstofa', 'static')),
  CONSTRAINT hms_place_dataset_versions_validation_check
    CHECK (jsonb_typeof(validation) = 'object'),
  CONSTRAINT hms_place_dataset_versions_counts_check
    CHECK (
      (source_bytes IS NULL OR source_bytes > 0)
      AND (source_row_count IS NULL OR source_row_count >= 0)
      AND (valid_point_count IS NULL OR valid_point_count >= 0)
      AND (canonical_place_count IS NULL OR canonical_place_count >= 0)
      AND (rejected_row_count IS NULL OR rejected_row_count >= 0)
      AND (duplicate_point_count IS NULL OR duplicate_point_count >= 0)
      AND (municipality_mapping_count IS NULL OR municipality_mapping_count >= 0)
    ),
  CONSTRAINT hms_place_dataset_versions_complete_check
    CHECK (
      status IN ('building', 'failed', 'unchanged')
      OR (
        source_content_sha256 IS NOT NULL
        AND source_bytes > 0
        AND source_fetched_at IS NOT NULL
        AND source_row_count > 0
        AND valid_point_count > 0
        AND canonical_place_count > 0
        AND rejected_row_count >= 0
        AND duplicate_point_count >= 0
        AND municipality_mapping_source IS NOT NULL
        AND municipality_mapping_count > 0
        AND finished_at IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS hms_place_dataset_versions_one_active_idx
  ON public.hms_place_dataset_versions ((status))
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS hms_place_dataset_versions_one_building_idx
  ON public.hms_place_dataset_versions ((status))
  WHERE status = 'building';

CREATE INDEX IF NOT EXISTS hms_place_dataset_versions_history_idx
  ON public.hms_place_dataset_versions (status, promoted_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hms_places (
  dataset_version_id             uuid             NOT NULL
    REFERENCES public.hms_place_dataset_versions(id) ON DELETE CASCADE,
  source_id                      text             NOT NULL,
  coordinate_id                  text             NOT NULL,
  municipality_code              text,
  municipality_name              text,
  settlement_code                text,
  land_number                    text,
  postal_code                    text,
  street_name                    text             NOT NULL,
  street_name_dative             text,
  house_number                   text,
  house_letter                   text,
  address_suffix                 text,
  special_name                   text,
  display_name                   text             NOT NULL,
  formatted_address              text             NOT NULL,
  search_name_normalized         text             NOT NULL,
  search_address_normalized      text             NOT NULL,
  search_special_name_normalized text             NOT NULL DEFAULT '',
  search_municipality_normalized text             NOT NULL DEFAULT '',
  search_text_normalized         text             NOT NULL,
  lat                            double precision NOT NULL,
  lon                            double precision NOT NULL,
  coordinate_type                smallint,
  review_status                  smallint,
  accuracy_m                     double precision,
  source_corrected_at            text,
  created_at                     timestamptz      NOT NULL DEFAULT now(),

  PRIMARY KEY (dataset_version_id, source_id),

  CONSTRAINT hms_places_source_id_check
    CHECK (source_id ~ '^[0-9]{7}$'),
  CONSTRAINT hms_places_coordinate_id_check
    CHECK (coordinate_id ~ '^[0-9]+$' AND char_length(coordinate_id) <= 32),
  CONSTRAINT hms_places_municipality_code_check
    CHECK (municipality_code IS NULL OR municipality_code ~ '^[0-9]{4}$'),
  CONSTRAINT hms_places_postal_code_check
    CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{3}$'),
  CONSTRAINT hms_places_land_number_check
    CHECK (land_number IS NULL OR land_number ~ '^[0-9]{6}$'),
  CONSTRAINT hms_places_text_lengths_check
    CHECK (
      char_length(street_name) <= 200
      AND (street_name_dative IS NULL OR char_length(street_name_dative) <= 200)
      AND (municipality_name IS NULL OR char_length(municipality_name) <= 200)
      AND (settlement_code IS NULL OR char_length(settlement_code) <= 32)
      AND (house_number IS NULL OR char_length(house_number) <= 40)
      AND (house_letter IS NULL OR char_length(house_letter) <= 20)
      AND (address_suffix IS NULL OR char_length(address_suffix) <= 120)
      AND (special_name IS NULL OR char_length(special_name) <= 240)
      AND char_length(display_name) BETWEEN 1 AND 300
      AND char_length(formatted_address) BETWEEN 1 AND 600
      AND (source_corrected_at IS NULL OR char_length(source_corrected_at) <= 100)
    ),
  CONSTRAINT hms_places_normalized_text_check
    CHECK (
      search_name_normalized = lower(trim(search_name_normalized))
      AND search_address_normalized = lower(trim(search_address_normalized))
      AND search_special_name_normalized = lower(trim(search_special_name_normalized))
      AND search_municipality_normalized = lower(trim(search_municipality_normalized))
      AND search_text_normalized = lower(trim(search_text_normalized))
      AND search_name_normalized <> ''
      AND search_address_normalized <> ''
      AND search_text_normalized <> ''
    ),
  CONSTRAINT hms_places_lat_check CHECK (lat BETWEEN 63 AND 67),
  CONSTRAINT hms_places_lon_check CHECK (lon BETWEEN -25 AND -12),
  CONSTRAINT hms_places_coordinate_type_check
    CHECK (coordinate_type IS NULL OR coordinate_type BETWEEN 0 AND 5),
  CONSTRAINT hms_places_review_status_check
    CHECK (review_status IS NULL OR review_status IN (0, 1, 2, 9)),
  CONSTRAINT hms_places_accuracy_check
    CHECK (accuracy_m IS NULL OR (accuracy_m >= 0 AND accuracy_m <= 1000000))
);

CREATE INDEX IF NOT EXISTS hms_places_name_prefix_idx
  ON public.hms_places (dataset_version_id, search_name_normalized text_pattern_ops);

CREATE INDEX IF NOT EXISTS hms_places_address_prefix_idx
  ON public.hms_places (dataset_version_id, search_address_normalized text_pattern_ops);

CREATE INDEX IF NOT EXISTS hms_places_special_name_prefix_idx
  ON public.hms_places (dataset_version_id, search_special_name_normalized text_pattern_ops)
  WHERE search_special_name_normalized <> '';

CREATE INDEX IF NOT EXISTS hms_places_municipality_prefix_idx
  ON public.hms_places (dataset_version_id, search_municipality_normalized text_pattern_ops)
  WHERE search_municipality_normalized <> '';

-- Built-in PostgreSQL full-text search provides indexed, order-independent
-- token-prefix matching for full addresses without requiring pg_trgm.
CREATE INDEX IF NOT EXISTS hms_places_search_text_fts_idx
  ON public.hms_places
  USING gin (to_tsvector('simple', search_text_normalized));

CREATE INDEX IF NOT EXISTS hms_places_postal_code_idx
  ON public.hms_places (dataset_version_id, postal_code);

CREATE INDEX IF NOT EXISTS hms_places_coordinate_lookup_idx
  ON public.hms_places (dataset_version_id, lat, lon);

ALTER TABLE public.hms_place_dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hms_places ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hms_place_dataset_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hms_places FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_place_dataset_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hms_places TO service_role;

-- Claim one refresh lease. A killed worker cannot block refresh indefinitely.
CREATE OR REPLACE FUNCTION public.begin_hms_place_refresh(
  p_triggered_by text,
  p_source_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_dataset_id uuid;
BEGIN
  IF p_triggered_by NOT IN ('cron', 'admin') THEN
    RAISE EXCEPTION 'invalid_triggered_by';
  END IF;
  IF p_source_url <> 'https://hmsstgsftpprodweu001.blob.core.windows.net/fasteignaskra/Stadfangaskra.csv' THEN
    RAISE EXCEPTION 'invalid_source_url';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('hms_place_directory_refresh'));

  UPDATE public.hms_place_dataset_versions
  SET status = 'failed',
      failure_code = 'refresh_lease_expired',
      finished_at = now()
  WHERE status = 'building'
    AND created_at < now() - interval '30 minutes';

  DELETE FROM public.hms_places
  WHERE dataset_version_id IN (
    SELECT id
    FROM public.hms_place_dataset_versions
    WHERE status = 'failed'
      AND failure_code = 'refresh_lease_expired'
      AND created_at < now() - interval '30 minutes'
  );

  IF EXISTS (
    SELECT 1 FROM public.hms_place_dataset_versions WHERE status = 'building'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.hms_place_dataset_versions (triggered_by, source_url)
  VALUES (p_triggered_by, p_source_url)
  RETURNING id INTO v_dataset_id;

  RETURN v_dataset_id;
END;
$$;

-- Promotion and rollback are atomic. The row-count check prevents promotion of
-- a partially inserted version even if its metadata was accidentally marked ready.
CREATE OR REPLACE FUNCTION public.promote_hms_place_dataset(
  p_dataset_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_expected_count integer;
  v_actual_count bigint;
  v_updated_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hms_place_directory_promote'));

  SELECT canonical_place_count
  INTO v_expected_count
  FROM public.hms_place_dataset_versions
  WHERE id = p_dataset_id
    AND status IN ('ready', 'retired')
  FOR UPDATE;

  IF NOT FOUND OR v_expected_count IS NULL OR v_expected_count <= 0 THEN
    RETURN false;
  END IF;

  SELECT count(*)
  INTO v_actual_count
  FROM public.hms_places
  WHERE dataset_version_id = p_dataset_id;

  IF v_actual_count <> v_expected_count THEN
    RETURN false;
  END IF;

  UPDATE public.hms_place_dataset_versions
  SET status = 'retired',
      retired_at = now()
  WHERE status = 'active'
    AND id <> p_dataset_id;

  UPDATE public.hms_place_dataset_versions
  SET status = 'active',
      promoted_at = now(),
      retired_at = NULL
  WHERE id = p_dataset_id
    AND status IN ('ready', 'retired');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_hms_places(
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  source_id text,
  coordinate_id text,
  display_name text,
  formatted_address text,
  postal_code text,
  municipality_code text,
  municipality_name text,
  lat double precision,
  lon double precision,
  accuracy_m double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_query text := lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g'));
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 10);
  v_tsquery tsquery;
BEGIN
  IF char_length(v_query) < 2 OR char_length(v_query) > 100 OR v_query !~ '^[a-z0-9 ]+$' THEN
    RETURN;
  END IF;

  -- v_query is restricted to ASCII letters, digits and single spaces above,
  -- so constructing an AND-ed prefix tsquery cannot introduce tsquery syntax.
  v_tsquery := to_tsquery('simple', replace(v_query, ' ', ':* & ') || ':*');

  RETURN QUERY
  WITH active_dataset AS (
    SELECT id
    FROM public.hms_place_dataset_versions
    WHERE status = 'active'
    LIMIT 1
  )
  SELECT
    place.source_id,
    place.coordinate_id,
    place.display_name,
    place.formatted_address,
    place.postal_code,
    place.municipality_code,
    place.municipality_name,
    place.lat,
    place.lon,
    place.accuracy_m
  FROM public.hms_places AS place
  JOIN active_dataset AS dataset ON dataset.id = place.dataset_version_id
  WHERE place.search_name_normalized LIKE v_query || '%'
     OR place.search_address_normalized LIKE v_query || '%'
     OR place.search_special_name_normalized LIKE v_query || '%'
     OR place.search_municipality_normalized LIKE v_query || '%'
     OR place.postal_code = v_query
     OR to_tsvector('simple', place.search_text_normalized) @@ v_tsquery
  ORDER BY
    CASE
      WHEN place.search_name_normalized = v_query THEN 0
      WHEN place.search_special_name_normalized = v_query THEN 1
      WHEN place.search_address_normalized = v_query THEN 2
      WHEN place.postal_code = v_query THEN 3
      WHEN place.search_municipality_normalized = v_query THEN 4
      WHEN place.search_name_normalized LIKE v_query || '%' THEN 10
      WHEN place.search_special_name_normalized LIKE v_query || '%' THEN 11
      WHEN place.search_address_normalized LIKE v_query || '%' THEN 12
      WHEN place.search_municipality_normalized LIKE v_query || '%' THEN 13
      ELSE 20
    END,
    CASE place.review_status WHEN 1 THEN 0 WHEN 0 THEN 1 WHEN 2 THEN 2 ELSE 3 END,
    place.accuracy_m ASC NULLS LAST,
    place.display_name,
    place.source_id
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_hms_place(
  p_lat double precision,
  p_lon double precision,
  p_max_distance_m integer DEFAULT 25000
)
RETURNS TABLE (
  source_id text,
  coordinate_id text,
  display_name text,
  formatted_address text,
  postal_code text,
  municipality_code text,
  municipality_name text,
  lat double precision,
  lon double precision,
  accuracy_m double precision,
  distance_m double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH parameters AS (
    SELECT
      least(greatest(coalesce(p_max_distance_m, 25000), 100), 50000)::double precision AS max_distance_m,
      least(greatest(coalesce(p_max_distance_m, 25000), 100), 50000)::double precision / 111320.0 AS lat_delta,
      least(greatest(coalesce(p_max_distance_m, 25000), 100), 50000)::double precision
        / (111320.0 * greatest(0.1, cos(radians(p_lat)))) AS lon_delta
  ),
  active_dataset AS (
    SELECT id
    FROM public.hms_place_dataset_versions
    WHERE status = 'active'
    LIMIT 1
  ),
  bounded_candidates AS (
    SELECT
      place.*,
      2.0 * 6371000.0 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians((place.lat - p_lat) / 2.0)), 2)
        + cos(radians(p_lat)) * cos(radians(place.lat))
          * power(sin(radians((place.lon - p_lon) / 2.0)), 2)
      )))) AS calculated_distance_m,
      parameters.max_distance_m
    FROM public.hms_places AS place
    JOIN active_dataset AS dataset ON dataset.id = place.dataset_version_id
    CROSS JOIN parameters
    WHERE p_lat BETWEEN 63 AND 67
      AND p_lon BETWEEN -25 AND -12
      AND place.lat BETWEEN p_lat - parameters.lat_delta AND p_lat + parameters.lat_delta
      AND place.lon BETWEEN p_lon - parameters.lon_delta AND p_lon + parameters.lon_delta
  )
  SELECT
    candidate.source_id,
    candidate.coordinate_id,
    candidate.display_name,
    candidate.formatted_address,
    candidate.postal_code,
    candidate.municipality_code,
    candidate.municipality_name,
    candidate.lat,
    candidate.lon,
    candidate.accuracy_m,
    candidate.calculated_distance_m AS distance_m
  FROM bounded_candidates AS candidate
  WHERE candidate.calculated_distance_m <= candidate.max_distance_m
  ORDER BY
    candidate.calculated_distance_m,
    CASE candidate.review_status WHEN 1 THEN 0 WHEN 0 THEN 1 WHEN 2 THEN 2 ELSE 3 END,
    candidate.accuracy_m ASC NULLS LAST,
    candidate.source_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.begin_hms_place_refresh(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_hms_place_dataset(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_hms_places(text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_hms_place(double precision, double precision, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_hms_place_refresh(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_hms_place_dataset(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_hms_places(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_hms_place(double precision, double precision, integer) TO service_role;

COMMENT ON TABLE public.hms_place_dataset_versions IS
  'Service-role-only import history and last-known-good pointer for official HMS Staðfangaskrá snapshots.';
COMMENT ON TABLE public.hms_places IS
  'Service-role-only canonical HMS public place directory; one selected coordinate per HEINUM and dataset version.';

COMMIT;

-- Recovery / rollback plan (run only with separate approval):
-- 1. Content rollback: call public.promote_hms_place_dataset(<retired-dataset-id>)
--    as service_role after inspecting that version. Promotion is atomic.
-- 2. Full schema rollback (removes imported HMS public place data):
--      DROP FUNCTION IF EXISTS public.reverse_hms_place(double precision, double precision, integer);
--      DROP FUNCTION IF EXISTS public.search_hms_places(text, integer);
--      DROP FUNCTION IF EXISTS public.promote_hms_place_dataset(uuid);
--      DROP FUNCTION IF EXISTS public.begin_hms_place_refresh(text, text);
--      DROP TABLE IF EXISTS public.hms_places;
--      DROP TABLE IF EXISTS public.hms_place_dataset_versions;
-- This migration changes no auth data, user data, existing RLS policies or grants.

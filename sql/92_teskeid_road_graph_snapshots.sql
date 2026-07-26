-- sql/92_teskeid_road_graph_snapshots.sql
-- Durable, versioned last-known-good snapshots for the Teskeið Iceland road graph.
--
-- WRITE: service-role-only refresh workers fetch official Vegagerðin source data,
-- validate the complete graph, then atomically promote one ready snapshot.
-- READ: service-role-only server runtime reads the single active snapshot.
-- No raw user routes, addresses, weather selections or personal data are stored.
--
-- IMPORTANT: Writing this migration does not apply it. Stebbi runs it manually.

BEGIN;

CREATE TABLE IF NOT EXISTS public.teskeid_road_graph_snapshots (
  id                                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version                    integer     NOT NULL DEFAULT 1,
  source_name                       text        NOT NULL DEFAULT 'vegagerdin',
  status                            text        NOT NULL DEFAULT 'building',
  triggered_by                      text        NOT NULL,
  storage_bucket                    text,
  storage_path                      text,
  payload_sha256                    text,
  source_content_sha256             text,
  payload_bytes                     bigint,
  compressed_bytes                  bigint,
  source_fetched_at                 timestamptz,
  segment_count                     integer,
  node_count                        integer,
  edge_count                        integer,
  weak_component_count              integer,
  largest_weak_component_node_count integer,
  golden_route_pass_count           integer,
  golden_route_total_count          integer,
  validation                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  failure_code                      text,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  finished_at                       timestamptz,
  promoted_at                       timestamptz,
  retired_at                        timestamptz,

  CONSTRAINT teskeid_road_graph_snapshots_schema_version_check
    CHECK (schema_version > 0),
  CONSTRAINT teskeid_road_graph_snapshots_source_name_check
    CHECK (source_name = 'vegagerdin'),
  CONSTRAINT teskeid_road_graph_snapshots_status_check
    CHECK (status IN ('building', 'ready', 'active', 'retired', 'failed', 'unchanged')),
  CONSTRAINT teskeid_road_graph_snapshots_triggered_by_check
    CHECK (triggered_by IN ('cron', 'admin')),
  CONSTRAINT teskeid_road_graph_snapshots_hash_check
    CHECK (
      (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$')
      AND (source_content_sha256 IS NULL OR source_content_sha256 ~ '^[0-9a-f]{64}$')
    ),
  CONSTRAINT teskeid_road_graph_snapshots_validation_object_check
    CHECK (jsonb_typeof(validation) = 'object'),
  CONSTRAINT teskeid_road_graph_snapshots_complete_payload_check
    CHECK (
      status IN ('building', 'failed', 'unchanged')
      OR (
        storage_bucket = 'teskeid-road-graph-snapshots'
        AND storage_path IS NOT NULL
        AND payload_sha256 IS NOT NULL
        AND source_content_sha256 IS NOT NULL
        AND payload_bytes > 0
        AND compressed_bytes > 0
        AND source_fetched_at IS NOT NULL
        AND segment_count > 0
        AND node_count > 0
        AND edge_count > 0
        AND weak_component_count > 0
        AND largest_weak_component_node_count > 0
        AND golden_route_pass_count >= 0
        AND golden_route_total_count > 0
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS teskeid_road_graph_snapshots_storage_path_idx
  ON public.teskeid_road_graph_snapshots (storage_bucket, storage_path)
  WHERE storage_path IS NOT NULL;

ALTER TABLE public.teskeid_road_graph_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teskeid_road_graph_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_road_graph_snapshots TO service_role;

-- Private immutable-object bucket. No storage.objects policy is created:
-- service_role bypasses Storage RLS, while anon/authenticated receive no access.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'teskeid-road-graph-snapshots',
  'teskeid-road-graph-snapshots',
  false,
  52428800,
  ARRAY['application/gzip', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE UNIQUE INDEX IF NOT EXISTS teskeid_road_graph_snapshots_one_active_idx
  ON public.teskeid_road_graph_snapshots ((status))
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS teskeid_road_graph_snapshots_one_building_idx
  ON public.teskeid_road_graph_snapshots ((status))
  WHERE status = 'building';

CREATE INDEX IF NOT EXISTS teskeid_road_graph_snapshots_history_idx
  ON public.teskeid_road_graph_snapshots (status, promoted_at DESC, created_at DESC);

-- Claims the single refresh lease. A worker killed before cleanup cannot block
-- refresh forever: building rows older than 20 minutes are failed first.
CREATE OR REPLACE FUNCTION public.begin_teskeid_road_graph_refresh(
  p_triggered_by text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id uuid;
BEGIN
  IF p_triggered_by NOT IN ('cron', 'admin') THEN
    RAISE EXCEPTION 'invalid_triggered_by';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('teskeid_road_graph_refresh'));

  UPDATE public.teskeid_road_graph_snapshots
  SET status = 'failed',
      failure_code = 'refresh_lease_expired',
      finished_at = now()
  WHERE status = 'building'
    AND created_at < now() - interval '20 minutes';

  IF EXISTS (
    SELECT 1
    FROM public.teskeid_road_graph_snapshots
    WHERE status = 'building'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.teskeid_road_graph_snapshots (triggered_by)
  VALUES (p_triggered_by)
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

-- Promotion/rollback is atomic: the previous active snapshot becomes retired
-- in the same transaction in which a validated ready or retired snapshot becomes active.
CREATE OR REPLACE FUNCTION public.promote_teskeid_road_graph_snapshot(
  p_snapshot_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('teskeid_road_graph_promote'));

  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_road_graph_snapshots
    WHERE id = p_snapshot_id
      AND status IN ('ready', 'retired')
    FOR UPDATE
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.teskeid_road_graph_snapshots
  SET status = 'retired',
      retired_at = now()
  WHERE status = 'active'
    AND id <> p_snapshot_id;

  UPDATE public.teskeid_road_graph_snapshots
  SET status = 'active',
      promoted_at = now(),
      retired_at = NULL
  WHERE id = p_snapshot_id
    AND status IN ('ready', 'retired');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_teskeid_road_graph_refresh(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_teskeid_road_graph_refresh(text)
  TO service_role;

REVOKE ALL ON FUNCTION public.promote_teskeid_road_graph_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_teskeid_road_graph_snapshot(uuid)
  TO service_role;

COMMIT;

-- Recovery / rollback plan (run only with separate approval):
-- 1. To roll back graph content after inspecting validation, call
--    public.promote_teskeid_road_graph_snapshot(<known-good-retired-id>) as
--    service_role. The function swaps active/retired state atomically.
-- 2. To remove the feature schema entirely:
--      First remove all objects from the private
--      teskeid-road-graph-snapshots bucket through the Storage API, then remove
--      the bucket. A non-empty Storage bucket must not be deleted directly.
--      DROP FUNCTION IF EXISTS public.promote_teskeid_road_graph_snapshot(uuid);
--      DROP FUNCTION IF EXISTS public.begin_teskeid_road_graph_refresh(text);
--      DROP TABLE IF EXISTS public.teskeid_road_graph_snapshots;
-- This migration changes no auth data, user data, existing policies or grants.

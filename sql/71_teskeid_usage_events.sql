-- Teskeið per-feature usage events.
-- Append-only. Service-role writes/reads only.
-- No raw emails, names, addresses, lat/lon, place IDs, polylines or forecast payloads stored.
-- Metadata is a sanitized JSONB object (validated server-side before insert).
-- Migration number: 71 (follows sql/70_update_ready_card_descriptions.sql)
-- Do not run without explicit approval from Stebbi.

BEGIN;

CREATE TABLE IF NOT EXISTS public.teskeid_usage_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text        NOT NULL,
  event_name  text        NOT NULL,
  path        text        NOT NULL DEFAULT '',
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teskeid_usage_events_feature_key_check CHECK (
    feature_key = lower(trim(feature_key))
    AND feature_key <> ''
    AND char_length(feature_key) <= 80
  ),
  CONSTRAINT teskeid_usage_events_event_name_check CHECK (
    event_name = lower(trim(event_name))
    AND event_name <> ''
    AND char_length(event_name) <= 120
  ),
  CONSTRAINT teskeid_usage_events_path_check CHECK (char_length(path) <= 500),
  CONSTRAINT teskeid_usage_events_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS teskeid_usage_events_created_idx
  ON public.teskeid_usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS teskeid_usage_events_feature_created_idx
  ON public.teskeid_usage_events (feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS teskeid_usage_events_event_created_idx
  ON public.teskeid_usage_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS teskeid_usage_events_user_created_idx
  ON public.teskeid_usage_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.teskeid_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.teskeid_usage_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.teskeid_usage_events TO service_role;

COMMIT;

-- Migration: 46_recent_events
-- Creates a service-role-only event feed table for Nýlegt on /auth-mvp/heim.
--
-- Access model:
--   - Only service_role server code reads/writes this table.
--   - No grants to anon or authenticated.
--   - RLS enabled; no public policies.
--   - actor ownership verified server-side before any read/write/ack.
--
-- Note: sql/45_recent_read_state.sql was already applied to production.
--   loan_recent_read_state is left in place and unused by app code going forward.
--   It can be removed in a later cleanup migration once Stebbi confirms.
--
-- Rollback: DROP TABLE IF EXISTS public.recent_events;

BEGIN;

CREATE TABLE IF NOT EXISTS public.recent_events (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid        NOT NULL,
  source      text        NOT NULL,
  event_type  text        NOT NULL,
  entity_type text        NOT NULL,
  entity_id   uuid        NULL,
  event_key   text        NOT NULL,
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  href        text        NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ack_at      timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT recent_events_event_key_length    CHECK (char_length(event_key)   <= 200),
  CONSTRAINT recent_events_source_length       CHECK (char_length(source)      BETWEEN 1 AND 60),
  CONSTRAINT recent_events_event_type_length   CHECK (char_length(event_type)  BETWEEN 1 AND 80),
  CONSTRAINT recent_events_entity_type_length  CHECK (char_length(entity_type) BETWEEN 1 AND 60),
  CONSTRAINT recent_events_payload_object      CHECK (jsonb_typeof(payload)    = 'object'),
  CONSTRAINT recent_events_href_local          CHECK (href LIKE '/%'),
  CONSTRAINT recent_events_user_event_key_unique UNIQUE (user_id, event_key)
);

-- Fast lookup of unread events for a user, newest first
CREATE INDEX IF NOT EXISTS recent_events_unread_user_idx
  ON public.recent_events (user_id, occurred_at DESC, id DESC)
  WHERE ack_at IS NULL;

-- General lookup (used when including acked events)
CREATE INDEX IF NOT EXISTS recent_events_user_occurred_idx
  ON public.recent_events (user_id, occurred_at DESC, id DESC);

ALTER TABLE public.recent_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.recent_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recent_events TO service_role;

COMMIT;

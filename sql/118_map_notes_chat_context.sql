-- SQL118: map-anchored community notes and private Teskeið feedback.
--
-- Extends the shared teskeid_chat_* core. It creates no parallel message
-- system, adds no browser grants/policies, and does not backfill or rewrite
-- existing messages. Route context is permitted only in the server-owned
-- teskeid_feedback thread and is never selected into community DTOs.
-- Apply only after sql/validation/118-map-notes/preflight.sql is green.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.teskeid_chat_threads') IS NULL
     OR to_regclass('public.teskeid_chat_messages') IS NULL THEN
    RAISE EXCEPTION 'map_notes_chat_prerequisite_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teskeid_chat_messages'
      AND column_name = 'client_message_id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teskeid_chat_messages'
      AND column_name = 'idempotency_key' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'map_notes_requires_sql106';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teskeid_chat_threads AS thread
    WHERE NOT (
      (thread.domain = 'weather' AND thread.target_type IN ('vedurstofan_station', 'vegagerdin_station'))
      OR (thread.domain = 'expenses' AND thread.target_type = 'expense_item'
        AND thread.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      OR (thread.domain = 'map' AND (
        (thread.target_type = 'map_community' AND thread.target_id = 'iceland-community-v1')
        OR (thread.target_type = 'teskeid_feedback' AND thread.target_id = 'iceland-feedback-v1')
      ))
    )
  ) THEN
    RAISE EXCEPTION 'map_notes_unexpected_existing_chat_scope';
  END IF;
END;
$guard$;

ALTER TABLE public.teskeid_chat_messages
  ADD COLUMN IF NOT EXISTS anchor_lat double precision,
  ADD COLUMN IF NOT EXISTS anchor_lon double precision;

ALTER TABLE public.teskeid_chat_messages
  DROP CONSTRAINT IF EXISTS teskeid_chat_messages_anchor_pair_check,
  DROP CONSTRAINT IF EXISTS teskeid_chat_messages_anchor_iceland_check,
  DROP CONSTRAINT IF EXISTS teskeid_chat_messages_map_note_anchor_check;

ALTER TABLE public.teskeid_chat_messages
  ADD CONSTRAINT teskeid_chat_messages_anchor_pair_check
    CHECK ((anchor_lat IS NULL) = (anchor_lon IS NULL)) NOT VALID,
  ADD CONSTRAINT teskeid_chat_messages_anchor_iceland_check
    CHECK (
      anchor_lat IS NULL
      OR (anchor_lat BETWEEN 63.0 AND 67.0 AND anchor_lon BETWEEN -25.0 AND -12.0)
    ) NOT VALID,
  ADD CONSTRAINT teskeid_chat_messages_map_note_anchor_check
    CHECK (
      message_kind <> 'map_note'
      OR anchor_lat IS NOT NULL
      OR metadata ->> 'locationMode' = 'general'
    ) NOT VALID;

ALTER TABLE public.teskeid_chat_messages
  VALIDATE CONSTRAINT teskeid_chat_messages_anchor_pair_check;
ALTER TABLE public.teskeid_chat_messages
  VALIDATE CONSTRAINT teskeid_chat_messages_anchor_iceland_check;

ALTER TABLE public.teskeid_chat_messages
  DROP CONSTRAINT IF EXISTS teskeid_chat_messages_kind_check;
ALTER TABLE public.teskeid_chat_messages
  ADD CONSTRAINT teskeid_chat_messages_kind_check
    CHECK (message_kind IN (
      'chat', 'field_report', 'measurement_report', 'system',
      'map_note', 'teskeid_feedback'
    )) NOT VALID;
ALTER TABLE public.teskeid_chat_messages
  VALIDATE CONSTRAINT teskeid_chat_messages_kind_check;
ALTER TABLE public.teskeid_chat_messages
  VALIDATE CONSTRAINT teskeid_chat_messages_map_note_anchor_check;

ALTER TABLE public.teskeid_chat_threads
  DROP CONSTRAINT IF EXISTS teskeid_chat_threads_domain_check,
  DROP CONSTRAINT IF EXISTS teskeid_chat_threads_target_type_check,
  DROP CONSTRAINT IF EXISTS teskeid_chat_threads_scope_check;

ALTER TABLE public.teskeid_chat_threads
  ADD CONSTRAINT teskeid_chat_threads_scope_check
  CHECK (
    (domain = 'weather' AND target_type IN ('vedurstofan_station', 'vegagerdin_station'))
    OR (domain = 'expenses' AND target_type = 'expense_item'
      AND target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    OR (domain = 'map' AND (
      (target_type = 'map_community' AND target_id = 'iceland-community-v1')
      OR (target_type = 'teskeid_feedback' AND target_id = 'iceland-feedback-v1')
    ))
  ) NOT VALID;
ALTER TABLE public.teskeid_chat_threads
  VALIDATE CONSTRAINT teskeid_chat_threads_scope_check;

CREATE INDEX IF NOT EXISTS teskeid_chat_messages_map_anchor_recent_idx
  ON public.teskeid_chat_messages (thread_id, created_at DESC)
  WHERE anchor_lat IS NOT NULL AND deleted_at IS NULL AND hidden_at IS NULL;

COMMENT ON COLUMN public.teskeid_chat_messages.anchor_lat IS
  'Explicit point selected by the author; never a GPS trail. Nullable for private route feedback.';
COMMENT ON COLUMN public.teskeid_chat_messages.anchor_lon IS
  'Explicit point selected by the author; paired with anchor_lat.';
COMMENT ON CONSTRAINT teskeid_chat_threads_scope_check ON public.teskeid_chat_threads IS
  'Closed allowlist for weather, expense and structurally separate public/private map contexts.';

COMMIT;

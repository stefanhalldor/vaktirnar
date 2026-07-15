-- sql/78_teskeid_chat_core.sql
-- Creates the generic teskeid_chat_* tables for reusable scoped chat.
-- RLS is enabled on all tables. Only service_role has grants.
-- No anon or authenticated grants — all reads/writes go through server APIs.
--
-- Counter consistency: a trigger on teskeid_chat_messages keeps
-- teskeid_chat_threads.message_count and last_message_at in sync on insert.
-- This avoids race conditions between insert and a separate update call.
--
-- Rollback: see bottom of file.

BEGIN;

-- ── teskeid_chat_threads ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teskeid_chat_threads (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  domain         text        NOT NULL,
  target_type    text        NOT NULL,
  target_id      text        NOT NULL,
  provider       text,
  target_name    text        NOT NULL,
  lat            numeric(9, 6),
  lon            numeric(9, 6),
  metadata       jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  message_count  integer     NOT NULL DEFAULT 0,
  is_archived    boolean     NOT NULL DEFAULT false,

  CONSTRAINT teskeid_chat_threads_target_unique
    UNIQUE (domain, target_type, target_id),

  CONSTRAINT teskeid_chat_threads_domain_check
    CHECK (domain IN ('weather')),

  CONSTRAINT teskeid_chat_threads_target_type_check
    CHECK (target_type IN ('vedurstofan_station')),

  CONSTRAINT teskeid_chat_threads_message_count_nonneg
    CHECK (message_count >= 0)
);

ALTER TABLE public.teskeid_chat_threads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teskeid_chat_threads FROM PUBLIC;
REVOKE ALL ON public.teskeid_chat_threads FROM anon;
REVOKE ALL ON public.teskeid_chat_threads FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_chat_threads TO service_role;

-- ── teskeid_chat_messages ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teskeid_chat_messages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid        NOT NULL REFERENCES public.teskeid_chat_threads(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body           text        NOT NULL,
  message_kind   text        NOT NULL DEFAULT 'chat',
  metadata       jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  deleted_by     uuid,
  hidden_at      timestamptz,
  hidden_by      uuid,
  hidden_reason  text,

  CONSTRAINT teskeid_chat_messages_kind_check
    CHECK (message_kind IN ('chat', 'field_report', 'measurement_report', 'system')),

  CONSTRAINT teskeid_chat_messages_body_min
    CHECK (length(trim(body)) >= 1),

  CONSTRAINT teskeid_chat_messages_body_max
    CHECK (length(body) <= 1000)
);

CREATE INDEX IF NOT EXISTS teskeid_chat_messages_thread_id_idx
  ON public.teskeid_chat_messages (thread_id, created_at);

ALTER TABLE public.teskeid_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teskeid_chat_messages FROM PUBLIC;
REVOKE ALL ON public.teskeid_chat_messages FROM anon;
REVOKE ALL ON public.teskeid_chat_messages FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_chat_messages TO service_role;

-- ── teskeid_chat_read_cursors ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teskeid_chat_read_cursors (
  thread_id            uuid        NOT NULL REFERENCES public.teskeid_chat_threads(id) ON DELETE CASCADE,
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id uuid        REFERENCES public.teskeid_chat_messages(id) ON DELETE SET NULL,
  last_read_at         timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.teskeid_chat_read_cursors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teskeid_chat_read_cursors FROM PUBLIC;
REVOKE ALL ON public.teskeid_chat_read_cursors FROM anon;
REVOKE ALL ON public.teskeid_chat_read_cursors FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_chat_read_cursors TO service_role;

-- ── teskeid_chat_message_reports ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teskeid_chat_message_reports (
  message_id        uuid NOT NULL REFERENCES public.teskeid_chat_messages(id) ON DELETE CASCADE,
  reporter_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason            text NOT NULL,
  body              text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (message_id, reporter_user_id),

  CONSTRAINT teskeid_chat_message_reports_reason_min
    CHECK (length(trim(reason)) >= 1),

  CONSTRAINT teskeid_chat_message_reports_reason_max
    CHECK (length(reason) <= 100),

  CONSTRAINT teskeid_chat_message_reports_body_max
    CHECK (body IS NULL OR length(body) <= 1000)
);

ALTER TABLE public.teskeid_chat_message_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teskeid_chat_message_reports FROM PUBLIC;
REVOKE ALL ON public.teskeid_chat_message_reports FROM anon;
REVOKE ALL ON public.teskeid_chat_message_reports FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teskeid_chat_message_reports TO service_role;

-- ── Counter trigger ───────────────────────────────────────────────────────────
-- Keeps message_count and last_message_at on teskeid_chat_threads consistent
-- with inserts into teskeid_chat_messages atomically.

CREATE OR REPLACE FUNCTION public.teskeid_chat_thread_on_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.teskeid_chat_threads
  SET
    message_count   = message_count + 1,
    last_message_at = NEW.created_at,
    updated_at      = now()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teskeid_chat_messages_after_insert
  ON public.teskeid_chat_messages;

CREATE TRIGGER teskeid_chat_messages_after_insert
  AFTER INSERT ON public.teskeid_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_chat_thread_on_message_insert();

COMMIT;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- To undo this migration (run manually if needed):
--
-- DROP TRIGGER IF EXISTS teskeid_chat_messages_after_insert ON public.teskeid_chat_messages;
-- DROP FUNCTION IF EXISTS public.teskeid_chat_thread_on_message_insert();
-- DROP TABLE IF EXISTS public.teskeid_chat_message_reports;
-- DROP TABLE IF EXISTS public.teskeid_chat_read_cursors;
-- DROP TABLE IF EXISTS public.teskeid_chat_messages;
-- DROP TABLE IF EXISTS public.teskeid_chat_threads;

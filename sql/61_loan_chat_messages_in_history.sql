-- Migration 61: loan chat messages inside item history
--
-- Adds:
--   1. public.loan_chat_messages  -- canonical message store (one row per message)
--   2. public.create_loan_chat_message RPC  -- validates, inserts, returns message_id
--   3. Updated public.get_loan_event_history  -- UNIONs loan events + chat rows
--
-- get_loan_event_history return type is extended with three new columns:
--   row_kind text        ('event' | 'chat')
--   chat_body text       (null for events, message text for chat)
--   chat_message_id uuid (null for events, message id for chat)
--
-- Access rules are identical to SQL60 on both the send RPC and the history RPC:
--   created_by, lender_user_id, borrower_user_id, OR pending recipient via
--   normalize_email_canonical.
--
-- loan_chat_message recent_events rows (Olesid notifications) are filtered out of
-- event_rows so the same message never appears twice in the history.
--
-- Deploy order:
--   1. Run this SQL on Supabase.
--   2. Reload PostgREST schema cache (get_loan_event_history return type changed).
--   3. Confirm create_loan_chat_message and get_loan_event_history are visible to
--      service_role before deploying app code.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.create_loan_chat_message(uuid, uuid, text);
--   Restore SQL60 version of get_loan_event_history (run sql/60_... again).
--   DROP INDEX IF EXISTS loan_chat_messages_loan_created_idx;
--   DROP TABLE IF EXISTS public.loan_chat_messages;  -- WARNING: destroys messages
--
-- No grants change. Public/anon/authenticated cannot call either RPC.

BEGIN;

-- ============================================================
-- 1. loan_chat_messages table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.loan_chat_messages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id        uuid        NOT NULL REFERENCES public.loan_items(id) ON DELETE CASCADE,
  sender_user_id uuid        NOT NULL,
  body           text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz NULL,
  CONSTRAINT loan_chat_messages_body_length
    CHECK (char_length(trim(body)) BETWEEN 1 AND 1000)
);

ALTER TABLE public.loan_chat_messages ENABLE ROW LEVEL SECURITY;

-- No RLS policies: service_role bypasses RLS.
REVOKE ALL ON public.loan_chat_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_chat_messages TO service_role;

CREATE INDEX IF NOT EXISTS loan_chat_messages_loan_created_idx
  ON public.loan_chat_messages (loan_id, created_at ASC, id ASC)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 2. create_loan_chat_message
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_loan_chat_message(
  p_actor_id uuid,
  p_loan_id  uuid,
  p_body     text
)
RETURNS TABLE (
  status     text,
  message_id uuid
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_trimmed_body text;
  v_message_id   uuid;
BEGIN
  -- Verify actor exists
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Verify actor has access: actual party OR pending recipient (same as SQL60)
  IF NOT EXISTS (
    SELECT 1 FROM public.loan_items li
    WHERE li.id = p_loan_id
      AND (
        li.created_by       = p_actor_id OR
        li.lender_user_id   = p_actor_id OR
        li.borrower_user_id = p_actor_id
      )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.loan_invitations inv
    JOIN auth.users au
      ON public.normalize_email_canonical(au.email) = inv.recipient_email_normalized
    WHERE inv.loan_id = p_loan_id
      AND inv.status  = 'pending'
      AND au.id       = p_actor_id
  ) THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Validate body (trim + length)
  v_trimmed_body := trim(p_body);
  IF char_length(v_trimmed_body) < 1 OR char_length(v_trimmed_body) > 1000 THEN
    RETURN QUERY SELECT 'invalid_body'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Insert message
  INSERT INTO public.loan_chat_messages (loan_id, sender_user_id, body)
  VALUES (p_loan_id, p_actor_id, v_trimmed_body)
  RETURNING id INTO v_message_id;

  RETURN QUERY SELECT 'ok'::text, v_message_id;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.create_loan_chat_message(uuid, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_loan_chat_message(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. get_loan_event_history — extended with chat rows
--
-- Return type changes: adds row_kind, chat_body, chat_message_id.
-- Must DROP and recreate since Postgres cannot ALTER a function's return type.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_loan_event_history(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_loan_event_history(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS TABLE (
  event_key          text,
  event_type         text,
  payload            jsonb,
  occurred_at        timestamptz,
  actor_display_name text,
  row_kind           text,
  chat_body          text,
  chat_message_id    uuid
)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
BEGIN
  -- Verify actor exists
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN;
  END IF;

  -- Access check: actual party OR pending recipient (same as SQL60)
  IF NOT EXISTS (
    SELECT 1 FROM public.loan_items li
    WHERE li.id = p_loan_id
      AND (
        li.created_by       = p_actor_id OR
        li.lender_user_id   = p_actor_id OR
        li.borrower_user_id = p_actor_id
      )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.loan_invitations inv
    JOIN auth.users au
      ON public.normalize_email_canonical(au.email) = inv.recipient_email_normalized
    WHERE inv.loan_id = p_loan_id
      AND inv.status  = 'pending'
      AND au.id       = p_actor_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH deduped_events AS (
    SELECT DISTINCT ON (re.event_key)
      re.event_key,
      re.event_type,
      re.payload,
      re.occurred_at
    FROM public.recent_events re
    WHERE re.source      = 'loans'
      AND re.entity_type = 'loan'
      AND re.entity_id   = p_loan_id
      -- Exclude loan_chat_message: those come from loan_chat_messages, not recent_events.
      -- recent_events rows for loan_chat_message are Olesid notifications only.
      AND re.event_type <> 'loan_chat_message'
    ORDER BY re.event_key, re.occurred_at ASC, re.id ASC
  ),
  event_rows AS (
    SELECT
      de.event_key,
      de.event_type::text,
      de.payload,
      de.occurred_at,
      actor_profile.display_name AS actor_display_name,
      'event'::text              AS row_kind,
      NULL::text                 AS chat_body,
      NULL::uuid                 AS chat_message_id
    FROM deduped_events de
    LEFT JOIN LATERAL (
      SELECT (de.payload->>'actorUserId')::uuid AS actor_user_id
      WHERE (de.payload->>'actorUserId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) actor_meta ON true
    LEFT JOIN public.profiles actor_profile
      ON actor_profile.id = actor_meta.actor_user_id
  ),
  chat_rows AS (
    SELECT
      ('loans:loan:' || p_loan_id || ':chat:' || cm.id)::text AS event_key,
      'loan_chat_message'::text                               AS event_type,
      '{}'::jsonb                                             AS payload,
      cm.created_at                                           AS occurred_at,
      p.display_name                                          AS actor_display_name,
      'chat'::text                                            AS row_kind,
      cm.body                                                 AS chat_body,
      cm.id                                                   AS chat_message_id
    FROM public.loan_chat_messages cm
    LEFT JOIN public.profiles p ON p.id = cm.sender_user_id
    WHERE cm.loan_id   = p_loan_id
      AND cm.deleted_at IS NULL
  )
  SELECT
    event_key, event_type, payload, occurred_at, actor_display_name,
    row_kind, chat_body, chat_message_id
  FROM event_rows
  UNION ALL
  SELECT
    event_key, event_type, payload, occurred_at, actor_display_name,
    row_kind, chat_body, chat_message_id
  FROM chat_rows
  ORDER BY occurred_at ASC, event_key ASC;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.get_loan_event_history(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_loan_event_history(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;

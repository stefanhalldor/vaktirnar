-- Migration 62: fix get_loan_event_history SQL61 union ambiguity
--
-- SQL61 did not delete action history. It created loan_chat_messages and
-- replaced get_loan_event_history so it can UNION normal loan events with chat
-- rows. The final UNION query selected unqualified columns named event_key,
-- payload, occurred_at, etc. In PL/pgSQL those names also exist as RETURNS TABLE
-- output parameters, so runtime calls can fail with an ambiguous column
-- reference and the app then shows an empty history.
--
-- This patch recreates only public.get_loan_event_history(uuid, uuid), preserving
-- the SQL61 return contract and access model, but qualifies every column in the
-- final UNION and ORDER BY.
--
-- Data impact:
--   - No table data is changed.
--   - recent_events is not touched.
--   - loan_chat_messages is not touched.
--
-- Deployment:
--   1. Run this SQL on Supabase after SQL61.
--   2. Reload PostgREST schema cache.
--   3. Re-open a loan detail page and verify history + chat rows appear.
--
-- Rollback:
--   Restore the SQL61 version of get_loan_event_history, or restore SQL60 if
--   rolling the whole chat feature back.

BEGIN;

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

  -- Access check: actual party OR pending recipient (same as SQL60/SQL61)
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
      -- loan_chat_message recent_events rows are notifications only.
      -- Chat history rows come from loan_chat_messages.
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
    WHERE cm.loan_id    = p_loan_id
      AND cm.deleted_at IS NULL
  ),
  combined_rows AS (
    SELECT
      er.event_key,
      er.event_type,
      er.payload,
      er.occurred_at,
      er.actor_display_name,
      er.row_kind,
      er.chat_body,
      er.chat_message_id
    FROM event_rows er
    UNION ALL
    SELECT
      cr.event_key,
      cr.event_type,
      cr.payload,
      cr.occurred_at,
      cr.actor_display_name,
      cr.row_kind,
      cr.chat_body,
      cr.chat_message_id
    FROM chat_rows cr
  )
  SELECT
    combined.event_key,
    combined.event_type,
    combined.payload,
    combined.occurred_at,
    combined.actor_display_name,
    combined.row_kind,
    combined.chat_body,
    combined.chat_message_id
  FROM combined_rows combined
  ORDER BY combined.occurred_at ASC, combined.event_key ASC;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.get_loan_event_history(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_loan_event_history(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;

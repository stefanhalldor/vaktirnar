-- Migration 60: patch get_loan_event_history — pending recipient access + actor display name
--
-- SQL59 only allowed created_by, lender_user_id, borrower_user_id and did not
-- return actor information.
--
-- This patch adds:
--   1. A second access branch: a pending invitation recipient whose canonical
--      email matches the invitation recipient_email_normalized (same check as
--      get_my_loans). This lets a pending recipient view history before they
--      acknowledge the invitation.
--   2. A new return column actor_display_name text, resolved by reading
--      actorUserId from the event payload, validating it is a well-formed UUID
--      via a LATERAL filter, then joining public.profiles.
--
-- Safe to run even though SQL59 already ran — uses CREATE OR REPLACE.
-- No data is changed. No grants change.
--
-- Rollback: restore SQL59 version (run sql/59_get_loan_event_history.sql again).

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
  actor_display_name text
)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
BEGIN
  -- Verify actor exists
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN;
  END IF;

  -- Grant access if actor is:
  --   (a) an actual loan party (created_by, lender_user_id, borrower_user_id), OR
  --   (b) a pending invitation recipient whose canonical email matches.
  -- borrower_user_id is only set after claim, so this grants pending recipients
  -- visibility into the loan history before they acknowledge it.
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

  -- De-duplicate by event_key (actor + counterpart share the same key),
  -- then return in chronological order.
  -- actor_display_name is resolved from payload->>'actorUserId' via a safe
  -- UUID regex filter so malformed or missing values return NULL without error.
  RETURN QUERY
  SELECT
    deduped.event_key,
    deduped.event_type,
    deduped.payload,
    deduped.occurred_at,
    actor_profile.display_name AS actor_display_name
  FROM (
    SELECT DISTINCT ON (re.event_key)
      re.event_key,
      re.event_type,
      re.payload,
      re.occurred_at
    FROM public.recent_events re
    WHERE re.source      = 'loans'
      AND re.entity_type = 'loan'
      AND re.entity_id   = p_loan_id
    ORDER BY re.event_key, re.occurred_at ASC, re.id ASC
  ) deduped
  LEFT JOIN LATERAL (
    SELECT (deduped.payload->>'actorUserId')::uuid AS actor_user_id
    WHERE (deduped.payload->>'actorUserId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) actor_meta ON true
  LEFT JOIN public.profiles actor_profile
    ON actor_profile.id = actor_meta.actor_user_id
  ORDER BY deduped.occurred_at ASC, deduped.event_key ASC;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.get_loan_event_history(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_loan_event_history(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;

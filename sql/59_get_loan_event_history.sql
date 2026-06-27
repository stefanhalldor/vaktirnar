-- Migration 59: get_loan_event_history
--
-- Returns chronological history of events for a loan, de-duplicated by
-- event_key. Both actor and counterpart receive the same event_key, so
-- without de-duplication the same event would appear twice.
--
-- Access model:
--   - Caller must be an actual loan party: created_by, lender_user_id,
--     or borrower_user_id. Pending recipients (borrower_user_id = NULL)
--     are excluded by the party check.
--   - Returns no rows if actor has no access (silent, not an error).
--   - execute granted only to service_role.
--
-- Uses p_actor_id (NOT auth.uid()): called from server action with service_role.
-- Does NOT return user_id (that's the recipient, not the actor).
-- Does NOT return raw email or internal PII from payload.
--
-- Rollback: DROP FUNCTION IF EXISTS public.get_loan_event_history(uuid, uuid);

BEGIN;

DROP FUNCTION IF EXISTS public.get_loan_event_history(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_loan_event_history(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS TABLE (
  event_key   text,
  event_type  text,
  payload     jsonb,
  occurred_at timestamptz
)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
BEGIN
  -- Verify actor exists
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN;
  END IF;

  -- Verify actor is an actual party to this loan.
  -- borrower_user_id is only set after claim (accepted), so pending
  -- recipients without a claim correctly get no history.
  IF NOT EXISTS (
    SELECT 1 FROM public.loan_items li
    WHERE li.id = p_loan_id
      AND (
        li.created_by       = p_actor_id OR
        li.lender_user_id   = p_actor_id OR
        li.borrower_user_id = p_actor_id
      )
  ) THEN
    RETURN;
  END IF;

  -- De-duplicate by event_key (actor + counterpart share the same key),
  -- then return in chronological order.
  RETURN QUERY
  SELECT deduped.event_key, deduped.event_type, deduped.payload, deduped.occurred_at
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
  ORDER BY deduped.occurred_at ASC, deduped.event_key ASC;
END;
$$;

-- Index to support the history query efficiently
CREATE INDEX IF NOT EXISTS recent_events_loans_entity_idx
  ON public.recent_events (source, entity_type, entity_id, occurred_at ASC, id ASC);

GRANT  EXECUTE ON FUNCTION public.get_loan_event_history(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_loan_event_history(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;

BEGIN;

-- ============================================================
-- sql/51_allow_pending_creator_return.sql
--
-- Removes the both-parties-joined guard from mark_returned and
-- undo_return so that a direct participant (the creator, who is
-- already set as lender_user_id or borrower_user_id) can toggle
-- the returned state before the invitation is accepted.
--
-- Authorization rule is unchanged: actor must be lender_user_id
-- or borrower_user_id on the loan row.
--
-- The only change is the removal of:
--   IF v_loan.lender_user_id IS NULL OR v_loan.borrower_user_id IS NULL
--     RETURN 'invitation_not_accepted';
-- from both functions.
--
-- Security model unchanged:
--   - No table, column, index, RLS, or policy changes.
--   - Grants remain service_role only.
--   - SET search_path = '' unchanged.
--   - Pending recipients (not yet in lender_user_id/borrower_user_id)
--     still cannot call these functions — the actor check (not_found)
--     blocks them.
-- ============================================================

-- ============================================================
-- mark_returned (replaces sql/32 version)
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_returned(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_loan.lender_user_id IS DISTINCT FROM p_actor_id
    AND v_loan.borrower_user_id IS DISTINCT FROM p_actor_id
  THEN RETURN 'not_found'; END IF;

  -- Both-parties guard intentionally removed (sql/51):
  -- direct participant may mark returned before invitation is accepted.

  IF v_loan.returned_at IS NOT NULL THEN RETURN 'already_returned'; END IF;

  UPDATE public.loan_items
  SET returned_at = now(),
      returned_by = p_actor_id,
      updated_at  = now()
  WHERE id = p_loan_id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- undo_return (replaces sql/32 version)
-- ============================================================

CREATE OR REPLACE FUNCTION public.undo_return(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_loan.lender_user_id IS DISTINCT FROM p_actor_id
    AND v_loan.borrower_user_id IS DISTINCT FROM p_actor_id
  THEN RETURN 'not_found'; END IF;

  -- Both-parties guard intentionally removed (sql/51):
  -- direct participant may undo return before invitation is accepted.

  IF v_loan.returned_at IS NULL THEN RETURN 'not_returned'; END IF;

  UPDATE public.loan_items
  SET returned_at = NULL,
      returned_by = NULL,
      updated_at  = now()
  WHERE id = p_loan_id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- Grants (unchanged from sql/32 — service_role only)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.mark_returned(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.undo_return(uuid, uuid)   FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mark_returned(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_return(uuid, uuid)   TO service_role;

COMMIT;

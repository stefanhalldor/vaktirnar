-- Migration 58: update_loan_item_details_and_dates_with_diff
--
-- New RPC for post-acceptance narrow edit that adds loaned_at and due_at,
-- and that allows all actual loan parties to edit (created_by, lender_user_id,
-- borrower_user_id) -- not just lender-side actors.
--
-- Uses p_actor_id (NOT auth.uid()): server action calls with service_role.
-- Uses date (NOT timestamptz) for p_loaned_at and p_due_at.
-- borrower_user_id is only set after the invitation is claimed (accepted), so
-- pending recipients without a claim correctly get not_found.
--
-- Rollback: DROP FUNCTION IF EXISTS public.update_loan_item_details_and_dates_with_diff(uuid,uuid,text,text,date,date);

BEGIN;

DROP FUNCTION IF EXISTS public.update_loan_item_details_and_dates_with_diff(uuid, uuid, text, text, date, date);

CREATE OR REPLACE FUNCTION public.update_loan_item_details_and_dates_with_diff(
  p_actor_id  uuid,
  p_loan_id   uuid,
  p_item_name text,
  p_note      text,
  p_loaned_at date,
  p_due_at    date
)
RETURNS TABLE (
  status               text,
  before_item_name     text,
  before_note          text,
  before_loaned_at     date,
  before_due_at        date,
  counterpart_user_id  uuid
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::text, NULL::text, NULL::date, NULL::date, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::date, NULL::date, NULL::uuid;
    RETURN;
  END IF;

  -- All actual loan parties may edit: created_by, lender_user_id, or borrower_user_id.
  -- borrower_user_id is only populated after the invitation is claimed (accepted),
  -- so pending recipients who have not claimed yet correctly get not_found here.
  IF v_loan.created_by        IS DISTINCT FROM p_actor_id
     AND v_loan.lender_user_id  IS DISTINCT FROM p_actor_id
     AND v_loan.borrower_user_id IS DISTINCT FROM p_actor_id THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::date, NULL::date, NULL::uuid;
    RETURN;
  END IF;

  -- Validate item_name
  IF char_length(trim(p_item_name)) = 0 OR char_length(trim(p_item_name)) > 200 THEN
    RETURN QUERY SELECT 'invalid_item_name'::text, NULL::text, NULL::text, NULL::date, NULL::date, NULL::uuid;
    RETURN;
  END IF;

  -- Validate note (NULL is valid; non-null trimmed value must be <= 1000 chars)
  IF p_note IS NOT NULL AND char_length(trim(p_note)) > 1000 THEN
    RETURN QUERY SELECT 'invalid_note'::text, NULL::text, NULL::text, NULL::date, NULL::date, NULL::uuid;
    RETURN;
  END IF;

  -- Validate date range
  IF p_due_at IS NOT NULL AND p_due_at < p_loaned_at THEN
    RETURN QUERY SELECT 'invalid_due_date'::text, NULL::text, NULL::text, NULL::date, NULL::date, NULL::uuid;
    RETURN;
  END IF;

  -- Before-values captured from v_loan (already locked) after authorization.
  UPDATE public.loan_items
  SET item_name  = trim(p_item_name),
      note       = NULLIF(trim(p_note), ''),
      loaned_at  = p_loaned_at,
      due_at     = p_due_at,
      updated_at = now()
  WHERE id = p_loan_id;

  -- counterpart_user_id: the other populated party on the loan (not the actor).
  -- Lender checked first, then borrower.
  RETURN QUERY SELECT
    'ok'::text,
    v_loan.item_name,
    v_loan.note,
    v_loan.loaned_at,
    v_loan.due_at,
    CASE
      WHEN v_loan.lender_user_id IS NOT NULL
           AND v_loan.lender_user_id IS DISTINCT FROM p_actor_id
        THEN v_loan.lender_user_id
      WHEN v_loan.borrower_user_id IS NOT NULL
           AND v_loan.borrower_user_id IS DISTINCT FROM p_actor_id
        THEN v_loan.borrower_user_id
      ELSE NULL::uuid
    END;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.update_loan_item_details_and_dates_with_diff(uuid, uuid, text, text, date, date)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_loan_item_details_and_dates_with_diff(uuid, uuid, text, text, date, date)
  FROM PUBLIC, anon, authenticated;

COMMIT;

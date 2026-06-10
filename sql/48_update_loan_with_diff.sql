-- Migration 48: add update_loan_with_diff and update_loan_item_details_with_diff RPCs
-- Leaves update_loan and update_loan_item_details completely unchanged.
--
-- Rollback order (must follow this sequence if app code has already deployed):
--   1. Redeploy previous app version that calls update_loan / update_loan_item_details
--   2. Verify edits work against old RPCs
--   3. Then drop new functions:
--        DROP FUNCTION IF EXISTS public.update_loan_with_diff(uuid,uuid,text,text,date,date);
--        DROP FUNCTION IF EXISTS public.update_loan_item_details_with_diff(uuid,uuid,text,text);
--   4. Reload PostgREST schema cache in Supabase dashboard if needed

BEGIN;

-- Drop new diff functions first to handle any earlier draft with a different
-- return type. Does NOT touch existing update_loan or update_loan_item_details.
DROP FUNCTION IF EXISTS public.update_loan_with_diff(uuid, uuid, text, text, date, date);
DROP FUNCTION IF EXISTS public.update_loan_item_details_with_diff(uuid, uuid, text, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- update_loan_with_diff
-- Pre-acceptance edit by creator only.
-- Same authorization as update_loan (sql/32_loan_functions.sql).
-- Returns before values only after authorization succeeds.
-- Actor-only events are acceptable here: counterpart identity may not be
-- settled before acceptance.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_loan_with_diff(
  p_actor_id   uuid,
  p_loan_id    uuid,
  p_item_name  text,
  p_note       text,
  p_loaned_at  date,
  p_due_at     date
)
RETURNS TABLE (
  status           text,
  before_item_name text,
  before_note      text,
  before_loaned_at date,
  before_due_at    date
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  IF v_loan.created_by IS DISTINCT FROM p_actor_id THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.loan_invitations
    WHERE loan_id = p_loan_id AND status = 'accepted'
  ) THEN
    RETURN QUERY SELECT 'not_editable'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  IF char_length(trim(p_item_name)) = 0 OR char_length(p_item_name) > 200 THEN
    RETURN QUERY SELECT 'invalid_item_name'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  IF p_due_at IS NOT NULL AND p_due_at < p_loaned_at THEN
    RETURN QUERY SELECT 'invalid_due_date'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  -- Before-values captured from v_loan (already locked) after authorization.
  UPDATE public.loan_items
  SET item_name  = p_item_name,
      note       = p_note,
      loaned_at  = p_loaned_at,
      due_at     = p_due_at,
      updated_at = now()
  WHERE id = p_loan_id;

  RETURN QUERY SELECT
    'ok'::text,
    v_loan.item_name,
    v_loan.note,
    v_loan.loaned_at,
    v_loan.due_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_loan_with_diff(uuid,uuid,text,text,date,date)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_loan_with_diff(uuid,uuid,text,text,date,date)
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- update_loan_item_details_with_diff
-- Post-acceptance narrow edit (item_name + note only).
-- Same authorization as update_loan_item_details (sql/44_loan_item_details_edit.sql):
--   created_by OR lender_user_id — borrower-only actors get not_found.
-- NOTE: creator can be either party (borrower-created loans are allowed).
--   Do not assume actor is always lender-side.
-- Returns before values and counterpart_user_id after authorization.
-- Before-values returned only after authorization; unauthorized actors get not_found
--   and receive no before-values.
-- counterpart_user_id = the other populated party on the loan (not the actor):
--   lender_user_id if it is set and differs from actor, otherwise borrower_user_id
--   if set and differs from actor, otherwise NULL.
-- App records a counterpart event only when counterpart_user_id IS NOT NULL
-- and differs from p_actor_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_loan_item_details_with_diff(
  p_actor_id  uuid,
  p_loan_id   uuid,
  p_item_name text,
  p_note      text
)
RETURNS TABLE (
  status               text,
  before_item_name     text,
  before_note          text,
  counterpart_user_id  uuid
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  -- created_by OR lender_user_id only; borrower-only actors get not_found
  IF v_loan.created_by      IS DISTINCT FROM p_actor_id
     AND v_loan.lender_user_id IS DISTINCT FROM p_actor_id THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  IF char_length(trim(p_item_name)) = 0 OR char_length(trim(p_item_name)) > 200 THEN
    RETURN QUERY SELECT 'invalid_item_name'::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  IF p_note IS NOT NULL AND char_length(trim(p_note)) > 1000 THEN
    RETURN QUERY SELECT 'invalid_note'::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  -- Before-values captured from v_loan (already locked) after authorization.
  UPDATE public.loan_items
  SET item_name  = trim(p_item_name),
      note       = NULLIF(trim(p_note), ''),
      updated_at = now()
  WHERE id = p_loan_id;

  -- counterpart_user_id: the other populated party on the loan (not the actor).
  -- Checked in priority: lender first, then borrower.
  -- Both directions handled: lender actor -> borrower counterpart,
  -- borrower-created actor -> lender counterpart.
  -- App skips counterpart event when NULL or equals actor.
  RETURN QUERY SELECT
    'ok'::text,
    v_loan.item_name,
    v_loan.note,
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

GRANT EXECUTE ON FUNCTION public.update_loan_item_details_with_diff(uuid,uuid,text,text)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_loan_item_details_with_diff(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;

COMMIT;

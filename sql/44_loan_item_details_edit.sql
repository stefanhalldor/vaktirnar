-- =============================================================================
-- sql/44_loan_item_details_edit.sql
-- New RPC: update_loan_item_details
-- Allows created_by OR lender_user_id to update item_name and note only.
-- Does NOT touch loaned_at, due_at, returned_at, lender/borrower_user_id,
-- invitation status, or any email/snapshot fields.
-- item_name_snapshot in loan_invitations is intentionally NOT updated here
-- (snapshots are immutable for email idempotency).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.update_loan_item_details(
  p_actor_id  uuid,
  p_loan_id   uuid,
  p_item_name text,
  p_note      text
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

  -- created_by OR lender_user_id only; borrower-only actors get not_found
  IF v_loan.created_by      IS DISTINCT FROM p_actor_id
     AND v_loan.lender_user_id IS DISTINCT FROM p_actor_id THEN
    RETURN 'not_found';
  END IF;

  -- Validate item_name
  IF char_length(trim(p_item_name)) = 0 OR char_length(p_item_name) > 200 THEN
    RETURN 'invalid_item_name';
  END IF;

  -- Validate note (NULL is valid; non-null trimmed value must be <= 1000 chars)
  IF p_note IS NOT NULL AND char_length(trim(p_note)) > 1000 THEN
    RETURN 'invalid_note';
  END IF;

  UPDATE public.loan_items
  SET item_name  = trim(p_item_name),
      note       = NULLIF(trim(p_note), ''),
      updated_at = now()
  WHERE id = p_loan_id;

  RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_loan_item_details(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_loan_item_details(uuid, uuid, text, text)
  TO service_role;

COMMIT;

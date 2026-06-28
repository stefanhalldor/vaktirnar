-- Migration 65: add SECURITY DEFINER to switch_loan_role and get_loan_for_pending_recipient (#62)
--
-- Root cause: both functions access auth.users directly. With SECURITY INVOKER
-- (the default), they run as the calling role (service_role via PostgREST).
-- service_role does not have SELECT on auth.users in Postgres, so PostgREST
-- calls fail with: 42501 permission denied for table users
--
-- The Supabase SQL editor runs as postgres (superuser), which is why direct
-- probes succeeded but PostgREST calls failed.
--
-- Fix: SECURITY DEFINER causes the functions to run as their owner (postgres),
-- which has full access to auth.users. SET search_path = '' is retained —
-- this is the correct security combination for SECURITY DEFINER functions.
--
-- No business logic changes. No TypeScript changes needed.
--
-- Deployment:
--   1. Run this SQL on Supabase after SQL64.
--   2. Reload PostgREST schema cache: NOTIFY pgrst, 'reload schema';
--   3. Test role switch on a loan with a pending invitation.
--
-- Rollback (reverts to SECURITY INVOKER — will re-introduce the bug):
--   1. Re-run sql/63_switch_loan_role.sql to restore both functions.
--   2. Re-run sql/64_fix_switch_loan_role_ambiguous_status.sql to restore the
--      ambiguous-status fix on switch_loan_role.
--   3. Reload PostgREST schema cache: NOTIFY pgrst, 'reload schema';

BEGIN;

DROP FUNCTION IF EXISTS public.get_loan_for_pending_recipient(uuid, uuid);
DROP FUNCTION IF EXISTS public.switch_loan_role(uuid, uuid);

-- ── 1. get_loan_for_pending_recipient ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_loan_for_pending_recipient(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS TABLE (
  id                        uuid,
  item_name                 text,
  note                      text,
  loaned_at                 date,
  due_at                    date,
  returned_at               timestamptz,
  my_role                   text,
  other_display_name        text,
  invitation_id             uuid,
  invitation_status         text,
  invitation_attempt_status text,
  can_send_invitation       boolean,
  is_creator                boolean,
  requires_acknowledgement  boolean,
  recipient_email           text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
  v_actor_norm  text;
BEGIN
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_actor_norm := public.normalize_email_canonical(v_actor_email);

  RETURN QUERY
  SELECT
    li.id,
    li.item_name,
    li.note,
    li.loaned_at,
    li.due_at,
    li.returned_at,
    inv.recipient_role::text,
    p_creator.display_name,
    inv.id,
    'pending'::text,
    inv.attempt_status,
    false::boolean,
    false::boolean,
    true::boolean,
    NULL::text
  FROM public.loan_invitations inv
  JOIN public.loan_items li ON li.id = inv.loan_id
  LEFT JOIN public.profiles p_creator ON p_creator.id = inv.invited_by
  WHERE li.id = p_loan_id
    AND inv.status = 'pending'
    AND public.normalize_email_canonical(inv.recipient_email_normalized) = v_actor_norm
    AND (li.lender_user_id   IS DISTINCT FROM p_actor_id)
    AND (li.borrower_user_id IS DISTINCT FROM p_actor_id)
  ORDER BY inv.created_at DESC, inv.id DESC
  LIMIT 1;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.get_loan_for_pending_recipient(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_loan_for_pending_recipient(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. switch_loan_role ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.switch_loan_role(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS TABLE (
  status              text,
  item_name           text,
  counterpart_user_id uuid,
  pending_user_ids    uuid[]
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_email          text;
  v_actor_norm           text;
  v_inv_id               uuid;
  v_inv                  public.loan_invitations;
  v_loan                 public.loan_items;
  v_actor_is_lender      boolean := false;
  v_actor_is_borrower    boolean := false;
  v_is_pending_recipient boolean := false;
  v_counterpart_id       uuid;
  v_pending_ids          uuid[];
  v_pending_count        integer;
BEGIN
  -- Verify actor exists and get canonical email
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  v_actor_norm := public.normalize_email_canonical(v_actor_email);

  -- Step 1: look for an invitation whose recipient email matches actor.
  SELECT inv.id INTO v_inv_id
  FROM public.loan_invitations inv
  WHERE inv.loan_id = p_loan_id
    AND inv.status  = 'pending'
    AND public.normalize_email_canonical(inv.recipient_email_normalized) = v_actor_norm
  ORDER BY inv.created_at DESC, inv.id DESC
  LIMIT 1;

  -- Step 2: if actor is not the pending recipient, fall back to newest pending.
  IF v_inv_id IS NULL THEN
    SELECT COUNT(*) INTO v_pending_count
    FROM public.loan_invitations inv
    WHERE inv.loan_id = p_loan_id
      AND inv.status  = 'pending';

    IF v_pending_count > 1 THEN
      RETURN QUERY SELECT 'invalid_state'::text, NULL::text, NULL::uuid, NULL::uuid[];
      RETURN;
    END IF;

    SELECT inv.id INTO v_inv_id
    FROM public.loan_invitations inv
    WHERE inv.loan_id = p_loan_id
      AND inv.status  = 'pending'
    ORDER BY inv.created_at DESC, inv.id DESC
    LIMIT 1;
  END IF;

  -- Acquire locks in order: invitation first, then loan.
  IF v_inv_id IS NOT NULL THEN
    SELECT * INTO v_inv
    FROM public.loan_invitations
    WHERE id = v_inv_id
    FOR UPDATE;
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  -- Determine actor's relationship to this loan
  v_actor_is_lender   := (v_loan.lender_user_id   = p_actor_id);
  v_actor_is_borrower := (v_loan.borrower_user_id  = p_actor_id);

  IF NOT v_actor_is_lender AND NOT v_actor_is_borrower THEN
    IF v_inv.id IS NOT NULL
      AND v_actor_norm IS NOT NULL
      AND public.normalize_email_canonical(v_inv.recipient_email_normalized) = v_actor_norm
    THEN
      v_is_pending_recipient := true;
    END IF;
  END IF;

  IF NOT v_actor_is_lender AND NOT v_actor_is_borrower AND NOT v_is_pending_recipient THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  IF (v_actor_is_lender OR v_actor_is_borrower) AND v_pending_count IS NULL THEN
    SELECT COUNT(*) INTO v_pending_count
    FROM public.loan_invitations inv
    WHERE inv.loan_id = p_loan_id
      AND inv.status  = 'pending';
  END IF;

  IF (v_actor_is_lender OR v_actor_is_borrower) AND v_pending_count > 1 THEN
    RETURN QUERY SELECT 'invalid_state'::text, NULL::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  -- Perform the swap
  IF v_actor_is_lender THEN
    UPDATE public.loan_items
    SET lender_user_id   = v_loan.borrower_user_id,
        borrower_user_id = p_actor_id,
        updated_at       = now()
    WHERE id = p_loan_id;
    v_counterpart_id := v_loan.borrower_user_id;

  ELSIF v_actor_is_borrower THEN
    UPDATE public.loan_items
    SET borrower_user_id = v_loan.lender_user_id,
        lender_user_id   = p_actor_id,
        updated_at       = now()
    WHERE id = p_loan_id;
    v_counterpart_id := v_loan.lender_user_id;

  ELSE
    -- Pending recipient: no slot swap, just touch updated_at
    UPDATE public.loan_items
    SET updated_at = now()
    WHERE id = p_loan_id;
    v_counterpart_id := COALESCE(v_loan.lender_user_id, v_loan.borrower_user_id);
  END IF;

  -- Flip recipient_role in the pending invitation and collect notification ids.
  IF v_inv.id IS NOT NULL THEN
    UPDATE public.loan_invitations
    SET recipient_role = CASE
          WHEN v_inv.recipient_role = 'lender' THEN 'borrower'::text
          ELSE 'lender'::text
        END,
        updated_at = now()
    WHERE id = v_inv.id;

    SELECT ARRAY(
      SELECT au.id
      FROM auth.users au
      WHERE public.normalize_email_canonical(au.email)
              = public.normalize_email_canonical(v_inv.recipient_email_normalized)
      ORDER BY au.created_at ASC, au.id ASC
    )
    INTO v_pending_ids;
  END IF;

  RETURN QUERY SELECT 'ok'::text, v_loan.item_name, v_counterpart_id, v_pending_ids;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.switch_loan_role(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.switch_loan_role(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;

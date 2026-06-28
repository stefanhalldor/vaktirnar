-- Migration 64: patch public.switch_loan_role — fix ambiguous column reference (#62)
--
-- SQL63 introduced switch_loan_role with two COUNT(*) queries on loan_invitations
-- that used unqualified column names (loan_id, status). Because the function is
-- declared as RETURNS TABLE (..., status text, ...), Postgres raises:
--
--   ERROR: 42702: column reference "status" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--
-- Fix: alias loan_invitations as inv in both COUNT queries and qualify all
-- column references with inv.loan_id / inv.status.
--
-- All other logic is identical to SQL63 (no behaviour change).
--
-- Deployment:
--   1. Run this SQL on Supabase after SQL63.
--   2. Reload PostgREST schema cache: SELECT pg_notify('pgrst', 'reload schema');
--   3. Verify with rollback probe:
--        BEGIN;
--        SELECT * FROM public.switch_loan_role('<actor_id>'::uuid, '<loan_id>'::uuid);
--        ROLLBACK;
--      Expected: status = 'ok' or 'not_found' — no SQL error.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.switch_loan_role(uuid, uuid);
--   (re-run sql/63_switch_loan_role.sql to restore)

BEGIN;

DROP FUNCTION IF EXISTS public.switch_loan_role(uuid, uuid);

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
LANGUAGE plpgsql
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

  -- Find the invitation to lock, preferring one that matches the actor's
  -- canonical email (pending recipient case) over the newest (actual party case).
  --
  -- Step 1: look for an invitation whose recipient email matches actor.
  SELECT inv.id INTO v_inv_id
  FROM public.loan_invitations inv
  WHERE inv.loan_id = p_loan_id
    AND inv.status  = 'pending'
    AND public.normalize_email_canonical(inv.recipient_email_normalized) = v_actor_norm
  ORDER BY inv.created_at DESC, inv.id DESC
  LIMIT 1;

  -- Step 2: if actor is not the pending recipient, fall back to newest pending.
  -- Guard: multiple pending invitations for the same loan would be ambiguous.
  -- Return invalid_state so the caller knows data needs manual review.
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
  -- Matches lock order in claim_loan_invitation to prevent deadlock.
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
    -- Check if actor is pending recipient via canonical email match on locked row
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

  -- Guard: if actor is an actual party and multiple pending invitations exist for
  -- this loan, the state is ambiguous even if Step 1 found a matching invitation.
  -- v_pending_count is NULL if Step 1 found v_inv_id (Step 2 count was skipped).
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
    -- Actor moves from lender slot to borrower slot
    UPDATE public.loan_items
    SET lender_user_id   = v_loan.borrower_user_id,
        borrower_user_id = p_actor_id,
        updated_at       = now()
    WHERE id = p_loan_id;
    v_counterpart_id := v_loan.borrower_user_id;

  ELSIF v_actor_is_borrower THEN
    -- Actor moves from borrower slot to lender slot
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
    -- Counterpart is whoever holds the actual party slot
    v_counterpart_id := COALESCE(v_loan.lender_user_id, v_loan.borrower_user_id);
  END IF;

  -- Flip recipient_role in the pending invitation.
  -- Also look up all users whose canonical email matches, for notifications.
  IF v_inv.id IS NOT NULL THEN
    UPDATE public.loan_invitations
    SET recipient_role = CASE
          WHEN v_inv.recipient_role = 'lender' THEN 'borrower'::text
          ELSE 'lender'::text
        END,
        updated_at = now()
    WHERE id = v_inv.id;

    -- Collect all canonical-matching user ids for Ólesið notifications.
    -- Uses ARRAY() subquery to avoid DISTINCT+ORDER BY aggregate restriction.
    -- Never returns email addresses — only UUIDs.
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

-- =============================================================================
-- sql/50_loan_soft_acknowledgement.sql
-- Soft acknowledgement flow for loan invitations (#27).
--
-- Changes:
--   get_my_loans now returns a UNION of:
--     Branch 1: rows where actor is already lender or borrower (unchanged logic)
--     Branch 2: pending invitation rows where actor is the recipient by email
--   A new boolean column `requires_acknowledgement` distinguishes the two:
--     Branch 1: false
--     Branch 2: true
--
--   claim_loan_invitation: removes the expires_at expiry check so pending
--     invitations can always be acknowledged via the soft-ack UI. expires_at
--     is now email/send-link expiry only, not acknowledgement expiry.
--
-- No table schema changes. No data migration. No RLS changes.
--
-- Migration safety:
--   get_my_loans adds a new OUT column, which Postgres does not allow via
--   CREATE OR REPLACE FUNCTION. Both functions are therefore DROP + recreated
--   inside the same transaction so the operation is atomic and rollback-safe.
--
-- Rollout order (mandatory):
--   1. Apply this migration (both function bodies change atomically).
--   2. Reload the PostgREST / Supabase schema cache so the API layer picks up
--      the new requires_acknowledgement column. In Supabase dashboard:
--      Settings -> API -> "Reload schema" (or restart the service).
--   3. Deploy app code.
--   If rollback is needed: redeploy prior app version first, then restore
--   the prior function bodies from sql/32_loan_functions.sql. No data loss.
-- =============================================================================

BEGIN;

-- ── get_my_loans ──────────────────────────────────────────────────────────────
-- Drop first because we are adding a new OUT column (requires_acknowledgement)
-- which cannot be added via CREATE OR REPLACE FUNCTION in Postgres.

DROP FUNCTION IF EXISTS public.get_my_loans(uuid);

CREATE FUNCTION public.get_my_loans(p_actor_id uuid)
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
  requires_acknowledgement  boolean
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
  v_actor_norm  text;
BEGIN
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_actor_norm := lower(trim(v_actor_email));

  RETURN QUERY

  -- ── Branch 1: rows where actor is already lender or borrower ──────────────
  SELECT
    li.id,
    li.item_name,
    li.note,
    li.loaned_at,
    li.due_at,
    li.returned_at,
    CASE WHEN li.lender_user_id = p_actor_id THEN 'lender'::text ELSE 'borrower'::text END,
    CASE
      WHEN li.lender_user_id = p_actor_id THEN p_borrower.display_name
      ELSE p_lender.display_name
    END,
    inv.id,
    CASE
      WHEN inv.status = 'pending' AND inv.expires_at <= now() THEN 'expired'::text
      ELSE inv.status
    END,
    inv.attempt_status,
    (
      inv.id IS NOT NULL
      AND inv.status = 'pending'
      AND inv.expires_at > now()
      AND inv.invited_by = p_actor_id
      AND inv.attempt_number < 3
      AND (
        inv.attempt_status IS NULL
        OR (inv.attempt_status = 'failed'
            AND inv.attempt_at < now() - INTERVAL '5 minutes')
        OR (inv.attempt_status = 'reserved'
            AND inv.attempt_at >= now() - INTERVAL '24 hours')
      )
    ),
    (li.created_by = p_actor_id),
    false
  FROM public.loan_items li
  LEFT JOIN public.profiles p_lender   ON p_lender.id  = li.lender_user_id
  LEFT JOIN public.profiles p_borrower ON p_borrower.id = li.borrower_user_id
  LEFT JOIN LATERAL (
    SELECT inv_inner.*
    FROM public.loan_invitations inv_inner
    WHERE inv_inner.loan_id = li.id
    ORDER BY inv_inner.created_at DESC, inv_inner.id DESC
    LIMIT 1
  ) inv ON true
  WHERE li.lender_user_id = p_actor_id
     OR li.borrower_user_id = p_actor_id

  UNION ALL

  -- ── Branch 2: pending invitation rows where actor is recipient by email ────
  -- Excludes rows where actor is already a direct lender/borrower.
  -- Does not expose recipient_email_normalized.
  -- Does not require inv.expires_at > now(): pending rows stay visible even
  --   after email expiry (product decision from v002).
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
    false,
    false,
    true
  FROM public.loan_invitations inv
  JOIN public.loan_items li ON li.id = inv.loan_id
  LEFT JOIN public.profiles p_creator ON p_creator.id = inv.invited_by
  WHERE inv.recipient_email_normalized = v_actor_norm
    AND inv.status = 'pending'
    AND (li.lender_user_id   IS DISTINCT FROM p_actor_id)
    AND (li.borrower_user_id IS DISTINCT FROM p_actor_id)

  ORDER BY loaned_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_loans(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_loans(uuid) TO service_role;

-- ── claim_loan_invitation ─────────────────────────────────────────────────────
-- Removes the expires_at expiry check. Pending invitations (inv.status =
-- 'pending') are now claimable via the soft-ack UI regardless of email-link
-- expiry. expires_at governs email send-link validity only, not acknowledgement.
--
-- Invitations whose DB status was previously transitioned to 'expired' by the
-- old code path still return 'not_claimable' because they fail the
-- `status != 'pending'` guard. Branch 2 of get_my_loans only shows rows where
-- inv.status = 'pending', so no expired-status row will show an ack button.

DROP FUNCTION IF EXISTS public.claim_loan_invitation(uuid, uuid);

CREATE FUNCTION public.claim_loan_invitation(
  p_actor_id      uuid,
  p_invitation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
  v_inv         public.loan_invitations;
  v_loan        public.loan_items;
BEGIN
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RETURN 'unauthenticated'; END IF;

  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_inv.status = 'accepted' THEN RETURN 'already_claimed'; END IF;
  IF v_inv.status != 'pending' THEN RETURN 'not_claimable';   END IF;

  IF lower(trim(v_actor_email)) != v_inv.recipient_email_normalized THEN
    RETURN 'wrong_email';
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = v_inv.loan_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'loan_not_found'; END IF;

  IF v_inv.recipient_role = 'lender'   AND v_loan.borrower_user_id = p_actor_id THEN RETURN 'self_claim'; END IF;
  IF v_inv.recipient_role = 'borrower' AND v_loan.lender_user_id   = p_actor_id THEN RETURN 'self_claim'; END IF;

  IF v_inv.recipient_role = 'lender'   AND v_loan.lender_user_id   IS NOT NULL THEN RETURN 'already_claimed'; END IF;
  IF v_inv.recipient_role = 'borrower' AND v_loan.borrower_user_id IS NOT NULL THEN RETURN 'already_claimed'; END IF;

  IF v_inv.recipient_role = 'lender' THEN
    UPDATE public.loan_items
    SET lender_user_id = p_actor_id, updated_at = now()
    WHERE id = v_inv.loan_id;
  ELSE
    UPDATE public.loan_items
    SET borrower_user_id = p_actor_id, updated_at = now()
    WHERE id = v_inv.loan_id;
  END IF;

  UPDATE public.loan_invitations
  SET status = 'accepted', updated_at = now()
  WHERE id = p_invitation_id;

  RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_loan_invitation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_loan_invitation(uuid, uuid) TO service_role;

COMMIT;

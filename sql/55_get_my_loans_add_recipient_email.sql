-- =============================================================================
-- sql/55_get_my_loans_add_recipient_email.sql
-- Add recipient_email to get_my_loans (#53).
--
-- Changes:
--   get_my_loans gains a new OUT column `recipient_email text`:
--     Branch 1 (direct participant): creator sees inv.recipient_email_normalized,
--       non-creator sees NULL (privacy boundary).
--     Branch 2 (pending soft-ack recipient): always NULL (actor is the
--       recipient, they already know their own email).
--
-- All other logic is unchanged from sql/50_loan_soft_acknowledgement.sql.
--
-- Migration safety:
--   Adding a new OUT column is not allowed via CREATE OR REPLACE FUNCTION in
--   Postgres. The function is therefore DROP + recreated inside a transaction.
--
-- Rollout order (mandatory):
--   1. Apply this migration.
--   2. Reload the PostgREST / Supabase schema cache so the API layer picks up
--      the new recipient_email column. In Supabase dashboard:
--      Settings -> API -> "Reload schema" (or restart the service).
--   3. Deploy app code.
--   If rollback is needed: redeploy prior app version first, then restore
--   the function body from sql/50_loan_soft_acknowledgement.sql.
-- =============================================================================

BEGIN;

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
  requires_acknowledgement  boolean,
  recipient_email           text
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
    false,
    -- Only expose recipient email to the creator of the loan
    CASE WHEN li.created_by = p_actor_id THEN inv.recipient_email_normalized ELSE NULL::text END
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
  -- Does not expose recipient_email_normalized (actor is the recipient,
  --   they already know their own email).
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
    true,
    NULL::text
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

COMMIT;

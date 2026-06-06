-- =============================================================================
-- sql/34_loan_permissions_and_rpc_fix.sql
-- Corrective migration. Safe to run after sql/30, 31, 32 are already applied.
--
-- Fixes two production bugs found during localhost testing:
--
-- Bug 1 — PostgreSQL 42702 (ambiguous column reference) in get_my_loans:
--   The LATERAL subquery used bare column names (created_at, id) in ORDER BY.
--   PL/pgSQL resolved them to the RETURNS TABLE output variables rather than
--   the loan_invitations columns. Fixed by aliasing the inner table as
--   inv_inner and qualifying all column references in the subquery.
--
-- Bug 2 — PostgreSQL 42501 (permission denied) on loan_items and loan_invitations:
--   sql/30 and sql/31 revoked all privileges from PUBLIC, anon, and authenticated
--   but omitted an explicit GRANT to service_role. The BYPASSRLS attribute
--   skips row-level security policy evaluation but does not substitute for
--   table-level privileges. service_role therefore had EXECUTE on the RPCs
--   but no SELECT/INSERT/UPDATE/DELETE on the underlying tables.
--
-- Safety:
--   - CREATE OR REPLACE replaces the function body without touching data.
--   - GRANT and REVOKE are idempotent.
--   - No INSERT, UPDATE, DELETE, DROP, or ALTER TABLE statement is present.
--   - Existing loan_items and loan_invitations rows are not modified.
-- =============================================================================


BEGIN;

-- =============================================================================
-- Fix 2: table privileges for service_role
-- =============================================================================

-- Grants (idempotent — safe to re-run)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_items       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_invitations TO service_role;

-- Confirm no direct access for roles that must go through RPCs only.
-- REVOKE is idempotent: no error if privilege was already absent.
REVOKE ALL ON public.loan_items       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.loan_invitations FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- Fix 1: get_my_loans — qualify LATERAL ORDER BY columns
-- Full function body replaced so this migration is self-contained.
-- Signature is identical; no dependent objects are affected.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_loans(p_actor_id uuid)
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
  is_creator                boolean
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
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
    -- Effective status: treat pending-but-expired as 'expired' without writing to DB.
    -- The real status transition still happens under row lock in reserve/claim.
    CASE
      WHEN inv.status = 'pending' AND inv.expires_at <= now() THEN 'expired'::text
      ELSE inv.status
    END,
    inv.attempt_status,
    -- can_send_invitation uses raw inv.expires_at (not the effective status above)
    -- so the boolean is computed from the actual DB value, not the derived label.
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
    (li.created_by = p_actor_id)
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
  ORDER BY li.loaned_at DESC;
END;
$$;

-- Re-apply execute grants for get_my_loans (idempotent).
REVOKE EXECUTE ON FUNCTION public.get_my_loans(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_loans(uuid) TO service_role;

COMMIT;

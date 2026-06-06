-- =============================================================================
-- sql/35_loan_auth_users_and_ambiguity_fix.sql
-- Corrective migration. Safe to run after sql/34 is already applied.
--
-- Fixes one production bug found during localhost testing:
--
-- Bug — PostgreSQL 42702 (ambiguous column reference) in get_my_loans:
--   The auth-existence guard used an unqualified column name:
--     IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor_id)
--   PL/pgSQL resolved bare `id` to the RETURNS TABLE output variable `id uuid`
--   rather than to auth.users.id.  Fixed by aliasing the table as `au` and
--   qualifying both column references:
--     IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id)
--
-- Root permission fix:
--   service_role has USAGE on the auth schema and BYPASSRLS, but Supabase
--   does not grant it SELECT on auth.users by default.  A column-level grant
--   of only (id, email) is sufficient for all loan functions:
--     - SELECT 1 FROM auth.users WHERE id = …  (needs SELECT on id)
--     - SELECT email FROM auth.users WHERE id = …  (needs SELECT on id, email)
--   No function performs SELECT * on auth.users, so column-level grant is safe.
--
-- Scope: only get_my_loans is replaced because it is the only loan function
--   whose RETURNS TABLE output columns include a column named `id`, creating
--   genuine ambiguity.  All other functions were audited and found to have no
--   naming collision between their output columns and the auth.users columns
--   they reference.
--
-- Safety:
--   - GRANT is idempotent.
--   - CREATE OR REPLACE does not touch data.
--   - No INSERT, UPDATE, DELETE, DROP, or ALTER TABLE statement is present.
--   - Existing loan_items and loan_invitations rows are not modified.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Permission fix: column-level SELECT on auth.users for service_role
-- Only (id, email) — the two columns used by loan functions.
-- No grant to PUBLIC, anon, or authenticated.
-- =============================================================================

GRANT SELECT (id, email) ON auth.users TO service_role;


-- =============================================================================
-- Function fix: get_my_loans — qualify auth.users alias
-- Full function body so this migration is self-contained.
-- Incorporates the LATERAL ORDER BY fix from sql/34 as well.
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
  -- Alias `au` prevents 42702: bare `id` inside a RETURNS TABLE function is
  -- ambiguous between the output column `id uuid` and auth.users.id.
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
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

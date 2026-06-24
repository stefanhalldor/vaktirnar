-- =============================================================================
-- sql/57_get_user_ids_by_canonical_email.sql
-- Returns all auth.users.id values whose email canonical-matches p_email.
-- Uses normalize_email_canonical (from sql/56) on both sides, so dotted
-- Gmail and Googlemail registrations match canonical invitations.
-- Solves the pending-recipient notification gap in updateLoan (#37).
--
-- Returns TABLE (user_id uuid) — zero or more rows.
-- Never returns email addresses or personal data.
-- service_role only — not accessible to anon or authenticated.
--
-- Deployment checklist (MANDATORY — do not skip steps):
--   1. Apply this migration on Supabase.
--   2. Reload PostgREST schema cache:
--      Supabase dashboard → Settings → API → Reload Schema Cache
--      OR: SELECT pg_notify('pgrst', 'reload schema');
--   3. Verify function is visible: call it from a service-role client and
--      confirm it returns rows/empty without a 404 error.
--   4. Deploy app code (lib/loans/actions.ts) that calls this function.
--
-- Rollback (only safe if app code is also rolled back first):
--   1. Deploy app code that does NOT call this function.
--   2. DROP FUNCTION IF EXISTS public.get_user_ids_by_canonical_email(text);
--   3. Reload schema cache if needed.
--   4. Verify app logs no repeated RPC errors.
--   Note: dropping the function while live app code calls it causes
--   notification to silently fail. Roll back app code first.
--
-- No table schema changes. No data changes.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_ids_by_canonical_email(p_email text)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
STRICT
SET search_path = ''
AS $$
  SELECT id AS user_id
  FROM auth.users
  WHERE public.normalize_email_canonical(email)
      = public.normalize_email_canonical(p_email)
  ORDER BY created_at ASC, id ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_ids_by_canonical_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_ids_by_canonical_email(text)
  TO service_role;

COMMIT;

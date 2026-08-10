-- SQL121: recipient-scoped UL invitation preview and exact-expense response.
-- Function-only migration. No existing ledger rows are changed.
BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regprocedure('public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)') IS NULL
     AND to_regprocedure('public.expense_respond_scoped_member_invitation_v120(uuid,uuid,text,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_respond_scoped_member_invitation');
  END IF;
  IF to_regclass('public.expense_member_invitations') IS NULL THEN v_missing := array_append(v_missing, 'expense_member_invitations'); END IF;
  IF to_regclass('public.expense_share_collaborators') IS NULL THEN v_missing := array_append(v_missing, 'expense_share_collaborators'); END IF;
  IF to_regclass('public.expenses') IS NULL THEN v_missing := array_append(v_missing, 'expenses'); END IF;
  IF to_regclass('public.expense_payments') IS NULL THEN v_missing := array_append(v_missing, 'expense_payments'); END IF;
  IF to_regclass('public.expense_shares') IS NULL THEN v_missing := array_append(v_missing, 'expense_shares'); END IF;
  IF to_regclass('public.expense_group_members') IS NULL THEN v_missing := array_append(v_missing, 'expense_group_members'); END IF;
  IF to_regprocedure('public.normalize_email_canonical(text)') IS NULL THEN v_missing := array_append(v_missing, 'normalize_email_canonical'); END IF;
  IF NOT pg_has_role(current_user, 'service_role', 'USAGE') THEN v_missing := array_append(v_missing, 'service_role'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'sql121 prerequisites missing: %', array_to_string(v_missing, ', ');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'sql121 execution role must bypass RLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'sql121 service_role must bypass RLS';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_member_invitation_exact_expense(
  p_invitation_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH invitation AS (
    SELECT i.group_id, i.member_id, i.shared_expense_id, i.shared_share_member_id
    FROM public.expense_member_invitations AS i
    WHERE i.id = p_invitation_id
  ), shared_match AS (
    SELECT e.id
    FROM invitation AS i
    JOIN public.expenses AS e
      ON e.group_id = i.group_id AND e.id = i.shared_expense_id AND e.status = 'active'
    JOIN public.expense_share_collaborators AS c
      ON c.group_id = e.group_id
     AND c.expense_id = e.id
     AND c.share_member_id = i.shared_share_member_id
     AND c.collaborator_member_id = i.member_id
     AND c.status = 'active'
    WHERE i.shared_expense_id IS NOT NULL
  ), one_off_match AS (
    SELECT (array_agg(e.id ORDER BY e.id))[1] AS id
    FROM invitation AS i
    JOIN public.expense_groups AS g ON g.id = i.group_id AND g.kind = 'one_off'
    JOIN public.expenses AS e ON e.group_id = i.group_id AND e.status = 'active'
    WHERE i.shared_expense_id IS NULL
    HAVING count(*) = 1
  )
  SELECT id FROM shared_match
  UNION ALL
  SELECT id FROM one_off_match
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.expense_member_invitation_exact_expense(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expense_get_scoped_member_invitation_preview(
  p_actor_id uuid,
  p_invitation_id uuid
)
RETURNS TABLE (
  invitation_id uuid,
  context_title text,
  inviter_display_name text,
  status text,
  expires_at timestamptz,
  invited_at timestamptz,
  expense_id uuid,
  expense_title text,
  description text,
  total_minor bigint,
  currency text,
  incurred_on date,
  payers jsonb,
  participants jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
  v_expense_id uuid;
BEGIN
  IF p_actor_id IS NULL OR p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  SELECT public.normalize_email_canonical(account.email)
    INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id;

  SELECT public.expense_member_invitation_exact_expense(p_invitation_id)
    INTO v_expense_id;
  IF v_expense_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.context_title_snapshot,
    i.inviter_display_name_snapshot,
    i.status,
    i.expires_at,
    i.created_at,
    e.id,
    e.title,
    CASE
      WHEN btrim(i.context_title_snapshot) <> btrim(e.title)
        THEN i.context_title_snapshot
      ELSE NULL
    END,
    e.total_minor,
    e.currency,
    e.incurred_on,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'displayName', m.display_name,
        'amountMinor', p.amount_minor
      ) ORDER BY m.display_name, m.id)
      FROM public.expense_payments AS p
      JOIN public.expense_group_members AS m
        ON m.group_id = p.group_id AND m.id = p.member_id
      WHERE p.expense_id = e.id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'displayName', m.display_name,
        'amountMinor', s.amount_minor
      ) ORDER BY m.display_name, m.id)
      FROM public.expense_shares AS s
      JOIN public.expense_group_members AS m
        ON m.group_id = s.group_id AND m.id = s.member_id
      WHERE s.expense_id = e.id
    ), '[]'::jsonb)
  FROM public.expense_member_invitations AS i
  JOIN public.expense_groups AS g ON g.id = i.group_id
  JOIN public.expenses AS e ON e.group_id = i.group_id AND e.id = v_expense_id
  JOIN public.expense_group_members AS invited_member
    ON invited_member.group_id = i.group_id AND invited_member.id = i.member_id
  WHERE i.id = p_invitation_id
    AND i.status = 'pending'
    AND i.expires_at > now()
    AND i.recipient_email_canonical IS NOT DISTINCT FROM v_actor_email
    AND v_actor_email IS NOT NULL
    AND g.status IN ('active', 'settling', 'settled')
    AND e.status = 'active'
    AND invited_member.status = 'active'
    AND invited_member.user_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_get_scoped_member_invitation_preview(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_get_scoped_member_invitation_preview(uuid,uuid)
  TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.expense_respond_scoped_member_invitation_v120(uuid,uuid,text,uuid)') IS NULL THEN
    ALTER FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)
      RENAME TO expense_respond_scoped_member_invitation_v120;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_respond_scoped_member_invitation_v120(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expense_respond_scoped_member_invitation(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_action text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_expense_id uuid;
BEGIN
  v_result := public.expense_respond_scoped_member_invitation_v120(
    p_actor_id, p_invitation_id, p_action, p_request_id
  );
  IF v_result ->> 'status' = 'accepted' THEN
    v_expense_id := public.expense_member_invitation_exact_expense(p_invitation_id);
    IF v_expense_id IS NULL THEN
      RAISE EXCEPTION 'expense_invitation_conflict';
    END IF;
    v_result := v_result || jsonb_build_object('expense_id', v_expense_id);
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)
  TO service_role;

ALTER FUNCTION public.expense_member_invitation_exact_expense(uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_get_scoped_member_invitation_preview(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.expense_get_scoped_member_invitation_preview(uuid,uuid) IS
  'SQL121 recipient/email-scoped, pending-only preview of one exact expense. Returns no ids beyond the invitation and exact expense, no emails, and no payment instructions.';
COMMENT ON FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid) IS
  'SQL121 wrapper preserving SQL113 consent/idempotency and adding the exact expense_id only after accepted success.';

COMMIT;

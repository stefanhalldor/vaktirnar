-- READ ONLY. Run before SQL112 and share the single result row with Codex.
WITH target AS (
  SELECT to_regprocedure(
    'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)'
  ) AS helper_oid
), constraint_state AS (
  SELECT constraint_row.convalidated,
    pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_constraint AS constraint_row
  JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'expense_member_invitations'
    AND constraint_row.conname = 'expense_member_invitations_template_check'
)
SELECT current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  to_regclass('public.expense_member_invitations') IS NOT NULL
    AND to_regclass('public.expense_groups') IS NOT NULL
    AND to_regclass('public.expense_group_members') IS NOT NULL
    AND (SELECT helper_oid IS NOT NULL FROM target)
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expense_groups'
        AND column_name = 'emoji'
    ) AS prerequisites_ok,
  (SELECT count(*) = 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'expense_create_unified_participant_invitation') AS exact_overload_count_ok,
  (SELECT procedure.prosecdef
      AND coalesce(array_to_string(procedure.proconfig, ','), '') LIKE '%search_path=%'
    FROM pg_proc AS procedure, target
    WHERE procedure.oid = target.helper_oid) AS target_configuration_ok,
  (SELECT definition FROM constraint_state) AS current_template_constraint,
  EXISTS (
    SELECT 1 FROM constraint_state
    WHERE convalidated AND definition LIKE '%v3%'
  ) AS already_applied,
  NOT EXISTS (
    SELECT 1 FROM public.expense_member_invitations AS invitation
    WHERE invitation.email_template_version IS NOT NULL
      AND invitation.email_template_version NOT IN ('v1', 'v2', 'v3')
  ) AS current_template_rows_ok,
  (SELECT count(*) FROM public.expense_member_invitations
    WHERE email_template_version = 'v1') AS existing_v1_rows,
  (SELECT count(*) FROM public.expense_member_invitations
    WHERE email_template_version = 'v2') AS existing_v2_rows,
  (SELECT count(*) FROM public.expense_member_invitations
    WHERE email_template_version = 'v3') AS existing_v3_rows,
  (SELECT count(*) FROM public.expense_member_invitations
    WHERE attempt_status = 'reserved') AS reserved_attempt_rows,
  (SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database()
      AND xact_start < now() - interval '5 minutes') AS transactions_older_than_five_minutes;

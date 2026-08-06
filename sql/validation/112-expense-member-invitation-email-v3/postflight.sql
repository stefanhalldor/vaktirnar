-- READ ONLY. Run after SQL112 and share the single result row with Codex.
WITH target AS (
  SELECT to_regprocedure(
    'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)'
  ) AS helper_oid
), helper AS (
  SELECT procedure.oid, procedure.prosecdef, procedure.proconfig,
    pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc AS procedure, target
  WHERE procedure.oid = target.helper_oid
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
  now() AS checked_at,
  (SELECT helper_oid IS NOT NULL FROM target) AS target_signature_ok,
  (SELECT count(*) = 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'expense_create_unified_participant_invitation') AS exact_overload_count_ok,
  (SELECT prosecdef
      AND coalesce(array_to_string(proconfig, ','), '') LIKE '%search_path=%'
    FROM helper) AS target_configuration_ok,
  EXISTS (
    SELECT 1 FROM constraint_state
    WHERE convalidated
      AND definition LIKE '%v1%'
      AND definition LIKE '%v2%'
      AND definition LIKE '%v3%'
  ) AS template_constraint_v3_ok,
  (SELECT definition LIKE '%email_template_version%v3%'
    FROM helper) AS new_invitations_use_v3_ok,
  (SELECT definition LIKE '%concat_ws%'
      AND definition LIKE '%v_group.emoji%'
    FROM helper) AS context_title_and_emoji_snapshot_ok,
  NOT EXISTS (
    SELECT 1 FROM public.expense_member_invitations AS invitation
    WHERE invitation.email_template_version IS NOT NULL
      AND invitation.email_template_version NOT IN ('v1', 'v2', 'v3')
  ) AS template_rows_ok,
  NOT has_function_privilege(
    'service_role',
    'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)',
    'EXECUTE'
  ) AS private_helper_execute_ok,
  NOT EXISTS (
    SELECT 1
    FROM helper
    CROSS JOIN LATERAL aclexplode(
      coalesce((SELECT procedure.proacl FROM pg_proc AS procedure WHERE procedure.oid = helper.oid),
        acldefault('f', (SELECT procedure.proowner FROM pg_proc AS procedure WHERE procedure.oid = helper.oid)))
    ) AS acl
    LEFT JOIN pg_roles AS role ON role.oid = acl.grantee
    WHERE (acl.grantee = 0 OR role.rolname IN ('anon', 'authenticated'))
      AND acl.privilege_type = 'EXECUTE'
  ) AS browser_execute_grants_ok,
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

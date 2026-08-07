-- READ ONLY. Run before SQL114 and share the single result row with Codex.
WITH required_relations(name) AS (
  VALUES
    ('expense_groups'), ('expense_group_members'), ('expenses'),
    ('expense_shares'), ('expense_payments'), ('expense_obligations'),
    ('expense_repayments'), ('expense_activity'),
    ('expense_member_invitations'), ('expense_share_collaborators')
), missing_relations AS (
  SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb) AS names
  FROM required_relations
  WHERE to_regclass('public.' || name) IS NULL
), required_functions(signature) AS (
  VALUES
    ('public.expense_assert_beta_actor(uuid)'),
    ('public.expense_begin_request(uuid,uuid,text,text)'),
    ('public.expense_finish_request(uuid,uuid,jsonb)'),
    ('public.expense_active_member_role(uuid,uuid)'),
    ('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)')
), missing_functions AS (
  SELECT coalesce(jsonb_agg(signature ORDER BY signature), '[]'::jsonb) AS names
  FROM required_functions
  WHERE to_regprocedure(signature) IS NULL
), activity_constraints AS (
  SELECT coalesce(jsonb_agg(pg_get_constraintdef(constraint_row.oid)
    ORDER BY constraint_row.conname), '[]'::jsonb) AS definitions
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = to_regclass('public.expense_activity')
    AND constraint_row.conname IN (
      'expense_activity_event_type_check',
      'expense_activity_entity_type_check',
      'expense_activity_event_entity_check'
    )
)
SELECT current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  (SELECT names = '[]'::jsonb FROM missing_relations)
    AND (SELECT names = '[]'::jsonb FROM missing_functions)
    AND (SELECT count(*) = 3 FROM pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = to_regclass('public.expense_activity')
        AND constraint_row.conname IN (
          'expense_activity_event_type_check',
          'expense_activity_entity_type_check',
          'expense_activity_event_entity_check'
        )
        AND constraint_row.convalidated)
    AS prerequisites_ok,
  (SELECT names FROM missing_relations) AS missing_required_relations,
  (SELECT names FROM missing_functions) AS missing_required_functions,
  to_regclass('public.expense_member_name_revisions') IS NOT NULL AS already_applied,
  (SELECT count(*) FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'expense_member_name_revision_immutable',
        'expense_rename_guest_member'
      )) AS existing_target_functions,
  (SELECT count(*) FROM public.expense_group_members AS member
    WHERE member.status = 'active' AND member.user_id IS NULL) AS active_guest_members,
  (SELECT count(*) FROM public.expense_member_invitations AS invitation
    WHERE invitation.status = 'pending') AS pending_identity_invitations,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'expense_member_name_revisions'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')) AS browser_target_table_grants,
  (SELECT count(*) FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'expense_member_name_revision_immutable',
        'expense_rename_guest_member'
      )
      AND privilege.privilege_type = 'EXECUTE'
      AND (privilege.grantee = 0 OR role.rolname IN ('anon', 'authenticated'))
  ) AS browser_target_function_grants,
  (SELECT count(*) FROM public.expense_shares) AS expense_share_rows,
  (SELECT count(*) FROM public.expense_payments) AS expense_payment_rows,
  (SELECT count(*) FROM public.expense_obligations) AS expense_obligation_rows,
  (SELECT count(*) FROM public.expense_repayments) AS expense_repayment_rows,
  (SELECT coalesce(sum(amount_minor), 0) FROM public.expense_shares) AS expense_share_amount_total,
  (SELECT coalesce(sum(amount_minor), 0) FROM public.expense_payments) AS expense_payment_amount_total,
  (SELECT coalesce(sum(amount_minor), 0) FROM public.expense_obligations) AS expense_obligation_amount_total,
  (SELECT coalesce(sum(amount_minor), 0) FROM public.expense_repayments) AS expense_repayment_amount_total,
  (SELECT definitions FROM activity_constraints) AS current_activity_constraints,
  (SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database()
      AND xact_start < now() - interval '5 minutes') AS transactions_older_than_five_minutes;

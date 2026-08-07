-- READ ONLY. Run before SQL113 and share the single result row with Codex.
WITH required_functions(signature) AS (
  VALUES
    ('public.expense_assert_beta_actor(uuid)'),
    ('public.expense_begin_request(uuid,uuid,text,text)'),
    ('public.expense_finish_request(uuid,uuid,jsonb)'),
    ('public.expense_active_member_role(uuid,uuid)'),
    ('public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)'),
    ('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)'),
    ('public.expense_invite_existing_participant(uuid,uuid,uuid,text,uuid)'),
    ('public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)'),
    ('public.expense_report_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)'),
    ('public.expense_record_received_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)'),
    ('public.expense_transition_repayment(uuid,uuid,text,uuid)')
), missing_functions AS (
  SELECT coalesce(jsonb_agg(signature ORDER BY signature), '[]'::jsonb) AS names
  FROM required_functions
  WHERE to_regprocedure(signature) IS NULL
), required_relations(name) AS (
  VALUES
    ('expense_groups'), ('expense_group_members'), ('expenses'),
    ('expense_shares'), ('expense_payments'), ('expense_obligations'),
    ('expense_repayments'), ('expense_repayment_allocations'),
    ('expense_member_invitations'), ('expense_activity')
), missing_relations AS (
  SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb) AS names
  FROM required_relations
  WHERE to_regclass('public.' || name) IS NULL
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
), invitation_template AS (
  SELECT pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = to_regclass('public.expense_member_invitations')
    AND constraint_row.conname = 'expense_member_invitations_template_check'
), email_v3_helper AS (
  SELECT pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc AS procedure
  WHERE procedure.oid = to_regprocedure(
    'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)'
  )
)
SELECT current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  (SELECT names = '[]'::jsonb FROM missing_relations)
    AND (SELECT names = '[]'::jsonb FROM missing_functions)
    AND EXISTS (
      SELECT 1 FROM invitation_template WHERE definition LIKE '%v3%'
    )
    AND EXISTS (
      SELECT 1 FROM email_v3_helper WHERE definition LIKE '%''v3''%'
    ) AS prerequisites_ok,
  (SELECT names FROM missing_relations) AS missing_required_relations,
  (SELECT names FROM missing_functions) AS missing_required_functions,
  to_regclass('public.expense_share_collaborators') IS NOT NULL AS already_applied,
  (SELECT count(*) FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'expense_guard_share_collaborator_mutation',
        'expense_actor_can_act_for_share_member',
        'expense_add_share_collaborator'
      )) AS existing_target_functions,
  (SELECT count(*) = 3 FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = to_regclass('public.expense_activity')
      AND constraint_row.conname IN (
        'expense_activity_event_type_check',
        'expense_activity_entity_type_check',
        'expense_activity_event_entity_check'
      )
      AND constraint_row.convalidated) AS required_activity_constraints_ok,
  (
    (to_regclass('public.expense_share_collaborators') IS NULL
      AND (SELECT count(*) FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname IN (
            'expense_guard_share_collaborator_mutation',
            'expense_actor_can_act_for_share_member',
            'expense_add_share_collaborator'
          )) = 0)
    OR
    (to_regclass('public.expense_share_collaborators') IS NOT NULL
      AND (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'expense_share_collaborators') = 10
      AND (SELECT count(*) FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname IN (
            'expense_guard_share_collaborator_mutation',
            'expense_actor_can_act_for_share_member',
            'expense_add_share_collaborator'
          )) = 3)
  ) AS target_objects_absent_or_complete,
  (SELECT definitions FROM activity_constraints) AS current_activity_constraints,
  (SELECT greatest(count(*) - 11, 0) FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'expense_assert_beta_actor', 'expense_begin_request',
        'expense_finish_request', 'expense_active_member_role',
        'expense_create_unified_participant_invitation',
        'expense_record_activity', 'expense_invite_existing_participant',
        'expense_respond_scoped_member_invitation', 'expense_report_repayment',
        'expense_record_received_repayment', 'expense_transition_repayment'
      )) AS unexpected_required_function_overloads,
  (SELECT count(*) FROM required_functions
    WHERE has_function_privilege('anon', signature, 'EXECUTE')
       OR has_function_privilege('authenticated', signature, 'EXECUTE')
  ) AS required_browser_execute_grants,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'expense_share_collaborators'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')) AS browser_target_table_grants,
  (SELECT count(*) FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'expense_guard_share_collaborator_mutation',
        'expense_actor_can_act_for_share_member',
        'expense_add_share_collaborator'
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
  (SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database()
      AND xact_start < now() - interval '5 minutes') AS transactions_older_than_five_minutes;

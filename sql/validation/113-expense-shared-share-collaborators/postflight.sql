-- READ ONLY. Run after SQL113 and share the single result row with Codex.
WITH target_functions(signature, public_rpc) AS (
  VALUES
    ('public.expense_guard_share_collaborator_mutation()', false),
    ('public.expense_actor_can_act_for_share_member(uuid,uuid,uuid)', false),
    ('public.expense_add_share_collaborator(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid)', true),
    ('public.expense_invite_existing_participant(uuid,uuid,uuid,text,uuid)', true),
    ('public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)', true),
    ('public.expense_report_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)', true),
    ('public.expense_record_received_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)', true),
    ('public.expense_transition_repayment(uuid,uuid,text,uuid)', true)
), function_state AS (
  SELECT target.signature, target.public_rpc,
    to_regprocedure(target.signature) AS oid
  FROM target_functions AS target
), function_definitions AS (
  SELECT state.signature, pg_get_functiondef(state.oid) AS definition
  FROM function_state AS state
  WHERE state.oid IS NOT NULL
), activity_constraints AS (
  SELECT constraint_row.conname, constraint_row.convalidated,
    pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.expense_activity'::regclass
    AND constraint_row.conname IN (
      'expense_activity_event_type_check',
      'expense_activity_entity_type_check',
      'expense_activity_event_entity_check'
    )
), financial_snapshot AS (
  SELECT
    (SELECT count(*) FROM public.expense_shares) AS share_rows,
    (SELECT count(*) FROM public.expense_payments) AS payment_rows,
    (SELECT count(*) FROM public.expense_obligations) AS obligation_rows,
    (SELECT count(*) FROM public.expense_repayments) AS repayment_rows,
    (SELECT coalesce(sum(amount_minor), 0) FROM public.expense_shares) AS share_total,
    (SELECT coalesce(sum(amount_minor), 0) FROM public.expense_payments) AS payment_total,
    (SELECT coalesce(sum(amount_minor), 0) FROM public.expense_obligations) AS obligation_total,
    (SELECT coalesce(sum(amount_minor), 0) FROM public.expense_repayments) AS repayment_total
)
SELECT current_database() AS database_name,
  now() AS checked_at,
  to_regclass('public.expense_share_collaborators') IS NOT NULL AS collaboration_table_ok,
  (SELECT count(*) = 10 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_share_collaborators')
    AND (SELECT count(*) = 10 FROM pg_constraint
      WHERE conrelid = 'public.expense_share_collaborators'::regclass)
    AND (SELECT count(*) = 4 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'expense_share_collaborators')
    AND (SELECT count(*) = 1 FROM pg_trigger
      WHERE tgrelid = 'public.expense_share_collaborators'::regclass
        AND NOT tgisinternal)
    AND (SELECT count(*) = 2 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'expense_member_invitations'
        AND column_name IN ('shared_expense_id', 'shared_share_member_id'))
    AND (SELECT count(*) = 3 FROM pg_constraint
      WHERE conrelid = 'public.expense_member_invitations'::regclass
        AND conname IN (
          'expense_member_invitations_shared_scope_check',
          'expense_member_invitations_shared_expense_fk',
          'expense_member_invitations_shared_share_fk'
        ))
    AND to_regclass('public.expense_member_invitations_shared_scope_idx') IS NOT NULL
    AS exact_target_schema_counts_ok,
  (SELECT relation.relrowsecurity AND relation.relforcerowsecurity
    FROM pg_class AS relation
    WHERE relation.oid = 'public.expense_share_collaborators'::regclass) AS rls_force_ok,
  NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.expense_share_collaborators'::regclass
  ) AS default_deny_policies_ok,
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'expense_share_collaborators'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) AS browser_table_grants_ok,
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'expense_share_collaborators'
      AND grantee = 'service_role'
      AND privilege_type <> 'SELECT'
  ) AS service_role_direct_writes_ok,
  (SELECT count(*) = 8 AND count(*) FILTER (WHERE oid IS NOT NULL) = 8
    FROM function_state) AS exact_target_signatures_ok,
  (SELECT count(*) FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'expense_guard_share_collaborator_mutation',
        'expense_actor_can_act_for_share_member',
        'expense_add_share_collaborator',
        'expense_invite_existing_participant',
        'expense_respond_scoped_member_invitation',
        'expense_report_repayment',
        'expense_record_received_repayment',
        'expense_transition_repayment'
      )) = 8 AS exact_overload_count_ok,
  NOT EXISTS (
    SELECT 1 FROM function_state
    JOIN pg_proc AS procedure ON procedure.oid = function_state.oid
    WHERE NOT procedure.prosecdef
      OR coalesce(array_to_string(procedure.proconfig, ','), '') NOT LIKE '%search_path=%'
  ) AS security_configuration_ok,
  NOT EXISTS (
    SELECT 1 FROM function_state
    WHERE has_function_privilege('anon', signature, 'EXECUTE')
       OR has_function_privilege('authenticated', signature, 'EXECUTE')
  ) AS browser_execute_grants_ok,
  NOT EXISTS (
    SELECT 1 FROM function_state
    WHERE public_rpc <> has_function_privilege('service_role', signature, 'EXECUTE')
  ) AS service_role_execute_scope_ok,
  (SELECT count(*) = 3 AND bool_and(
      definition LIKE '%expense_actor_can_act_for_share_member%'
    )
    FROM function_definitions
    WHERE signature IN (
      'public.expense_report_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)',
      'public.expense_record_received_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)',
      'public.expense_transition_repayment(uuid,uuid,text,uuid)'
    )) AS exact_share_action_authorization_ok,
  (SELECT definition LIKE '%shared_expense_id%'
      AND definition LIKE '%shared_share_member_id%'
    FROM function_definitions
    WHERE signature = 'public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)'
  ) AS exact_invitation_scope_ok,
  (SELECT definition NOT LIKE '%INSERT INTO public.expense_shares%'
      AND definition NOT LIKE '%INSERT INTO public.expense_payments%'
      AND definition NOT LIKE '%financial_version =%'
    FROM function_definitions
    WHERE signature = 'public.expense_add_share_collaborator(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid)'
  ) AS add_rpc_financial_independence_ok,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.expense_share_collaborators'::regclass
      AND conname = 'expense_share_collaborators_expense_share_fk'
  ) AS canonical_share_fk_ok,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.expense_share_collaborators'::regclass
      AND tgname = 'expense_share_collaborators_immutable_guard'
      AND NOT tgisinternal
  ) AS immutable_guard_ok,
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_share_collaborators'
      AND column_name IN ('amount_minor', 'currency', 'percentage', 'shares')
  ) AS no_financial_columns_ok,
  NOT EXISTS (
    SELECT 1
    FROM public.expense_share_collaborators AS collaboration
    LEFT JOIN public.expense_shares AS share_row
      ON share_row.expense_id = collaboration.expense_id
     AND share_row.member_id = collaboration.share_member_id
    WHERE collaboration.status = 'active' AND share_row.expense_id IS NULL
  ) AS active_mappings_have_canonical_share_ok,
  NOT EXISTS (
    SELECT collaboration.expense_id, collaboration.collaborator_member_id
    FROM public.expense_share_collaborators AS collaboration
    WHERE collaboration.status = 'active'
    GROUP BY collaboration.expense_id, collaboration.collaborator_member_id
    HAVING count(*) > 1
  ) AS one_active_share_per_actor_ok,
  NOT EXISTS (
    SELECT 1
    FROM public.expense_member_invitations AS invitation
    WHERE (invitation.shared_expense_id IS NULL)
      <> (invitation.shared_share_member_id IS NULL)
  ) AS invitation_scope_lifecycle_ok,
  (SELECT count(*) = 3
      AND bool_and(convalidated)
      AND count(*) FILTER (
        WHERE definition LIKE '%expense_share_collaborator%'
      ) = 2
    FROM activity_constraints) AS activity_constraints_ok,
  (SELECT count(*) FROM public.expense_share_collaborators) AS collaboration_rows,
  (SELECT share_rows FROM financial_snapshot) AS expense_share_rows,
  (SELECT payment_rows FROM financial_snapshot) AS expense_payment_rows,
  (SELECT obligation_rows FROM financial_snapshot) AS expense_obligation_rows,
  (SELECT repayment_rows FROM financial_snapshot) AS expense_repayment_rows,
  (SELECT share_total FROM financial_snapshot) AS expense_share_amount_total,
  (SELECT payment_total FROM financial_snapshot) AS expense_payment_amount_total,
  (SELECT obligation_total FROM financial_snapshot) AS expense_obligation_amount_total,
  (SELECT repayment_total FROM financial_snapshot) AS expense_repayment_amount_total,
  (SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database()
      AND xact_start < now() - interval '5 minutes') AS transactions_older_than_five_minutes;

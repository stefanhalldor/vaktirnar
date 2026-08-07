-- READ ONLY. Run after SQL114 and share the single result row with Codex.
WITH target_functions(signature, service_rpc) AS (
  VALUES
    ('public.expense_member_name_revision_immutable()', false),
    ('public.expense_rename_guest_member(uuid,uuid,uuid,text,uuid)', true)
), function_state AS (
  SELECT target.signature, target.service_rpc,
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
  to_regclass('public.expense_member_name_revisions') IS NOT NULL AS revision_table_ok,
  (SELECT count(*) = 8 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_member_name_revisions')
    AND (SELECT count(*) = 6 FROM pg_constraint
      WHERE conrelid = 'public.expense_member_name_revisions'::regclass)
    AND (SELECT count(*) = 3 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'expense_member_name_revisions')
    AND (SELECT count(*) = 1 FROM pg_trigger
      WHERE tgrelid = 'public.expense_member_name_revisions'::regclass
        AND NOT tgisinternal)
    AS exact_target_schema_counts_ok,
  (SELECT relation.relrowsecurity AND relation.relforcerowsecurity
    FROM pg_class AS relation
    WHERE relation.oid = 'public.expense_member_name_revisions'::regclass) AS rls_force_ok,
  NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.expense_member_name_revisions'::regclass
  ) AS default_deny_policies_ok,
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'expense_member_name_revisions'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) AS browser_table_grants_ok,
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'expense_member_name_revisions'
      AND grantee = 'service_role'
      AND privilege_type <> 'SELECT'
  ) AS service_role_direct_writes_ok,
  (SELECT count(*) = 2 AND count(*) FILTER (WHERE oid IS NOT NULL) = 2
    FROM function_state) AS exact_target_signatures_ok,
  (SELECT count(*) = 2 FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'expense_member_name_revision_immutable',
        'expense_rename_guest_member'
      )) AS exact_overload_count_ok,
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
    WHERE service_rpc <> has_function_privilege('service_role', signature, 'EXECUTE')
  ) AS service_role_execute_scope_ok,
  (SELECT definition LIKE '%expense_assert_beta_actor%'
      AND definition LIKE '%expense_active_member_role%'
      AND definition LIKE '%NOT IN (''owner'', ''admin'')%'
      AND definition LIKE '%v_member.user_id IS NOT NULL%'
      AND definition LIKE '%v_member.status <> ''active''%'
      AND definition LIKE '%JOIN public.expense_shares%'
    FROM function_definitions
    WHERE signature = 'public.expense_rename_guest_member(uuid,uuid,uuid,text,uuid)'
  ) AS exact_manager_guest_share_scope_ok,
  (SELECT definition LIKE '%expense_begin_request%'
      AND definition LIKE '%expense_finish_request%'
      AND definition LIKE '%expense_group_member_renamed%'
      AND definition LIKE '%INSERT INTO public.expense_member_name_revisions%'
      AND definition LIKE '%guest_display_name_snapshot = v_display_name%'
    FROM function_definitions
    WHERE signature = 'public.expense_rename_guest_member(uuid,uuid,uuid,text,uuid)'
  ) AS idempotent_audit_and_invitation_snapshot_ok,
  (SELECT definition NOT LIKE '%INSERT INTO public.expense_shares%'
      AND definition NOT LIKE '%UPDATE public.expense_shares%'
      AND definition NOT LIKE '%INSERT INTO public.expense_payments%'
      AND definition NOT LIKE '%UPDATE public.expense_payments%'
      AND definition NOT LIKE '%expense_obligations%'
      AND definition NOT LIKE '%expense_repayments%'
      AND definition NOT LIKE '%financial_version%'
    FROM function_definitions
    WHERE signature = 'public.expense_rename_guest_member(uuid,uuid,uuid,text,uuid)'
  ) AS financial_independence_ok,
  (SELECT count(*) = 3
      AND bool_and(convalidated)
      AND count(*) FILTER (
        WHERE definition LIKE '%expense_group_member_renamed%'
      ) = 2
    FROM activity_constraints) AS activity_constraints_ok,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.expense_member_name_revisions'::regclass
      AND tgname = 'expense_member_name_revisions_immutable_guard'
      AND NOT tgisinternal
  ) AS immutable_guard_ok,
  NOT EXISTS (
    SELECT 1
    FROM public.expense_member_name_revisions AS revision
    LEFT JOIN public.expense_activity AS activity
      ON activity.id = revision.activity_id
     AND activity.group_id = revision.group_id
     AND activity.entity_id = revision.expense_id
     AND activity.event_type = 'expense_group_member_renamed'
     AND activity.entity_type = 'expense'
    WHERE activity.id IS NULL
      OR revision.old_display_name = revision.new_display_name
      OR revision.old_display_name <> btrim(revision.old_display_name)
      OR revision.new_display_name <> btrim(revision.new_display_name)
  ) AS revision_lifecycle_ok,
  (SELECT count(*) FROM public.expense_member_name_revisions) AS revision_rows,
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

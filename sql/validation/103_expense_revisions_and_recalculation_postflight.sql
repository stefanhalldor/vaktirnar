-- SQL103 postflight. 100% read-only. Run immediately after SQL103 and again
-- after localhost testing if desired.
WITH target_functions(signature) AS (
  VALUES
    ('public.expense_valid_revision_fields(text[])'),
    ('public.expense_valid_revision_snapshot(jsonb)'),
    ('public.expense_revisions_immutable()'),
    ('public.expense_build_revision_snapshot(uuid,uuid)'),
    ('public.expense_reported_repayments_need_review(uuid)'),
    ('public.expense_guard_new_reported_repayment()')
), function_state AS (
  SELECT
    count(*) FILTER (WHERE to_regprocedure(signature) IS NOT NULL) AS present_count,
    count(*) AS expected_count
  FROM target_functions
), table_state AS (
  SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'expense_revisions'
), update_definition AS (
  SELECT pg_get_functiondef('public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'::regprocedure) AS body
), revision_constraints AS (
  SELECT count(*) FILTER (WHERE conname IN (
    'expense_revisions_version_check', 'expense_revisions_changed_fields_check',
    'expense_revisions_before_snapshot_check', 'expense_revisions_after_snapshot_check',
    'expense_revisions_group_expense_fk', 'expense_revisions_expense_version_unique'
  )) AS present_count
  FROM pg_constraint WHERE conrelid = 'public.expense_revisions'::regclass
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  to_regclass('public.expense_revisions') IS NOT NULL AS revision_table_ok,
  coalesce(table_state.rls_enabled AND table_state.rls_forced, false) AS revision_rls_force_ok,
  function_state.present_count = function_state.expected_count AS helper_functions_ok,
  revision_constraints.present_count = 6 AS bounded_constraints_ok,
  (SELECT count(*) = 1 FROM pg_trigger
   WHERE tgrelid = 'public.expense_revisions'::regclass
     AND tgname = 'expense_revisions_immutable_guard' AND NOT tgisinternal) AS revision_immutable_guard_ok,
  (SELECT count(*) = 1 FROM pg_trigger
   WHERE tgrelid = 'public.expense_repayments'::regclass
     AND tgname = 'expense_repayments_review_guard' AND NOT tgisinternal) AS repayment_review_guard_ok,
  update_definition.body LIKE '%v_group.status NOT IN (''active'', ''settling'', ''settled'')%'
    AND update_definition.body LIKE '%INSERT INTO public.expense_revisions%'
    AND update_definition.body LIKE '%expense_group_reopened_after_expense_edit%'
    AND update_definition.body LIKE '%financial_version = group_row.financial_version + 1%'
    AND update_definition.body NOT LIKE '%repayment.status IN (''reported'', ''confirmed'')%'
    AS audited_edit_rpc_ok,
  (SELECT count(*) = 0 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'expense_revisions')
    AS default_deny_policies_ok,
  (SELECT count(*) = 0 FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'expense_revisions'
     AND grantee IN ('anon','authenticated')) AS browser_table_grants_ok,
  (SELECT count(*) = 1 FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'expense_revisions'
     AND grantee = 'service_role' AND privilege_type = 'SELECT') AS service_role_select_only_ok,
  (SELECT count(*) = 0 FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'expense_revisions'
     AND grantee = 'service_role' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'))
    AS service_role_direct_writes_ok,
  (SELECT count(*) = 0 FROM information_schema.routine_privileges
   WHERE routine_schema = 'public'
     AND routine_name IN (
       'expense_valid_revision_fields','expense_valid_revision_snapshot',
       'expense_revisions_immutable','expense_build_revision_snapshot',
       'expense_reported_repayments_need_review','expense_guard_new_reported_repayment'
     ) AND grantee IN ('anon','authenticated','service_role')) AS private_helper_execute_ok,
  (SELECT count(*) FROM public.expense_revisions) AS revision_rows,
  (SELECT count(*) FROM pg_stat_activity
   WHERE datname = current_database() AND pid <> pg_backend_pid()
     AND xact_start < now() - interval '5 minutes') AS transactions_older_than_five_minutes
FROM function_state, table_state, update_definition, revision_constraints;

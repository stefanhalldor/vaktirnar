-- Read-only postflight for SQL102. Stebbi runs this immediately after SQL102.
WITH target_functions AS (
  SELECT routine.routine_name
  FROM information_schema.routines AS routine
  WHERE routine.routine_schema = 'public'
    AND routine.routine_name IN (
      'expense_assert_private_draft_context',
      'expense_save_private_draft',
      'expense_get_private_draft',
      'expense_delete_private_draft',
      'expense_create_expense_with_known_members'
    )
), target_table AS (
  SELECT class.oid, class.relrowsecurity, class.relforcerowsecurity
  FROM pg_class AS class
  JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'public'
    AND class.relname = 'expense_private_drafts'
), grants AS (
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'expense_private_drafts'
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  to_regclass('public.expense_private_drafts') IS NOT NULL AS draft_table_ok,
  coalesce((SELECT relrowsecurity AND relforcerowsecurity FROM target_table), false) AS rls_force_ok,
  (SELECT count(*) FROM target_functions) = 5 AS functions_ok,
  NOT EXISTS (SELECT 1 FROM grants WHERE grantee IN ('anon', 'authenticated'))
    AS browser_table_grants_ok,
  NOT EXISTS (SELECT 1 FROM grants WHERE grantee = 'service_role')
    AS service_role_direct_table_grants_ok,
  NOT has_function_privilege('anon', 'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', 'EXECUTE')
    AS browser_function_execute_ok,
  has_function_privilege('service_role', 'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.expense_get_private_draft(uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.expense_delete_private_draft(uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')
    AS service_role_rpc_execute_ok,
  NOT has_function_privilege('service_role', 'public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', 'EXECUTE')
    AS private_helper_execute_ok,
  NOT has_function_privilege('anon', 'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')
    AS known_member_wrapper_browser_execute_ok,
  (SELECT count(*) FROM public.expense_private_drafts) = 0 AS no_backfill_ok,
  (SELECT count(*) FROM public.expense_private_drafts) AS draft_rows;

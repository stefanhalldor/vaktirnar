-- Read-only SQL111 postflight. Stebbi runs this after SQL111.
WITH target AS (
  SELECT
    procedure.oid,
    procedure.prosecdef,
    procedure.proconfig,
    pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'expense_list_my_private_drafts'
    AND pg_get_function_identity_arguments(procedure.oid) = 'p_actor_id uuid'
), overloads AS (
  SELECT count(*) AS count
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'expense_list_my_private_drafts'
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  to_regprocedure('public.expense_list_my_private_drafts(uuid)') IS NOT NULL AS target_signature_ok,
  (SELECT count FROM overloads) = 1 AS exact_overload_count_ok,
  coalesce((SELECT prosecdef FROM target), false)
    AND coalesce((SELECT proconfig @> ARRAY['search_path=pg_catalog, public'] FROM target), false)
    AS security_configuration_ok,
  coalesce((SELECT definition ILIKE '%draft.actor_user_id = p_actor_id%' FROM target), false)
    AND coalesce((SELECT definition ILIKE '%PERFORM public.expense_assert_beta_actor(p_actor_id)%' FROM target), false)
    AS actor_exact_and_feature_gated_ok,
  coalesce((SELECT definition ILIKE '%LIMIT 100%' FROM target), false) AS bounded_result_ok,
  coalesce((SELECT definition ILIKE '%repayment.status IN (''reported'', ''confirmed'')%' FROM target), false)
    AS stale_edit_drafts_hidden_ok,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name = 'expense_list_my_private_drafts'
      AND grantee = 'PUBLIC'
      AND privilege_type = 'EXECUTE'
  )
    AND NOT has_function_privilege('anon', 'public.expense_list_my_private_drafts(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.expense_list_my_private_drafts(uuid)', 'EXECUTE')
    AS browser_execute_revoked_ok,
  has_function_privilege('service_role', 'public.expense_list_my_private_drafts(uuid)', 'EXECUTE')
    AS service_role_execute_ok,
  (
    SELECT count(*)
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'expense_private_drafts'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) = 0 AS direct_draft_table_grants_ok,
  (
    SELECT count(*)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND xact_start < now() - interval '5 minutes'
      AND pid <> pg_backend_pid()
  ) AS transactions_older_than_five_minutes;

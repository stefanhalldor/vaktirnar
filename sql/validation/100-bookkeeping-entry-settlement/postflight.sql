-- SQL100 entry-settlement postflight — READ ONLY.
-- Expected: every *_ok=true; every *_grants/unexpected_*/violations=0;
-- bookkeeping counts are 11 tables / 18 RPCs / 41 functions.

WITH target_table AS (
  SELECT relation.oid, relation.relrowsecurity, relation.relforcerowsecurity
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'bookkeeping_entry_settlements'
    AND relation.relkind = 'r'
), target_function AS (
  SELECT procedure.oid, procedure.prosrc, procedure.prosecdef,
    pg_catalog.oidvectortypes(procedure.proargtypes) AS arguments,
    pg_catalog.pg_get_function_result(procedure.oid) AS result_type,
    EXISTS (SELECT 1 FROM unnest(coalesce(procedure.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting ~ '^search_path=(""|)$') AS fixed_empty_search_path
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'bookkeeping_set_entry_settlement_state'
), helper_functions AS (
  SELECT procedure.proname, procedure.prosrc
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN ('bookkeeping_entry_json', 'bookkeeping_prepare_account_deletion')
), activity_constraint AS (
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'bookkeeping_activity'
    AND constraint_row.conname = 'bookkeeping_activity_event_type_check'
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  (SELECT count(*) = 1 FROM target_table) AS settlement_table_ok,
  coalesce((SELECT relrowsecurity AND relforcerowsecurity FROM target_table), false)
    AS settlement_rls_ok,
  (SELECT count(*) = 1 FROM pg_catalog.pg_trigger AS trigger_row
    JOIN target_table ON target_table.oid = trigger_row.tgrelid
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgname = 'bookkeeping_entry_settlements_reject_delete')
    AS settlement_delete_guard_ok,
  (SELECT count(*) = 1
    AND bool_and(arguments = 'uuid, uuid, uuid, bigint, text'
      AND result_type = 'jsonb' AND prosecdef AND fixed_empty_search_path)
    FROM target_function) AS settlement_rpc_ok,
  coalesce((SELECT prosrc ~ 'bookkeeping_begin_request'
      AND prosrc ~ 'p_expected_settlement_version'
      AND prosrc ~ 'pg_advisory_xact_lock'
      AND prosrc ~ 'bookkeeping_version_conflict'
      AND prosrc !~ 'bookkeeping_assert_period_mutable'
      AND prosrc !~ 'UPDATE public.bookkeeping_periods'
    FROM target_function), false) AS idempotency_cas_and_lock_independence_ok,
  coalesce((SELECT prosrc ~ 'entry_settlement_changed'
      AND prosrc ~ '''from_state'''
      AND prosrc ~ '''to_state'''
    FROM target_function), false) AS bounded_audit_ok,
  coalesce((SELECT prosrc ~ '''settlementState'''
      AND prosrc ~ '''settlementVersion'''
      AND prosrc ~ 'LEFT JOIN public.bookkeeping_entry_settlements'
    FROM helper_functions WHERE proname = 'bookkeeping_entry_json'), false)
    AS read_model_ok,
  coalesce((SELECT prosrc ~ 'UPDATE public.bookkeeping_entry_settlements'
    FROM helper_functions WHERE proname = 'bookkeeping_prepare_account_deletion'), false)
    AS account_deletion_ok,
  (SELECT count(*) = 1 AND bool_and(definition ~ 'entry_settlement_changed')
    FROM activity_constraint) AS activity_constraint_ok,
  (SELECT count(*) FROM pg_catalog.pg_policy AS policy
    JOIN target_table ON target_table.oid = policy.polrelid) AS unexpected_policies,
  (SELECT count(*) FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'bookkeeping_entry_settlements'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')) AS browser_table_grants,
  (SELECT count(*) FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'bookkeeping_entry_settlements'
      AND grantee = 'service_role') AS service_role_table_grants,
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name = 'bookkeeping_set_entry_settlement_state'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')) AS browser_function_execute,
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name = 'bookkeeping_set_entry_settlement_state'
      AND grantee = 'service_role') = 1 AS service_role_rpc_execute_ok,
  (SELECT count(*) FROM target_function
    WHERE arguments <> 'uuid, uuid, uuid, bigint, text') AS unexpected_target_overloads,
  (SELECT count(*) FROM public.bookkeeping_entry_settlements AS settlement
    WHERE settlement.version < 1
      OR settlement.state NOT IN ('open', 'settled')
      OR (settlement.state = 'open'
        AND (settlement.settled_at IS NOT NULL OR settlement.settled_by IS NOT NULL))
      OR (settlement.state = 'settled' AND settlement.settled_at IS NULL))
    AS settlement_lifecycle_violations,
  (SELECT count(*) FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
      AND relation.relname LIKE 'bookkeeping\_%' ESCAPE '\') AS bookkeeping_table_count,
  (SELECT count(*) FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname LIKE 'bookkeeping\_%' ESCAPE '\'
      AND has_function_privilege('service_role', procedure.oid, 'EXECUTE'))
    AS bookkeeping_rpc_count,
  (SELECT count(*) FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname LIKE 'bookkeeping\_%' ESCAPE '\')
    AS bookkeeping_function_count;

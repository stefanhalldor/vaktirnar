-- SQL99 bookkeeping entry JSON repair preflight — READ ONLY.
-- Run against the intended Supabase project before SQL99. Stop on any
-- unexpected value. The first run normally reports repair_needed=true;
-- an intentional idempotent rerun reports already_repaired=true instead.

WITH target_function AS (
  SELECT procedure.oid, procedure.prosrc, procedure.provolatile,
    procedure.prosecdef,
    pg_catalog.pg_get_function_result(procedure.oid) AS result_type,
    pg_catalog.oidvectortypes(procedure.proargtypes) AS argument_types,
    EXISTS (
      SELECT 1
      FROM unnest(coalesce(procedure.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting ~ '^search_path=(""|)$'
    ) AS fixed_empty_search_path
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'bookkeeping_assert_entry_payload'
    AND pg_catalog.oidvectortypes(procedure.proargtypes) = 'jsonb'
), same_name_functions AS (
  SELECT procedure.oid,
    pg_catalog.oidvectortypes(procedure.proargtypes) AS argument_types
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'bookkeeping_assert_entry_payload'
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  to_regprocedure('public.bookkeeping_assert_entry_payload(jsonb)') IS NOT NULL
    AND to_regprocedure('public.bookkeeping_create_entry(uuid,uuid,uuid,jsonb)') IS NOT NULL
    AND to_regprocedure('public.bookkeeping_update_entry(uuid,uuid,uuid,bigint,jsonb)') IS NOT NULL
    AS prerequisites_ok,
  (SELECT count(*) FROM target_function) = 1 AS target_signature_ok,
  coalesce((SELECT result_type = 'void'
    AND argument_types = 'jsonb'
    AND provolatile = 'i'
    AND NOT prosecdef
    AND fixed_empty_search_path
    FROM target_function), false) AS target_configuration_ok,
  coalesce((SELECT pg_catalog.strpos(
    prosrc,
    '(p_entry->''special_cases'' - ARRAY['
  ) > 0 FROM target_function), false) AS repair_needed,
  coalesce((SELECT pg_catalog.strpos(
    prosrc,
    '((p_entry->''special_cases'') - ARRAY['
  ) > 0 FROM target_function), false) AS already_repaired,
  coalesce((SELECT
    pg_catalog.strpos(prosrc, '(p_entry->''special_cases'' - ARRAY[') = 0
    AND pg_catalog.strpos(prosrc, '((p_entry->''special_cases'') - ARRAY[') = 0
    FROM target_function), true) AS unexpected_operator_form,
  (SELECT count(*) FROM same_name_functions WHERE argument_types <> 'jsonb')
    AS unexpected_target_overloads,
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name = 'bookkeeping_assert_entry_payload'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated'))
    AS browser_execute_grants,
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name = 'bookkeeping_assert_entry_payload'
      AND grantee = 'service_role')
    AS service_role_execute_grants,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND xact_start IS NOT NULL
      AND xact_start < now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;

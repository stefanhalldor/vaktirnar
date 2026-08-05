-- SQL99 bookkeeping entry JSON repair postflight — READ ONLY.
-- Run only after SQL99 reports success. Expected: every *_ok=true and every
-- *_grants / unexpected_* counter=0. Counts remain 10 tables / 40 functions.

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
), entry_callers AS (
  SELECT procedure.proname, procedure.prosrc
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND (
      (procedure.proname = 'bookkeeping_create_entry'
        AND pg_catalog.oidvectortypes(procedure.proargtypes) = 'uuid, uuid, uuid, jsonb')
      OR (procedure.proname = 'bookkeeping_update_entry'
        AND pg_catalog.oidvectortypes(procedure.proargtypes) = 'uuid, uuid, uuid, bigint, jsonb')
    )
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  (SELECT count(*) FROM target_function) = 1 AS target_signature_ok,
  coalesce((SELECT result_type = 'void'
    AND argument_types = 'jsonb'
    AND provolatile = 'i'
    AND NOT prosecdef
    AND fixed_empty_search_path
    FROM target_function), false) AS target_configuration_ok,
  coalesce((SELECT
    pg_catalog.strpos(prosrc, '((p_entry->''special_cases'') - ARRAY[') > 0
    AND pg_catalog.strpos(prosrc, '(p_entry->''special_cases'' - ARRAY[') = 0
    FROM target_function), false) AS operator_precedence_fix_ok,
  (SELECT count(*) = 2
    AND bool_and(pg_catalog.strpos(
      prosrc,
      'bookkeeping_assert_entry_payload(p_entry)'
    ) > 0)
    FROM entry_callers) AS entry_callers_ok,
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
  (SELECT count(*)
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'bookkeeping_assert_entry_payload'
      AND pg_catalog.oidvectortypes(procedure.proargtypes) <> 'jsonb')
    AS unexpected_target_overloads,
  (SELECT count(*) FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname LIKE 'bookkeeping\_%' ESCAPE '\')
    AS bookkeeping_table_count,
  (SELECT count(*) FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname LIKE 'bookkeeping\_%' ESCAPE '\')
    AS bookkeeping_function_count;

-- SQL104 expense revision snapshot JSON repair preflight — READ ONLY.
-- Run against the intended Supabase project before SQL104. Stop on any
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
    AND procedure.proname = 'expense_valid_revision_snapshot'
    AND pg_catalog.oidvectortypes(procedure.proargtypes) = 'jsonb'
), same_name_functions AS (
  SELECT procedure.oid,
    pg_catalog.oidvectortypes(procedure.proargtypes) AS argument_types
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'expense_valid_revision_snapshot'
), operator_state AS (
  SELECT
    pg_catalog.strpos(prosrc, 'v_expense->''note'' <> ''null''::jsonb') > 0
      AS broken_note_form,
    pg_catalog.strpos(prosrc, 'v_expense->''category'' <> ''null''::jsonb') > 0
      AS broken_category_form,
    pg_catalog.strpos(prosrc, '(v_expense->''note'') <> ''null''::jsonb') > 0
      AS fixed_note_form,
    pg_catalog.strpos(prosrc, '(v_expense->''category'') <> ''null''::jsonb') > 0
      AS fixed_category_form
  FROM target_function
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  to_regprocedure('public.expense_valid_revision_snapshot(jsonb)') IS NOT NULL
    AND to_regclass('public.expense_revisions') IS NOT NULL
    AS prerequisites_ok,
  (SELECT count(*) FROM target_function) = 1 AS target_signature_ok,
  coalesce((SELECT result_type = 'boolean'
    AND argument_types = 'jsonb'
    AND provolatile = 'i'
    AND NOT prosecdef
    AND fixed_empty_search_path
    FROM target_function), false) AS target_configuration_ok,
  coalesce((SELECT broken_note_form AND broken_category_form
    FROM operator_state), false) AS repair_needed,
  coalesce((SELECT fixed_note_form AND fixed_category_form
    AND NOT broken_note_form AND NOT broken_category_form
    FROM operator_state), false) AS already_repaired,
  coalesce((SELECT NOT (
      (broken_note_form AND broken_category_form)
      OR (fixed_note_form AND fixed_category_form
        AND NOT broken_note_form AND NOT broken_category_form)
    ) FROM operator_state), true) AS unexpected_operator_form,
  (SELECT count(*) FROM same_name_functions WHERE argument_types <> 'jsonb')
    AS unexpected_target_overloads,
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name = 'expense_valid_revision_snapshot'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated'))
    AS browser_execute_grants,
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name = 'expense_valid_revision_snapshot'
      AND grantee = 'service_role')
    AS service_role_execute_grants,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND xact_start IS NOT NULL
      AND xact_start < now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;

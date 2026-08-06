-- SQL104 expense revision snapshot JSON repair postflight — READ ONLY.
-- Run only after SQL104 reports success. Expected: every *_ok=true and every
-- *_grants / unexpected_* counter=0.

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
), valid_snapshot AS (
  SELECT jsonb_build_object(
    'version', 1,
    'groupStatus', 'active',
    'expense', jsonb_build_object(
      'title', 'SQL104 validation',
      'note', 'Read-only probe',
      'totalMinor', 100,
      'currency', 'ISK',
      'incurredOn', '2026-08-05',
      'category', 'other',
      'splitMethod', 'equal'
    ),
    'payments', jsonb_build_array(jsonb_build_object(
      'memberId', '00000000-0000-4000-8000-000000000001',
      'displayName', 'SQL104',
      'amountMinor', 100
    )),
    'shares', jsonb_build_array(jsonb_build_object(
      'memberId', '00000000-0000-4000-8000-000000000001',
      'displayName', 'SQL104',
      'amountMinor', 100
    )),
    'balances', jsonb_build_array(),
    'repaymentSummary', jsonb_build_object(
      'reported', 0, 'confirmed', 0, 'rejected', 0, 'cancelled', 0
    )
  ) AS value
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  (SELECT count(*) FROM target_function) = 1 AS target_signature_ok,
  coalesce((SELECT result_type = 'boolean'
    AND argument_types = 'jsonb'
    AND provolatile = 'i'
    AND NOT prosecdef
    AND fixed_empty_search_path
    FROM target_function), false) AS target_configuration_ok,
  coalesce((SELECT fixed_note_form AND fixed_category_form
    AND NOT broken_note_form AND NOT broken_category_form
    FROM operator_state), false) AS operator_precedence_fix_ok,
  (SELECT public.expense_valid_revision_snapshot(value)
    FROM valid_snapshot) AS valid_snapshot_probe_ok,
  (SELECT NOT public.expense_valid_revision_snapshot(
      jsonb_set(value, '{expense,note}', to_jsonb(repeat('x', 1001)))
    ) FROM valid_snapshot) AS invalid_snapshot_probe_ok,
  (SELECT count(*) = 2 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.expense_revisions'::regclass
      AND conname IN (
        'expense_revisions_before_snapshot_check',
        'expense_revisions_after_snapshot_check'
      )
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%expense_valid_revision_snapshot%') AS revision_constraints_ok,
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
  (SELECT count(*)
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'expense_valid_revision_snapshot'
      AND pg_catalog.oidvectortypes(procedure.proargtypes) <> 'jsonb')
    AS unexpected_target_overloads,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND xact_start IS NOT NULL
      AND xact_start < now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;

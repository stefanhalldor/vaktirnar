-- SQL140 read-only preflight. Stop unless prerequisites_ok is true.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

WITH checks AS (
  SELECT
    (current_user = 'postgres' OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = current_user AND role_row.rolsuper
    )) AS executor_ok,
    pg_catalog.to_regclass('public.teskeid_events') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_guests') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_groups') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_group_members') IS NOT NULL
      AND pg_catalog.to_regclass('public.expenses') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_payments') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_repayments') IS NOT NULL
      AS relations_ok,
    pg_catalog.to_regprocedure('public.teskeid_event_assert_actor(uuid)') IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_assert_financial_actor(uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_normalize_text(text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_valid_text(text,integer,integer)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_group_balances(uuid,boolean)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_get_expense_preview(uuid,uuid)'
      ) IS NOT NULL
      AS functions_ok,
    COALESCE((
      SELECT pg_catalog.md5(pg_catalog.replace(
        function_row.prosrc, E'\r\n', E'\n'
      )) = '377b2f0520cbbf0345b6da864846e96e'
        AND owner_role.rolname = 'postgres'
        AND function_row.prosecdef
        AND function_row.prokind = 'f'
        AND NOT function_row.proretset
        AND function_row.provolatile = 's'
        AND function_row.proparallel = 'u'
        AND NOT function_row.proisstrict
        AND NOT function_row.proleakproof
        AND function_row.pronargdefaults = 0
        AND function_row.prolang = (
          SELECT language_row.oid FROM pg_catalog.pg_language AS language_row
          WHERE language_row.lanname = 'plpgsql'
        )
        AND pg_catalog.pg_get_function_arguments(function_row.oid)
              = 'p_actor_id uuid, p_event_id uuid'
        AND pg_catalog.pg_get_function_result(function_row.oid) = 'jsonb'
        AND function_row.proconfig[1] IN ('search_path=', 'search_path=""')
        AND pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
      FROM pg_catalog.pg_proc AS function_row
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = function_row.proowner
      WHERE function_row.oid = pg_catalog.to_regprocedure(
        'public.teskeid_event_get_expense_preview(uuid,uuid)'
      )
    ), false) AS sql139_preview_unchanged_ok,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS function_row
      WHERE function_row.pronamespace = 'public'::pg_catalog.regnamespace
        AND function_row.proname IN (
          'teskeid_event_get_expense_activity',
          'teskeid_event_get_expense_context_labels'
        )
    ) AS targets_clear
)
SELECT pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  executor_ok,
  relations_ok,
  functions_ok,
  sql139_preview_unchanged_ok,
  targets_clear,
  executor_ok AND relations_ok AND functions_ok
    AND sql139_preview_unchanged_ok AND targets_clear AS prerequisites_ok
FROM checks;
ROLLBACK;

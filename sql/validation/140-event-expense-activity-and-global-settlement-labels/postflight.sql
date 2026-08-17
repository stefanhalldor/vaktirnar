-- SQL140 read-only postflight. Require postconditions_ok=true.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

WITH expected(signature, body_md5) AS (VALUES
  ('public.teskeid_event_get_expense_activity(uuid,uuid)'::text,
   '18e145ca9e417df099190e27ca6e5015'::text),
  ('public.teskeid_event_get_expense_context_labels(uuid,uuid[])'::text,
   '6dd096389519b6a218b2703190f98b11'::text)
), function_contract AS (
  SELECT pg_catalog.count(*) = 2
    AND pg_catalog.bool_and(owner_role.rolname = 'postgres')
    AND pg_catalog.bool_and(function_row.prosecdef)
    AND pg_catalog.bool_and(function_row.prokind = 'f')
    AND pg_catalog.bool_and(function_row.provolatile = 's')
    AND pg_catalog.bool_and(function_row.proparallel = 'u')
    AND pg_catalog.bool_and(NOT function_row.proisstrict)
    AND pg_catalog.bool_and(NOT function_row.proleakproof)
    AND pg_catalog.bool_and(function_row.pronargdefaults = 0)
    AND pg_catalog.bool_and(function_row.prolang = (
      SELECT language_row.oid FROM pg_catalog.pg_language AS language_row
      WHERE language_row.lanname = 'plpgsql'
    ))
    AND pg_catalog.bool_and(NOT function_row.proretset)
    AND pg_catalog.bool_and(function_row.prorettype = 'jsonb'::pg_catalog.regtype)
    AND pg_catalog.bool_and(pg_catalog.pg_get_function_result(function_row.oid) = 'jsonb')
    AND pg_catalog.bool_and(pg_catalog.pg_get_function_arguments(function_row.oid) = CASE
      WHEN function_row.proname = 'teskeid_event_get_expense_activity'
        THEN 'p_actor_id uuid, p_event_id uuid'
      ELSE 'p_actor_id uuid, p_group_ids uuid[]'
    END)
    AND pg_catalog.bool_and(function_row.proconfig[1] IN ('search_path=', 'search_path=""'))
    AND pg_catalog.bool_and(pg_catalog.md5(pg_catalog.replace(
      function_row.prosrc, E'\r\n', E'\n'
    )) = expected.body_md5)
    AND (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_proc AS named_function
         WHERE named_function.pronamespace = 'public'::pg_catalog.regnamespace
           AND named_function.proname IN (
             'teskeid_event_get_expense_activity',
             'teskeid_event_get_expense_context_labels'
           )) = 2 AS functions_exact_ok,
    pg_catalog.bool_and(
      pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
    ) AS functions_private_ok
  FROM expected
  JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = function_row.proowner
), baseline_contract AS (
  SELECT COALESCE((
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
  ), false) AS sql139_preview_unchanged_ok
), behavior_contract AS (
  SELECT
    pg_catalog.strpos(activity.definition, 'teskeid_event_assert_actor') > 0
      AND pg_catalog.strpos(activity.definition, 'teskeid_event_assert_financial_actor') > 0
      AND pg_catalog.strpos(activity.definition, 'teskeid_event_attendance_memberships') > 0
      AND pg_catalog.strpos(activity.definition, 'LIMIT 101') > 0
      AND pg_catalog.strpos(activity.definition, 'BETWEEN 1 AND 50') > 0
      AND pg_catalog.strpos(activity.definition, 'expense_group_balances') > 0
      AND pg_catalog.strpos(activity.definition, 'teskeid_event_expense_participant_sources') = 0
      AND pg_catalog.strpos(activity.definition, 'payment_preference') = 0
      AND pg_catalog.strpos(activity.definition, 'recipient_email') = 0
      AS attendee_activity_safe_ok,
    pg_catalog.strpos(labels.definition, 'cardinality(p_group_ids) > 100') > 0
      AND pg_catalog.strpos(labels.definition, 'expense_group_members') > 0
      AND pg_catalog.strpos(labels.definition, 'teskeid_event_attendance_memberships') > 0
      AND pg_catalog.strpos(labels.definition, 'teskeid_event_expense_participant_sources') = 0
      AS context_labels_safe_ok
  FROM (
    SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
      'public.teskeid_event_get_expense_activity(uuid,uuid)'
    )) AS definition
  ) AS activity
  CROSS JOIN (
    SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
      'public.teskeid_event_get_expense_context_labels(uuid,uuid[])'
    )) AS definition
  ) AS labels
)
SELECT pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  functions_exact_ok,
  functions_private_ok,
  sql139_preview_unchanged_ok,
  attendee_activity_safe_ok,
  context_labels_safe_ok,
  functions_exact_ok AND functions_private_ok
    AND sql139_preview_unchanged_ok
    AND attendee_activity_safe_ok AND context_labels_safe_ok
    AS postconditions_ok
FROM function_contract, baseline_contract, behavior_contract;
ROLLBACK;

-- SQL158 preflight (100% read-only).
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

WITH executor_contract AS (
  SELECT current_user = 'postgres' AND session_user = 'postgres'
    AS executor_ok
), expected_functions(
  version_name, signature, exact_arguments, source_hash
) AS (VALUES
  ('v2', 'public.teskeid_event_get_expense_activity_v2(uuid,uuid)',
   'p_actor_id uuid, p_event_id uuid',
   'd5422fcda5e1ce93aeb08a4f2c9db91a'),
  ('v3', 'public.teskeid_event_get_expense_activity_v3(uuid,uuid)',
   'p_actor_id uuid, p_event_id uuid',
   'ff9ce0a060d5e7c713907881da621f70')
), function_catalog AS (
  SELECT expected_functions.*,
    function_row.*,
    language_row.lanname AS language_name,
    pg_catalog.pg_get_userbyid(function_row.proowner) AS owner_name
  FROM expected_functions
  LEFT JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid =
      pg_catalog.to_regprocedure(expected_functions.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = function_row.prolang
), function_checks AS (
  SELECT function_catalog.version_name,
    CASE WHEN function_catalog.oid IS NULL THEN false ELSE
      function_catalog.prokind = 'f'
      AND function_catalog.prorettype =
            'pg_catalog.jsonb'::pg_catalog.regtype
      AND NOT function_catalog.proretset
      AND function_catalog.prosecdef
      AND function_catalog.provolatile = 'v'
      AND NOT function_catalog.proisstrict
      AND NOT function_catalog.proleakproof
      AND function_catalog.proparallel = 'u'
      AND function_catalog.pronargdefaults = 0
      AND function_catalog.proconfig = ARRAY['search_path=""']::text[]
      AND function_catalog.language_name = 'plpgsql'
      AND function_catalog.owner_name = 'postgres'
      AND pg_catalog.pg_get_function_arguments(function_catalog.oid) =
            function_catalog.exact_arguments
      AND pg_catalog.md5(pg_catalog.replace(
            function_catalog.prosrc, E'\r\n', E'\n'
          )) = function_catalog.source_hash
      AND (
        SELECT pg_catalog.count(*) = 1
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = function_catalog.pronamespace
          AND overload.proname = function_catalog.proname
      )
      AND (
        SELECT pg_catalog.count(*) = 2
        FROM pg_catalog.aclexplode(COALESCE(
          function_catalog.proacl,
          pg_catalog.acldefault('f', function_catalog.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantor = function_catalog.proowner
          AND NOT privilege.is_grantable
          AND (
            privilege.grantee = function_catalog.proowner
            OR grantee.rolname = 'service_role'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          function_catalog.proacl,
          pg_catalog.acldefault('f', function_catalog.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> function_catalog.proowner
           OR privilege.is_grantable
           OR privilege.grantee = 0
           OR (
             privilege.grantee <> function_catalog.proowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
      )
    END AS is_exact
  FROM function_catalog
), target_presence AS (
  SELECT pg_catalog.count(*)::integer AS target_count
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.pronamespace =
        pg_catalog.to_regnamespace('public')
    AND function_row.proname =
        'teskeid_event_get_expense_activity_v3'
), metrics AS (
  SELECT COALESCE(pg_catalog.bool_or(
      function_checks.version_name = 'v2' AND function_checks.is_exact
    ), false) AS predecessor_v2_exact,
    COALESCE(pg_catalog.bool_or(
      function_checks.version_name = 'v3' AND function_checks.is_exact
    ), false) AS v3_exact_installed
  FROM function_checks
), dependency_contract AS (
  SELECT pg_catalog.to_regclass(
           'public.expense_group_members'
         ) IS NOT NULL
    AND pg_catalog.to_regrole('postgres') IS NOT NULL
    AND pg_catalog.to_regrole('service_role') IS NOT NULL
    AND pg_catalog.to_regrole('anon') IS NOT NULL
    AND pg_catalog.to_regrole('authenticated') IS NOT NULL
      AS dependencies_exist
)
SELECT executor_contract.executor_ok,
  metrics.predecessor_v2_exact,
  target_presence.target_count = 0 AS v3_absent,
  metrics.v3_exact_installed,
  target_presence.target_count > 0
    AND NOT metrics.v3_exact_installed AS v3_collision,
  dependency_contract.dependencies_exist,
  executor_contract.executor_ok
    AND metrics.predecessor_v2_exact
    AND dependency_contract.dependencies_exist
    AND (
      target_presence.target_count = 0
      OR metrics.v3_exact_installed
    ) AS prerequisites_ok
FROM executor_contract
CROSS JOIN metrics
CROSS JOIN target_presence
CROSS JOIN dependency_contract;

ROLLBACK;

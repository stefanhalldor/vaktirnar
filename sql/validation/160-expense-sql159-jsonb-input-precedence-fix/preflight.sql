-- SQL160 preflight: 100% read-only.
WITH function_row AS (
  SELECT function_catalog.*,
    language_row.lanname AS language_name,
    pg_catalog.pg_get_userbyid(function_catalog.proowner) AS owner_name,
    pg_catalog.md5(pg_catalog.replace(
      function_catalog.prosrc, E'\r\n', E'\n'
    )) AS source_hash,
    pg_catalog.pg_get_function_arguments(function_catalog.oid) AS arguments
  FROM pg_catalog.pg_proc AS function_catalog
  JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = function_catalog.prolang
  WHERE function_catalog.oid = pg_catalog.to_regprocedure(
    'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'
  )
), evidence AS (
  SELECT
    current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    pg_catalog.count(*) = 1 AS function_exists,
    COALESCE(pg_catalog.bool_and(
      prokind = 'f'
      AND prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT proretset
      AND prosecdef
      AND provolatile = 'v'
      AND NOT proisstrict
      AND NOT proleakproof
      AND proparallel = 'u'
      AND pronargdefaults = 0
      AND proargdefaults IS NULL
      AND proallargtypes IS NULL
      AND proargmodes IS NULL
      AND proconfig = ARRAY['search_path=""']::text[]
      AND language_name = 'plpgsql'
      AND owner_name = 'postgres'
      AND arguments = 'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean'
      AND (
        SELECT pg_catalog.count(*) = 1
          AND pg_catalog.bool_and(
            grantee_row.rolname = 'postgres'
            AND privilege_row.privilege_type = 'EXECUTE'
            AND NOT privilege_row.is_grantable
          )
        FROM pg_catalog.aclexplode(COALESCE(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )) AS privilege_row
        LEFT JOIN pg_catalog.pg_roles AS grantee_row
          ON grantee_row.oid = privilege_row.grantee
      )
    ), false) AS contract_exact,
    COALESCE(pg_catalog.bool_and(
      source_hash = '1d8860f5e38dd9efbefef46c4c47d584'
    ), false) AS predecessor_exact,
    COALESCE(pg_catalog.bool_and(
      source_hash = '18a6e628bdb1d3c175b515541ab56787'
    ), false) AS exact_installed
  FROM function_row
)
SELECT executor_ok, function_exists, contract_exact,
  predecessor_exact, exact_installed,
  executor_ok AND function_exists AND contract_exact
    AND (predecessor_exact OR exact_installed) AS operator_state_ok,
  executor_ok AND function_exists AND contract_exact
    AND predecessor_exact AND NOT exact_installed AS prerequisites_ok
FROM evidence;

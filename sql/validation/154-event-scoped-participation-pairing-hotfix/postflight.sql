-- SQL154 postflight (100% read-only).
BEGIN;
SET TRANSACTION READ ONLY;

WITH target AS (
  SELECT procedure_row.*
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_list_scoped_participations_v3(uuid)'
  )
), metrics AS (
  SELECT
    pg_catalog.current_database() AS database_name,
    current_user AS database_user,
    pg_catalog.clock_timestamp() AS checked_at,
    (SELECT pg_catalog.count(*) = 1 FROM target) AS function_exists_ok,
    COALESCE((SELECT pg_catalog.md5(pg_catalog.replace(
      prosrc, E'\r\n', E'\n'
    )) = '0269211156c600c6411ecf0590eff295'
      FROM target), false) AS fixed_pairing_exact_ok,
    COALESCE((SELECT procedure_row.prosecdef
      AND procedure_row.provolatile = 'v'
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      FROM target AS procedure_row), false) AS security_shape_ok,
    pg_catalog.has_function_privilege(
      'service_role',
      'public.teskeid_event_list_scoped_participations_v3(uuid)',
      'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.teskeid_event_list_scoped_participations_v3(uuid)',
      'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.teskeid_event_list_scoped_participations_v3(uuid)',
      'EXECUTE'
    ) AS acl_ok
)
SELECT *, function_exists_ok AND fixed_pairing_exact_ok
  AND security_shape_ok AND acl_ok AS postconditions_ok
FROM metrics;

ROLLBACK;

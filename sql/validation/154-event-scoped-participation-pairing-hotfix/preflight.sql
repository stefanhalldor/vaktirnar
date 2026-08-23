-- SQL154 preflight (100% read-only).
BEGIN;
SET TRANSACTION READ ONLY;

WITH target AS (
  SELECT procedure_row.*,
    pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc, E'\r\n', E'\n'
    )) AS source_md5
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_list_scoped_participations_v3(uuid)'
  )
), metrics AS (
  SELECT
    pg_catalog.current_database() AS database_name,
    current_user AS database_user,
    pg_catalog.clock_timestamp() AS checked_at,
    current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    (SELECT pg_catalog.count(*) = 1 FROM target) AS function_exists_ok,
    COALESCE((SELECT source_md5 =
      '49ab80161d27a7a73df7491bf04ac6cd' FROM target), false)
      AS sql153_predecessor_exact_ok,
    COALESCE((SELECT source_md5 =
      '0269211156c600c6411ecf0590eff295' FROM target), false)
      AS already_applied,
    COALESCE((SELECT procedure_row.prosecdef
      AND procedure_row.provolatile = 'v'
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      FROM target AS procedure_row), false) AS security_shape_ok
)
SELECT *,
  executor_ok AND function_exists_ok
  AND (sql153_predecessor_exact_ok OR already_applied)
  AND security_shape_ok AS prerequisites_ok
FROM metrics;

ROLLBACK;

-- SQL193 PREFLIGHT: read-only function, constraint and private-boundary readiness.
WITH target AS (
  SELECT p.* FROM pg_proc p
  WHERE p.oid = to_regprocedure('receipt_split.validate_v2(jsonb)')
), checks AS (
  SELECT
    (SELECT count(*) = 1 AND bool_and(md5(replace(prosrc,E'\r\n',E'\n')) =
      '3de8d61d7b8d873e5916bed3e0d68f20') FROM target) AS predecessor_body_ok,
    coalesce(obj_description(to_regnamespace('receipt_split'),'pg_namespace'),'') LIKE 'SQL184:v2:%' AS predecessor_seal_ok,
    (SELECT count(*) = 1 AND bool_and(NOT prosecdef AND provolatile='v'
      AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=""']::text[]
      AND NOT has_function_privilege('anon',oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
      AND NOT has_function_privilege('service_role',oid,'EXECUTE')) FROM target) AS function_security_ok,
    (SELECT count(*) = 1 AND bool_and(c.convalidated AND c.contype='c'
      AND regexp_replace(pg_get_expr(c.conbin,c.conrelid),'[[:space:]()]','','g') =
        $expected$currency=ANYARRAY['ISK'::text,'EUR'::text,'USD'::text,'GBP'::text,'DKK'::text,'NOK'::text,'SEK'::text]$expected$)
      FROM pg_constraint c WHERE c.conrelid=to_regclass('receipt_split.splits')
        AND c.conname='splits_currency_check') AS predecessor_constraint_ok
)
SELECT CASE WHEN predecessor_body_ok AND predecessor_seal_ok AND function_security_ok
    AND predecessor_constraint_ok THEN 'PASS' ELSE 'FAIL' END AS gate, checks.*
FROM checks;

-- SQL187 read-only postflight. EXACT_INSTALLED and every boolean true are required.
SET LOCAL search_path = '';
WITH target AS (
  SELECT p.prosecdef AND p.proconfig=ARRAY['search_path=""']
      AND pg_get_userbyid(p.proowner)='postgres'
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS security_ok,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.oid='public.receipt_split_read_v2(uuid,uuid)'::regprocedure
)
SELECT CASE WHEN security_ok
    AND definition LIKE '%FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id%'
    AND definition NOT LIKE '%FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id=s.id%'
    AND definition LIKE '%''dismissedItemIds''%'
    AND definition LIKE '%''incurredOn''%'
  THEN 'EXACT_INSTALLED' ELSE 'STOP' END AS operator_state,
  security_ok,
  definition LIKE '%FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id%' AS new_alias_ok,
  definition NOT LIKE '%FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id=s.id%' AS old_alias_absent,
  definition LIKE '%''dismissedItemIds''%' AND definition LIKE '%''incurredOn''%' AS projection_ok
FROM target;

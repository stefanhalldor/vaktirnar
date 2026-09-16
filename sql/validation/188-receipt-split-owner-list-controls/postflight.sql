-- SQL188 read-only postflight. EXACT_INSTALLED and every boolean true required.
SET LOCAL search_path = '';
WITH target AS (
  SELECT p.prosecdef AND p.proconfig=ARRAY['search_path=""']
      AND pg_get_userbyid(p.proowner)='postgres'
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS security_ok,
    pg_get_functiondef(p.oid) definition
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.oid='public.receipt_split_read_v2(uuid,uuid)'::regprocedure
)
SELECT CASE WHEN security_ok
    AND definition LIKE '%FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id%'
    AND definition LIKE '%''version'',split_row.version,''isOwner'',split_row.owner_id=p_actor_id%'
    AND definition LIKE '%''dismissedItemIds''%' THEN 'EXACT_INSTALLED' ELSE 'STOP' END AS operator_state,
  security_ok,
  definition LIKE '%FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id%' AS alias_ok,
  definition LIKE '%''version'',split_row.version,''isOwner'',split_row.owner_id=p_actor_id%' AS owner_projection_ok,
  definition LIKE '%''dismissedItemIds''%' AS detail_projection_ok
FROM target;

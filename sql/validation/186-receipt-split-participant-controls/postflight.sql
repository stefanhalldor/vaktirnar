-- SQL186 read-only postflight. EXACT_INSTALLED and every boolean true are required.
SET LOCAL search_path = '';
WITH target AS (
  SELECT c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='postgres'
    AND coalesce(c.relacl::text,'') !~ '(anon|authenticated|service_role)' AS table_ok
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='receipt_split' AND c.relname='item_dismissals' AND c.relkind='r'
), routines AS (
  SELECT count(*)=3 AND bool_and(p.prosecdef AND p.proconfig=ARRAY['search_path=""']
    AND pg_get_userbyid(p.proowner)='postgres'
    AND has_function_privilege('service_role',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) AS functions_ok
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('receipt_split_read_v2','receipt_split_invite_preview_v1','receipt_split_set_item_dismissed_v1')
), private_routine AS (
  SELECT count(*)=1 AND bool_and(NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']
    AND pg_get_userbyid(p.proowner)='postgres'
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) AS private_function_ok
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='receipt_split' AND p.proname='clear_item_dismissal_on_claim'
), constraints AS (
  SELECT count(*)=3 AS constraints_ok FROM pg_catalog.pg_constraint
  WHERE conrelid=to_regclass('receipt_split.item_dismissals') AND contype IN ('p','f')
), body AS (
  SELECT pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure) LIKE '%dismissedItemIds%'
    AND pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure) LIKE '%incurredOn%' AS read_ok
), trigger_check AS (
  SELECT count(*)=1 AS trigger_ok FROM pg_catalog.pg_trigger
  WHERE tgrelid=to_regclass('receipt_split.claims') AND tgname='claims_clear_personal_dismissal' AND NOT tgisinternal
)
SELECT CASE WHEN coalesce(table_ok,false) AND functions_ok AND private_function_ok AND constraints_ok AND read_ok AND trigger_ok THEN 'EXACT_INSTALLED' ELSE 'STOP' END AS operator_state,
  coalesce(table_ok,false) AS table_ok, functions_ok, private_function_ok, constraints_ok, read_ok, trigger_ok
FROM target RIGHT JOIN routines ON true CROSS JOIN private_routine CROSS JOIN constraints CROSS JOIN body CROSS JOIN trigger_check;

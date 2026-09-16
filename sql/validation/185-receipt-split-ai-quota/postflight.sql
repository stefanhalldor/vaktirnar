-- SQL185 read-only postflight. EXACT_INSTALLED and every boolean true are required.
SET LOCAL search_path = '';
WITH relations AS (
  SELECT count(*) = 2 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='postgres') AS tables_ok
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='receipt_split' AND c.relname IN ('ai_usage','ai_quota_exemptions') AND c.relkind='r'
), policies AS (
  SELECT NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='receipt_split' AND c.relname IN ('ai_usage','ai_quota_exemptions')
  ) AS no_client_policies
), routines AS (
  SELECT count(*)=4 AND bool_and(p.prosecdef AND p.proconfig=ARRAY['search_path=""']
    AND pg_get_userbyid(p.proowner)='postgres'
    AND has_function_privilege('service_role',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) AS functions_ok
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'receipt_split_reserve_ai_v1','receipt_split_finish_ai_v1',
    'receipt_split_admin_list_ai_exemptions_v1','receipt_split_admin_set_ai_exemption_v1'
  )
), constraints_ok AS (
  SELECT
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('receipt_split.ai_usage') AND conname='ai_usage_split_unique')
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('receipt_split.ai_usage') AND conname='ai_usage_finished_order')
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('receipt_split.ai_quota_exemptions') AND contype='p') AS constraints_ok
)
SELECT CASE WHEN tables_ok AND no_client_policies AND functions_ok AND constraints_ok THEN 'EXACT_INSTALLED' ELSE 'STOP' END AS operator_state,
  tables_ok, no_client_policies, functions_ok, constraints_ok
FROM relations CROSS JOIN policies CROSS JOIN routines CROSS JOIN constraints_ok;

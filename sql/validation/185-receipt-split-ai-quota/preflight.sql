-- SQL185 read-only preflight. Run in Supabase SQL editor; apply only on READY.
SET LOCAL search_path = '';
WITH predecessor AS (
  SELECT
    current_user = 'postgres' AS operator_ok,
    to_regprocedure('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)') IS NOT NULL AS function_ok,
    to_regclass('receipt_split.splits') IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = to_regclass('receipt_split.splits') AND attname='contract_version' AND NOT attisdropped) AS tables_ok
), targets AS (
  SELECT
    to_regclass('receipt_split.ai_usage') IS NULL
      AND to_regclass('receipt_split.ai_quota_exemptions') IS NULL
      AND to_regprocedure('public.receipt_split_reserve_ai_v1(uuid,uuid,date,integer,integer,integer)') IS NULL
      AND to_regprocedure('public.receipt_split_finish_ai_v1(uuid,uuid)') IS NULL
      AND to_regprocedure('public.receipt_split_admin_list_ai_exemptions_v1()') IS NULL
      AND to_regprocedure('public.receipt_split_admin_set_ai_exemption_v1(uuid,text,boolean,text)') IS NULL AS targets_absent
)
SELECT CASE WHEN operator_ok AND function_ok AND tables_ok AND targets_absent THEN 'READY' ELSE 'STOP' END AS operator_state,
  operator_ok, function_ok, tables_ok, targets_absent
FROM predecessor CROSS JOIN targets;

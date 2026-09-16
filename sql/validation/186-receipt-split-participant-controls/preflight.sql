-- SQL186 read-only preflight. Run only; do not run the migration unless READY.
SET LOCAL search_path = '';
SELECT CASE WHEN current_user='postgres'
  AND to_regclass('receipt_split.splits') IS NOT NULL
  AND to_regclass('receipt_split.ai_usage') IS NOT NULL
  AND to_regclass('receipt_split.ai_quota_exemptions') IS NOT NULL
  AND to_regprocedure('public.receipt_split_reserve_ai_v1(uuid,uuid,date,integer,integer,integer)') IS NOT NULL
  AND to_regprocedure('public.receipt_split_finish_ai_v1(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('public.receipt_split_read_v2(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)') IS NOT NULL
  AND to_regclass('receipt_split.item_dismissals') IS NULL
  AND to_regprocedure('public.receipt_split_invite_preview_v1(text)') IS NULL
  AND to_regprocedure('public.receipt_split_set_item_dismissed_v1(uuid,uuid,uuid,uuid,boolean)') IS NULL
  AND to_regprocedure('receipt_split.clear_item_dismissal_on_claim()') IS NULL
  THEN 'READY' ELSE 'STOP' END AS operator_state,
  current_user='postgres' AS operator_ok,
  to_regclass('receipt_split.ai_usage') IS NOT NULL
    AND to_regclass('receipt_split.ai_quota_exemptions') IS NOT NULL
    AND to_regprocedure('public.receipt_split_reserve_ai_v1(uuid,uuid,date,integer,integer,integer)') IS NOT NULL
    AND to_regprocedure('public.receipt_split_finish_ai_v1(uuid,uuid)') IS NOT NULL AS predecessor_ok,
  to_regprocedure('public.receipt_split_read_v2(uuid,uuid)') IS NOT NULL
    AND to_regprocedure('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)') IS NOT NULL AS functions_ok,
  to_regclass('receipt_split.item_dismissals') IS NULL
    AND to_regprocedure('public.receipt_split_invite_preview_v1(text)') IS NULL
    AND to_regprocedure('public.receipt_split_set_item_dismissed_v1(uuid,uuid,uuid,uuid,boolean)') IS NULL
    AND to_regprocedure('receipt_split.clear_item_dismissal_on_claim()') IS NULL AS targets_absent;

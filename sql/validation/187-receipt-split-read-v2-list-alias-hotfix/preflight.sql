-- SQL187 read-only preflight. Run only; continue only on READY and all true.
SET LOCAL search_path = '';
WITH body AS (
  SELECT pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure) AS definition
)
SELECT CASE WHEN current_user='postgres'
    AND to_regclass('receipt_split.item_dismissals') IS NOT NULL
    AND definition LIKE '%FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id=s.id%'
    AND definition NOT LIKE '%FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id%'
  THEN 'READY' ELSE 'STOP' END AS operator_state,
  current_user='postgres' AS operator_ok,
  to_regclass('receipt_split.item_dismissals') IS NOT NULL AS predecessor_ok,
  definition LIKE '%FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id=s.id%' AS old_alias_present,
  definition NOT LIKE '%FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id%' AS hotfix_absent
FROM body;

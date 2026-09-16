-- SQL188 read-only preflight. Continue only on READY with every boolean true.
SET LOCAL search_path = '';
WITH body AS (SELECT pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure) definition)
SELECT CASE WHEN current_user='postgres'
    AND definition LIKE '%FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id%'
    AND definition LIKE '%''state'',split_row.state,''incurredOn'',split_row.incurred_on%'
    AND definition NOT LIKE '%''version'',split_row.version,''isOwner'',split_row.owner_id=p_actor_id%'
  THEN 'READY' ELSE 'STOP' END AS operator_state,
  current_user='postgres' AS operator_ok,
  definition LIKE '%FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id%' AS predecessor_ok,
  definition LIKE '%''state'',split_row.state,''incurredOn'',split_row.incurred_on%' AS old_projection_ok,
  definition NOT LIKE '%''version'',split_row.version,''isOwner'',split_row.owner_id=p_actor_id%' AS addition_absent
FROM body;

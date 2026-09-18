-- SQL194 PREFLIGHT: read-only prerequisites; require READY before migration.
BEGIN TRANSACTION READ ONLY;
WITH checks AS (
  SELECT current_user = 'postgres' AS operator_ok,
    to_regclass('receipt_split.ai_usage') IS NOT NULL
      AND to_regclass('receipt_split.ai_quota_exemptions') IS NOT NULL
      AND to_regprocedure('receipt_split.assert_actor(uuid)') IS NOT NULL
      AND to_regprocedure('public.receipt_split_reserve_ai_v1(uuid,uuid,date,integer,integer,integer)') IS NOT NULL AS prerequisites_ok,
    to_regprocedure('public.receipt_split_ai_availability_v1(uuid,integer,integer,integer)') IS NULL AS target_absent
)
SELECT CASE WHEN operator_ok AND prerequisites_ok AND target_absent THEN 'READY' ELSE 'STOP' END AS gate,
  operator_ok, prerequisites_ok, target_absent FROM checks;
COMMIT;

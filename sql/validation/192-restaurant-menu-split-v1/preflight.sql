-- SQL192 PREFLIGHT: read-only readiness for participant items and restaurants.
WITH checks AS (
  SELECT
    current_user='postgres' AS operator_ok,
    to_regclass('receipt_split.members') IS NOT NULL
      AND to_regclass('receipt_split.items') IS NOT NULL
      AND to_regclass('receipt_split.claims') IS NOT NULL
      AND to_regclass('receipt_split.requests') IS NOT NULL AS split_tables_ok,
    to_regprocedure('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)') IS NOT NULL
      AND to_regprocedure('public.receipt_split_read_v2(uuid,uuid)') IS NOT NULL AS split_functions_ok,
    to_regclass('public.business_profiles') IS NOT NULL
      AND to_regclass('public.feature_access') IS NOT NULL AS business_profile_ok,
    to_regclass('public.restaurant_capabilities') IS NULL
      AND to_regprocedure('public.receipt_split_participant_add_item_v1(uuid,uuid,uuid,bigint,jsonb)') IS NULL AS collision_free,
    NOT EXISTS (
      SELECT 1 FROM receipt_split.claims c
      LEFT JOIN receipt_split.members m ON m.split_id=c.split_id AND m.token=c.member_token
      LEFT JOIN receipt_split.items i ON i.split_id=c.split_id AND i.id=c.item_id
      WHERE m.token IS NULL OR i.id IS NULL
    ) AS claim_fk_rows_ok
)
SELECT CASE WHEN operator_ok AND split_tables_ok AND split_functions_ok
  AND business_profile_ok AND collision_free AND claim_fk_rows_ok
  THEN 'READY' ELSE 'STOP' END AS gate, checks.* FROM checks;

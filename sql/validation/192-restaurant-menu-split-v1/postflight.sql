-- SQL192 POSTFLIGHT: read-only contract and ACL verification.
WITH checks AS (
  SELECT
    to_regclass('public.restaurant_capabilities') IS NOT NULL
      AND to_regclass('public.restaurant_split_items') IS NOT NULL
      AND to_regclass('public.restaurant_requests') IS NOT NULL AS tables_ok,
    to_regprocedure('public.receipt_split_participant_add_item_v1(uuid,uuid,uuid,bigint,jsonb)') IS NOT NULL
      AND to_regprocedure('public.receipt_split_participant_edit_item_v1(uuid,uuid,uuid,bigint,jsonb)') IS NOT NULL
      AND to_regprocedure('public.receipt_split_participant_cancel_item_v1(uuid,uuid,uuid,uuid,bigint,bigint)') IS NOT NULL
      AND to_regprocedure('public.restaurant_resolve_public_menu_v1(text)') IS NOT NULL
      AND to_regprocedure('public.restaurant_resolve_qr_v1(text)') IS NOT NULL
      AND to_regprocedure('public.restaurant_submit_menu_item_v1(uuid,uuid,uuid,uuid,bigint,uuid,integer,jsonb,text)') IS NOT NULL
      AND to_regprocedure('public.restaurant_assign_preorder_table_v1(uuid,uuid,uuid,bigint,uuid,bigint)') IS NOT NULL
      AND to_regprocedure('public.restaurant_operational_view_v1(uuid,uuid)') IS NOT NULL
      AND to_regprocedure('public.restaurant_forecast_v1(uuid,uuid,timestamptz,timestamptz)') IS NOT NULL AS functions_ok,
    EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='receipt_split.items'::regclass
      AND attname='created_by_member_token' AND NOT attisdropped) AS creator_ok,
    EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='receipt_split.members'::regclass
      AND attname='status' AND NOT attisdropped) AS member_status_ok,
    NOT has_table_privilege('anon','public.restaurant_split_items','SELECT')
      AND NOT has_table_privilege('authenticated','public.restaurant_split_items','SELECT')
      AND NOT has_table_privilege('service_role','public.restaurant_split_items','SELECT')
      AND NOT has_function_privilege('authenticated',
        'public.receipt_split_participant_add_item_v1(uuid,uuid,uuid,bigint,jsonb)','EXECUTE') AS acl_ok,
    NOT EXISTS(SELECT 1 FROM receipt_split.members WHERE status<>'active') AS existing_members_active
)
SELECT CASE WHEN tables_ok AND functions_ok AND creator_ok AND member_status_ok
  AND acl_ok AND existing_members_active THEN 'PASS' ELSE 'STOP' END AS gate,
  checks.* FROM checks;

-- SQL168 RECOVERY: capability-first, data-preserving TES-24 stop gate; performs no cleanup.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.expense_get_edit_revision_publication_lifecycle_v1(uuid,uuid)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_get_eligible_settlement_context_v1(uuid,uuid)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_unshare_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_get_edit_revision_state_v1(uuid,uuid)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_list_visible_edit_revisions_v1(uuid)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_get_shared_edit_revision_v1(uuid,uuid)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)
  FROM service_role;

COMMIT;

BEGIN TRANSACTION READ ONLY;

SELECT CASE WHEN EXISTS (
  SELECT 1 FROM public.expense_edit_revision_bindings
) THEN 'STOP_OPEN_EDIT_REVISIONS_EXIST'
ELSE 'CAPABILITY_REVOKED_NO_AUTOMATIC_SCHEMA_RECOVERY' END AS recovery_state,
false AS data_deleted,
false AS schema_dropped;

ROLLBACK;

-- SQL133 forward-only recovery inventory -- READ ONLY.
-- This script intentionally changes no schema, ACL, auth row or application
-- data. Investigate with this output and ship a new additive migration.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;

WITH expected_relations(name) AS (
  VALUES
    ('teskeid_event_guest_invitations'),
    ('teskeid_event_attendance_memberships'),
    ('teskeid_event_attendance_mutation_requests'),
    ('teskeid_event_attendance_delivery_requests'),
    ('teskeid_event_guest_identity_mutation_authorizations')
), relation_inventory AS (
  SELECT
    expected.name,
    relation.oid IS NOT NULL AS exists,
    CASE WHEN relation.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_userbyid(relation.relowner) END AS owner_name,
    COALESCE(relation.relrowsecurity, false) AS rls_enabled,
    COALESCE(relation.relforcerowsecurity, false) AS rls_forced,
    CASE WHEN relation.oid IS NULL THEN NULL ELSE (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_policy AS policy
      WHERE policy.polrelid = relation.oid
    ) END AS policy_count,
    CASE WHEN relation.oid IS NULL THEN NULL ELSE (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.aclexplode(COALESCE(
        relation.relacl, pg_catalog.acldefault('r', relation.relowner)
      )) AS privilege
      WHERE privilege.grantee = 0 OR privilege.grantee <> relation.relowner
    ) END AS non_owner_acl_count
  FROM expected_relations AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.name)
), function_inventory AS (
  SELECT
    expected.signature,
    procedure_row.oid IS NOT NULL AS exists,
    CASE WHEN procedure_row.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_userbyid(procedure_row.proowner) END AS owner_name,
    COALESCE(procedure_row.prosecdef, false) AS security_definer,
    CASE WHEN procedure_row.oid IS NULL THEN NULL ELSE EXISTS (
      SELECT 1 FROM pg_catalog.unnest(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) AS setting(value)
      WHERE setting.value IN ('search_path=', 'search_path=""')
    ) END AS empty_search_path,
    CASE WHEN procedure_row.oid IS NULL THEN NULL
      ELSE pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) END AS service_role_execute
  FROM (VALUES
    ('public.teskeid_event_create_with_attendance_invitations(uuid,uuid,text,jsonb)'),
    ('public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)'),
    ('public.teskeid_event_get_guest_attendance_state(uuid,uuid)'),
    ('public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)'),
    ('public.teskeid_event_cancel_guest_attendance_invitation(uuid,uuid,uuid,uuid,bigint,uuid)'),
    ('public.teskeid_event_prepare_guest_attendance_delivery(uuid,uuid)'),
    ('public.teskeid_event_reserve_guest_attendance_delivery(uuid,uuid,uuid,text,text,text,date)'),
    ('public.teskeid_event_update_guest_attendance_delivery(uuid,uuid,integer,text)'),
    ('public.teskeid_event_list_for_actor(uuid)'),
    ('public.teskeid_event_get_attendee_view(uuid,uuid)'),
    ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)'),
    ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)'),
    ('public.teskeid_event_get_expense_member_sources(uuid,uuid)'),
    ('public.teskeid_event_leave_attendance(uuid,uuid,uuid)'),
    ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)'),
    ('public.expense_prepare_account_deletion(uuid)')
  ) AS expected(signature)
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(relation_inventory)
    ORDER BY relation_inventory.name) FROM relation_inventory) AS relations,
  (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(function_inventory)
    ORDER BY function_inventory.signature) FROM function_inventory) AS functions,
  -- Do not reference a SQL133 table in a static FROM clause here. PostgreSQL
  -- resolves relations while parsing the whole statement, so even a guarded
  -- CASE would fail in the intended all-absent recovery state. Row-level
  -- inventory is deliberately omitted; relation/catalog state above is safe
  -- in absent, partially applied and committed states.
  NULL::jsonb AS invitation_counts,
  'Do not drop, rewrite or reverse SQL133 objects. Disable only the external Events UI under separate authority, retain every consent/receipt/history row, and ship a new additive forward fix.'::text
    AS forward_only_recovery_instruction;

ROLLBACK;

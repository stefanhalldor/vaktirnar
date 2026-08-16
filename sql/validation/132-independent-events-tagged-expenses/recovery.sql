-- SQL132 forward-only recovery inventory -- READ ONLY.
-- This file intentionally performs no destructive schema/data or ACL change.
-- Use an external feature kill-switch under separate authority,
-- then ship a new additive migration for any defect.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;

WITH relation_inventory AS (
  SELECT
    expected.name,
    relation.oid IS NOT NULL AS exists,
    COALESCE(relation.relrowsecurity, false) AS rls_enabled,
    COALESCE(relation.relforcerowsecurity, false) AS rls_forced,
    CASE WHEN relation.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_userbyid(relation.relowner) END AS owner_name,
    CASE WHEN relation.oid IS NULL THEN NULL ELSE (
      SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy AS policy
      WHERE policy.polrelid = relation.oid
    ) END AS policy_count,
    CASE WHEN relation.oid IS NULL THEN NULL ELSE (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.aclexplode(COALESCE(
        relation.relacl, pg_catalog.acldefault('r', relation.relowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
      WHERE privilege.grantee = 0
         OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
    ) END AS exposed_acl_count
  FROM (VALUES
    ('teskeid_events'), ('teskeid_event_guests'),
    ('teskeid_event_mutation_requests'),
    ('teskeid_event_expense_links'),
    ('teskeid_event_expense_participant_sources')
  ) AS expected(name)
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.name)
), function_inventory AS (
  SELECT
    expected.signature,
    procedure_row.oid IS NOT NULL AS exists,
    COALESCE(procedure_row.prosecdef, false) AS security_definer,
    CASE WHEN procedure_row.oid IS NULL THEN NULL
      ELSE pg_catalog.pg_get_userbyid(procedure_row.proowner) END AS owner_name,
    CASE WHEN procedure_row.oid IS NULL THEN NULL ELSE EXISTS (
      SELECT 1 FROM pg_catalog.unnest(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) AS setting WHERE setting IN ('search_path=', 'search_path=""')
    ) END AS empty_search_path,
    CASE WHEN procedure_row.oid IS NULL THEN NULL
      ELSE pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) END AS service_role_execute
  FROM (VALUES
    ('public.teskeid_event_create(uuid,uuid,text,jsonb)'),
    ('public.teskeid_event_list(uuid)'),
    ('public.teskeid_event_get(uuid,uuid)'),
    ('public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)'),
    ('public.teskeid_event_list_expense_sources(uuid)'),
    ('public.teskeid_event_get_expense_source(uuid,uuid)'),
    ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)'),
    ('public.teskeid_event_get_expense_preview(uuid,uuid)'),
    ('public.expense_create_event_context(uuid,uuid,text,jsonb)'),
    ('public.expense_prepare_account_deletion(uuid)')
  ) AS expected(signature)
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  (SELECT pg_catalog.count(*) FROM public.teskeid_events) AS event_rows,
  (SELECT pg_catalog.count(*) FROM public.teskeid_event_guests) AS guest_rows,
  (SELECT pg_catalog.count(*) FROM public.teskeid_event_mutation_requests) AS event_receipt_rows,
  (SELECT pg_catalog.count(*) FROM public.teskeid_event_expense_links) AS tagged_expense_rows,
  (SELECT pg_catalog.count(*) FROM public.teskeid_event_expense_participant_sources) AS provenance_rows,
  (SELECT pg_catalog.count(*) FROM public.expense_event_contexts) AS legacy_event_rows,
  (SELECT pg_catalog.count(*) FROM public.expense_event_participants) AS legacy_participant_rows,
  (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(relation_inventory)
    ORDER BY relation_inventory.name) FROM relation_inventory) AS relations,
  (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(function_inventory)
    ORDER BY function_inventory.signature) FROM function_inventory) AS functions,
  'Do not roll back destructively. Disable the Events UI only through the existing external kill-switch under separate authority, preserve all event/financial history, investigate with this read-only inventory, and ship a new additive forward fix.'::text
    AS forward_only_recovery_instruction;

ROLLBACK;

-- SQL139 read-only postflight. Run only after migration 139 and require
-- postconditions_ok=true.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

WITH expected(signature) AS (VALUES
  ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'::text),
  ('public.teskeid_event_get_expense_link_management(uuid,uuid)'::text),
  ('public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)'::text),
  ('public.teskeid_event_detach_expense(uuid,uuid,uuid,uuid,bigint)'::text),
  ('public.teskeid_event_get_expense_preview(uuid,uuid)'::text)
), function_contract AS (
  SELECT pg_catalog.count(*) = 5 AS functions_exact_ok
  FROM expected
  JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = pg_catalog.to_regprocedure(expected.signature)
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = function_row.proowner
  WHERE owner_role.rolname = 'postgres'
    AND function_row.prosecdef
    AND function_row.prorettype = 'jsonb'::pg_catalog.regtype
    AND function_row.proconfig[1] IN ('search_path=', 'search_path=""')
    AND pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
), private_contract AS (
  SELECT NOT pg_catalog.has_function_privilege(
      'service_role', 'public.teskeid_event_assert_expense_link(uuid,uuid,uuid)', 'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      'service_role', 'public.teskeid_event_expense_link_integrity_trigger()', 'EXECUTE'
    ) AS helpers_private_ok
), behavior_contract AS (
  SELECT
    pg_catalog.strpos(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
      'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
    )), 'DELETE FROM public.teskeid_event_expense_participant_sources') > 0
      AND pg_catalog.strpos(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
      )), 'DELETE FROM public.expense_member_invitations') > 0
      AND pg_catalog.strpos(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.teskeid_event_get_expense_preview(uuid,uuid)'
      )), 'teskeid_event_expense_participant_sources') = 0
      AS participant_provenance_removed_ok,
    pg_catalog.strpos(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
      'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)'
    )), 'p_expected_roster_revision') > 0
      AND pg_catalog.strpos(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)'
      )), 'expense_active_member_role') > 0 AS attach_authority_ok,
    pg_catalog.strpos(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
      'public.teskeid_event_detach_expense(uuid,uuid,uuid,uuid,bigint)'
    )), 'DELETE FROM public.teskeid_event_expense_links') > 0
      AS detach_link_only_ok
)
SELECT pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  functions_exact_ok,
  helpers_private_ok,
  participant_provenance_removed_ok,
  attach_authority_ok,
  detach_link_only_ok,
  functions_exact_ok AND helpers_private_ok
    AND participant_provenance_removed_ok AND attach_authority_ok
    AND detach_link_only_ok AS postconditions_ok
FROM function_contract, private_contract, behavior_contract;
ROLLBACK;

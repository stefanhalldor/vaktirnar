-- SQL139 read-only preflight. Run before migration 139 and stop unless
-- prerequisites_ok is true.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

WITH checks AS (
  SELECT
    (current_user = 'postgres' OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = current_user AND role_row.rolsuper
    )) AS executor_ok,
    pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_expense_participant_sources') IS NOT NULL
      AND pg_catalog.to_regclass('public.expenses') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_groups') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_member_invitations') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_activity') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_activity_audience') IS NOT NULL
      AND pg_catalog.to_regclass('public.recent_events') IS NOT NULL
      AS relations_ok,
    pg_catalog.to_regprocedure(
      'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_finish_request(uuid,uuid,jsonb)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_assert_expense_link(uuid,uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_get_expense_preview(uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_normalize_text(text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_valid_text(text,integer,integer)'
      ) IS NOT NULL
      AS functions_ok,
    pg_catalog.to_regprocedure(
      'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
    ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_get_expense_link_management(uuid,uuid)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_detach_expense(uuid,uuid,uuid,uuid,bigint)'
      ) IS NULL
      AS targets_clear
)
SELECT pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  executor_ok,
  relations_ok,
  functions_ok,
  targets_clear,
  executor_ok AND relations_ok AND functions_ok AND targets_clear AS prerequisites_ok
FROM checks;
ROLLBACK;

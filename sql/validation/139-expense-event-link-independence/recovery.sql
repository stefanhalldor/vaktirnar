-- SQL139 read-only recovery inventory. This does not roll production back;
-- it reports whether migration targets exist so recovery can be planned from
-- an exact state without touching Expense data.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;
SELECT pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  pg_catalog.to_regprocedure(
    'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
  ) IS NOT NULL AS create_wrapper_present,
  pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_link_management(uuid,uuid)'
  ) IS NOT NULL AS management_present,
  pg_catalog.to_regprocedure(
    'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)'
  ) IS NOT NULL AS attach_present,
  pg_catalog.to_regprocedure(
    'public.teskeid_event_detach_expense(uuid,uuid,uuid,uuid,bigint)'
  ) IS NOT NULL AS detach_present;
ROLLBACK;

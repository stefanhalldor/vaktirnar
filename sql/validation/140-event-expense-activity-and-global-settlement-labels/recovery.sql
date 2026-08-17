-- SQL140 read-only recovery inventory. This never changes production state.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

SELECT pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_activity(uuid,uuid)'
  ) IS NOT NULL AS activity_function_present,
  pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_context_labels(uuid,uuid[])'
  ) IS NOT NULL AS context_label_function_present,
  pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_preview(uuid,uuid)'
  ) IS NOT NULL AS sql139_preview_present;
ROLLBACK;

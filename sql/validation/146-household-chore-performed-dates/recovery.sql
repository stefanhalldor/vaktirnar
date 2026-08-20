-- Read-only SQL146 recovery assessment. This file does not mutate or roll back.
BEGIN;
SET TRANSACTION READ ONLY;

SELECT
  current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  pg_catalog.to_regprocedure(
    'public.household_chore_get_priority_dashboard(uuid,uuid)'
  ) IS NOT NULL AS priority_dashboard_present,
  pg_catalog.to_regprocedure(
    'public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'
  ) IS NOT NULL AS legacy_completion_present,
  pg_catalog.to_regprocedure(
    'public.household_chore_complete_definition_v2(uuid,uuid,uuid,uuid,uuid,text,date)'
  ) IS NOT NULL AS sql146_completion_present,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid =
        'public.household_chore_assignment_events'::pg_catalog.regclass
      AND trigger_row.tgname = 'household_chore_assignment_events_immutable'
      AND trigger_row.tgfoid =
        'public.household_chore_private_immutable_guard()'::pg_catalog.regprocedure
      AND trigger_row.tgtype = 27
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgisinternal
  ) AS immutable_guard_enabled,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.household_chore_assignments'::pg_catalog.regclass
      AND attname = 'performed_on'
      AND attnum > 0 AND NOT attisdropped
  ) AS sql146_assignment_column_present,
  CASE WHEN pg_catalog.to_regclass(
    'public.household_chore_assignment_events'
  ) IS NULL THEN NULL ELSE (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_assignment_events AS event_row
    WHERE event_row.event_type = 'completion_date_corrected'
  ) END AS correction_event_count,
  CASE WHEN pg_catalog.to_regclass(
    'public.household_chore_mutation_requests'
  ) IS NULL THEN NULL ELSE (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_mutation_requests AS request_row
    WHERE request_row.operation IN (
      'complete_definition_v2', 'complete_assignment_v2',
      'correct_completion_date'
    )
  ) END AS sql146_mutation_request_count,
  'forward_fix_requires_review'::text AS recovery_mode;

ROLLBACK;

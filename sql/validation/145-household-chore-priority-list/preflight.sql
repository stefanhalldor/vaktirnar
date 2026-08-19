-- Read-only SQL145 preflight. Every returned boolean must be true.
BEGIN;
SET TRANSACTION READ ONLY;

WITH checks AS (
  SELECT
    current_setting('server_version_num')::integer >= 150000 AS server_version_ok,
    current_user IN ('postgres', 'supabase_admin') AS executor_ok,
    pg_catalog.to_regclass('public.household_chore_definitions') IS NOT NULL
      AND pg_catalog.to_regclass('public.household_chore_participant_values') IS NOT NULL
      AND pg_catalog.to_regclass('public.household_chore_assignments') IS NOT NULL
      AND pg_catalog.to_regclass('public.household_chore_assignment_events') IS NOT NULL
      AND pg_catalog.to_regclass('public.household_chore_point_entries') IS NOT NULL
      AS relations_ok,
    pg_catalog.to_regprocedure(
      'public.household_chore_private_start_mutation(uuid,uuid,text,bytea,boolean)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_create_assignment(uuid,public.household_chore_definitions,public.household_chore_participants,public.household_chore_participant_values,text,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_insert_assignment_event(public.household_chore_assignments,text,text,uuid,text,integer,integer,text,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_undo_completion(uuid,uuid,uuid,uuid,bigint)'
      ) IS NOT NULL AS foundation_functions_ok,
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.household_chore_definitions'::pg_catalog.regclass
        AND attname IN ('cadence_days', 'completion_scope')
        AND attnum > 0 AND NOT attisdropped
    ) AS target_columns_clear,
    pg_catalog.to_regclass(
      'public.household_chore_assignments_completed_definition_idx'
    ) IS NULL
      AND pg_catalog.to_regclass(
        'public.household_chore_assignments_completed_participant_idx'
      ) IS NULL
      AND pg_catalog.to_regclass(
        'public.household_chore_assignments_definition_participant_open_idx'
      ) IS NULL AS target_indexes_clear,
    pg_catalog.to_regprocedure(
      'public.household_chore_private_priority_token(jsonb)'
    ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_definition_detail_v2(uuid,uuid,uuid)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_priority_dashboard(uuid,uuid)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_create_definition_v2(uuid,uuid,uuid,text,text,text,integer,text)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_update_definition_v2(uuid,uuid,uuid,uuid,bigint,text,text,text,integer,text)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_complete_locked_assignment(uuid,public.household_chore_assignments)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'
      ) IS NULL AS target_functions_clear,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_assignments'::pg_catalog.regclass
        AND conname = 'household_chore_assignments_origin_check'
        AND contype = 'c' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%member_assigned%'
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%self_assigned%'
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%member_repeated%'
        AND pg_catalog.pg_get_constraintdef(oid) NOT LIKE '%quick_completed%'
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_assignment_events'::pg_catalog.regclass
        AND conname = 'household_chore_events_origin_check'
        AND contype = 'c' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) NOT LIKE '%quick_completed%'
    ) AS origin_constraints_ready,
    NOT EXISTS (
      SELECT 1
      FROM public.household_chore_assignments AS assignment_row
      WHERE assignment_row.origin NOT IN (
        'member_assigned', 'self_assigned', 'member_repeated'
      )
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.household_chore_assignment_events AS event_row
      WHERE event_row.assignment_origin NOT IN (
        'member_assigned', 'self_assigned', 'member_repeated'
      )
    ) AS origin_data_ready,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.household_chore_definitions'::pg_catalog.regclass
        AND relrowsecurity AND relforcerowsecurity
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.household_chore_assignments'::pg_catalog.regclass
        AND relrowsecurity AND relforcerowsecurity
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid IN (
        'public.household_chore_definitions'::pg_catalog.regclass,
        'public.household_chore_assignments'::pg_catalog.regclass
      )
    ) AS rls_posture_ok,
    pg_catalog.to_regprocedure(
      'public.feature_access_heimilisverkin_auth_email_guard()'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_link_participant(uuid,uuid,uuid,uuid,bigint,text,text)'
      ) IS NOT NULL AS sql143_144_ok
), final AS (
  SELECT *,
    server_version_ok AND executor_ok AND relations_ok
      AND foundation_functions_ok AND target_columns_clear
      AND target_indexes_clear AND target_functions_clear
      AND origin_constraints_ready AND origin_data_ready
      AND rls_posture_ok AND sql143_144_ok AS prerequisites_ok
  FROM checks
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  server_version_ok,
  executor_ok,
  relations_ok,
  foundation_functions_ok,
  target_columns_clear,
  target_indexes_clear,
  target_functions_clear,
  origin_constraints_ready,
  origin_data_ready,
  rls_posture_ok,
  sql143_144_ok,
  prerequisites_ok
FROM final;

ROLLBACK;

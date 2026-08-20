-- Read-only SQL146 preflight. Every boolean and prerequisites_ok must be true.
-- Review both following diagnostic result rows even when prerequisites_ok is true.
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
      AND pg_catalog.to_regclass('public.household_chore_mutation_requests') IS NOT NULL
      AS relations_ok,
    pg_catalog.to_regprocedure(
      'public.household_chore_private_priority_token(jsonb)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_start_mutation(uuid,uuid,text,bytea,boolean)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_create_assignment(uuid,public.household_chore_definitions,public.household_chore_participants,public.household_chore_participant_values,text,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_insert_assignment_event(public.household_chore_assignments,text,text,uuid,text,integer,integer,text,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_complete_locked_assignment(uuid,public.household_chore_assignments)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_complete_assignment(uuid,uuid,uuid,uuid,bigint)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_undo_completion(uuid,uuid,uuid,uuid,bigint)'
      ) IS NOT NULL AS foundation_functions_ok,
    pg_catalog.to_regprocedure(
      'public.household_chore_get_priority_dashboard(uuid,uuid)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'
      ) IS NOT NULL
      AND (
        SELECT function_row.prosrc LIKE '%effective_completed_at%'
          AND function_row.prosrc NOT LIKE '%effective_performed_on%'
        FROM pg_catalog.pg_proc AS function_row
        WHERE function_row.oid =
          'public.household_chore_get_priority_dashboard(uuid,uuid)'::pg_catalog.regprocedure
      )
      AND (
        SELECT function_row.prosrc LIKE '%effective_completed_at%'
          AND function_row.prosrc NOT LIKE '%effective_performed_on%'
        FROM pg_catalog.pg_proc AS function_row
        WHERE function_row.oid =
          'public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'::pg_catalog.regprocedure
      ) AS sql145_replace_targets_exact,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute
      WHERE attrelid IN (
        'public.household_chore_assignments'::pg_catalog.regclass,
        'public.household_chore_assignment_events'::pg_catalog.regclass
      )
        AND attname IN (
          'performed_on', 'previous_performed_on', 'reversed_performed_on'
        )
        AND attnum > 0 AND NOT attisdropped
    ) AS target_columns_clear,
    pg_catalog.to_regclass(
      'public.household_chore_assignments_performed_definition_idx'
    ) IS NULL
      AND pg_catalog.to_regclass(
        'public.household_chore_assignments_performed_participant_idx'
      ) IS NULL AS target_indexes_clear,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger
      WHERE tgrelid IN (
        'public.household_chore_assignments'::pg_catalog.regclass,
        'public.household_chore_assignment_events'::pg_catalog.regclass
      )
        AND tgname IN (
          'household_chore_assignments_performed_date_guard',
          'household_chore_events_performed_date_guard'
        )
        AND NOT tgisinternal
    ) AS target_triggers_clear,
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
    ) AS immutable_guard_ready,
    pg_catalog.to_regprocedure(
      'public.household_chore_private_performed_date_guard()'
    ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_event_date_guard()'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_performed_on_valid(text,date)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_latest_priority_event(uuid,uuid,uuid,text)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_complete_locked_assignment_v2(uuid,public.household_chore_assignments,date)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_complete_definition_core_v2(uuid,uuid,uuid,uuid,uuid,text,date,boolean)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_history_page_v2(uuid,uuid,uuid,uuid,boolean,timestamptz,uuid,integer)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_priority_dashboard_v2(uuid,uuid)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_complete_definition_v2(uuid,uuid,uuid,uuid,uuid,text,date)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_complete_assignment_v2(uuid,uuid,uuid,uuid,bigint,date)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_correct_completion_date(uuid,uuid,uuid,uuid,bigint,integer,date)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_definition_history_v2(uuid,uuid,uuid,timestamptz,uuid,integer)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_assignment_timeline_v2(uuid,uuid,uuid,timestamptz,uuid,integer)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_assignment_v2(uuid,uuid,uuid)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_definition_detail_v3(uuid,uuid,uuid)'
      ) IS NULL AS target_functions_clear,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_assignments'::pg_catalog.regclass
        AND conname = 'household_chore_assignments_completion_check'
        AND contype = 'c' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%completed_at IS NOT NULL%'
        AND pg_catalog.pg_get_constraintdef(oid) NOT LIKE '%performed_on%'
    ) AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_assignment_events'::pg_catalog.regclass
        AND conname = 'household_chore_events_type_check'
        AND contype = 'c' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) NOT LIKE '%completion_date_corrected%'
    ) AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_assignment_events'::pg_catalog.regclass
        AND conname = 'household_chore_events_shape_check'
        AND contype = 'c' AND convalidated
    ) AS source_constraints_ready,
    NOT EXISTS (
      SELECT 1
      FROM public.household_chore_assignments AS assignment_row
      WHERE (assignment_row.status = 'completed'
          AND assignment_row.completed_at IS NULL)
         OR (assignment_row.status <> 'completed'
          AND assignment_row.completed_at IS NOT NULL)
    ) AS assignment_source_data_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.household_chore_assignment_events AS event_row
      WHERE event_row.event_type IN ('completed', 'recompleted')
        AND (event_row.completion_sequence IS NULL OR event_row.occurred_at IS NULL)
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.household_chore_assignment_events AS reversal_row
      WHERE reversal_row.event_type = 'completion_reversed'
        AND 1 <> (
          SELECT pg_catalog.count(*)
          FROM public.household_chore_assignment_events AS source_row
          WHERE source_row.circle_id = reversal_row.circle_id
            AND source_row.assignment_id = reversal_row.assignment_id
            AND source_row.completion_sequence = reversal_row.completion_sequence
            AND source_row.event_type IN ('completed', 'recompleted')
            AND (source_row.occurred_at, source_row.id)
              < (reversal_row.occurred_at, reversal_row.id)
        )
    ) AS event_source_data_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.household_chore_assignments'::pg_catalog.regclass
        AND relrowsecurity AND relforcerowsecurity
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.household_chore_assignment_events'::pg_catalog.regclass
        AND relrowsecurity AND relforcerowsecurity
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid IN (
        'public.household_chore_assignments'::pg_catalog.regclass,
        'public.household_chore_assignment_events'::pg_catalog.regclass
      )
    ) AS rls_posture_ok,
    pg_catalog.to_regprocedure(
      'public.feature_access_heimilisverkin_auth_email_guard()'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_link_participant(uuid,uuid,uuid,uuid,bigint,text,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_definition_detail_v2(uuid,uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_create_definition_v2(uuid,uuid,uuid,text,text,text,integer,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_update_definition_v2(uuid,uuid,uuid,uuid,bigint,text,text,text,integer,text)'
      ) IS NOT NULL AS protected_catalog_ok
), final AS (
  SELECT *,
    server_version_ok AND executor_ok AND relations_ok
      AND foundation_functions_ok AND sql145_replace_targets_exact
      AND target_columns_clear AND target_indexes_clear
      AND target_triggers_clear AND immutable_guard_ready
      AND target_functions_clear
      AND source_constraints_ready AND assignment_source_data_ok
      AND event_source_data_ok AND rls_posture_ok
      AND protected_catalog_ok AS prerequisites_ok
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
  sql145_replace_targets_exact,
  target_columns_clear,
  target_indexes_clear,
  target_triggers_clear,
  immutable_guard_ready,
  target_functions_clear,
  source_constraints_ready,
  assignment_source_data_ok,
  event_source_data_ok,
  rls_posture_ok,
  protected_catalog_ok,
  prerequisites_ok
FROM final;

SELECT
  pg_catalog.count(*) FILTER (
    WHERE assignment_row.status = 'completed'
  ) AS completed_assignment_backfill_count,
  pg_catalog.count(*) FILTER (
    WHERE assignment_row.status = 'completed'
      AND assignment_row.completed_at IS NULL
  ) AS completed_assignment_missing_timestamp_count,
  pg_catalog.count(*) FILTER (
    WHERE assignment_row.status = 'open'
  ) AS open_assignment_count,
  pg_catalog.count(*) FILTER (
    WHERE assignment_row.status = 'cancelled'
  ) AS cancelled_assignment_count,
  pg_catalog.count(*) FILTER (
    WHERE assignment_row.status = 'completed'
      AND (assignment_row.completed_at AT TIME ZONE 'UTC')::date
        <> (assignment_row.completed_at AT TIME ZONE 'Atlantic/Reykjavik')::date
  ) AS assignment_reykjavik_utc_date_shift_count,
  pg_catalog.min(assignment_row.completed_at) FILTER (
    WHERE assignment_row.status = 'completed'
  ) AS completed_source_min,
  pg_catalog.max(assignment_row.completed_at) FILTER (
    WHERE assignment_row.status = 'completed'
  ) AS completed_source_max
FROM public.household_chore_assignments AS assignment_row;

SELECT
  pg_catalog.count(*) FILTER (
    WHERE event_row.event_type IN ('completed', 'recompleted')
  ) AS completion_event_backfill_count,
  pg_catalog.count(*) FILTER (
    WHERE event_row.event_type = 'completion_reversed'
  ) AS reversal_event_backfill_count,
  pg_catalog.count(*) FILTER (
    WHERE event_row.event_type = 'completion_reversed'
      AND 1 <> (
        SELECT pg_catalog.count(*)
        FROM public.household_chore_assignment_events AS source_row
        WHERE source_row.circle_id = event_row.circle_id
          AND source_row.assignment_id = event_row.assignment_id
          AND source_row.completion_sequence = event_row.completion_sequence
          AND source_row.event_type IN ('completed', 'recompleted')
          AND (source_row.occurred_at, source_row.id)
            < (event_row.occurred_at, event_row.id)
      )
  ) AS ambiguous_reversal_mapping_count,
  pg_catalog.count(*) FILTER (
    WHERE event_row.event_type IN ('completed', 'recompleted')
      AND (event_row.occurred_at AT TIME ZONE 'UTC')::date
        <> (event_row.occurred_at AT TIME ZONE 'Atlantic/Reykjavik')::date
  ) AS event_reykjavik_utc_date_shift_count,
  pg_catalog.min(event_row.occurred_at) FILTER (
    WHERE event_row.event_type IN ('completed', 'recompleted')
  ) AS completion_event_source_min,
  pg_catalog.max(event_row.occurred_at) FILTER (
    WHERE event_row.event_type IN ('completed', 'recompleted')
  ) AS completion_event_source_max
FROM public.household_chore_assignment_events AS event_row;

ROLLBACK;

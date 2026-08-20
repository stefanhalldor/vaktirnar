-- Read-only SQL146 postflight. Every boolean and postconditions_ok must be true.
BEGIN;
SET TRANSACTION READ ONLY;

WITH checks AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.household_chore_assignments'::pg_catalog.regclass
        AND attname = 'performed_on'
        AND atttypid = 'date'::pg_catalog.regtype
        AND NOT attnotnull AND NOT atthasdef
        AND attnum > 0 AND NOT attisdropped
    ) AS assignment_column_ok,
    (
      SELECT pg_catalog.count(*) = 3
      FROM pg_catalog.pg_attribute
      WHERE attrelid =
        'public.household_chore_assignment_events'::pg_catalog.regclass
        AND attname IN (
          'performed_on', 'previous_performed_on', 'reversed_performed_on'
        )
        AND atttypid = 'date'::pg_catalog.regtype
        AND NOT attnotnull AND NOT atthasdef
        AND attnum > 0 AND NOT attisdropped
    ) AS event_columns_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_assignments'::pg_catalog.regclass
        AND conname = 'household_chore_assignments_completion_check'
        AND contype = 'c' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%performed_on IS NOT NULL%'
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%performed_on IS NULL%'
    ) AS assignment_constraint_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid =
        'public.household_chore_assignment_events'::pg_catalog.regclass
        AND conname = 'household_chore_events_type_check'
        AND contype = 'c' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%completion_date_corrected%'
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid =
        'public.household_chore_assignment_events'::pg_catalog.regclass
        AND conname = 'household_chore_events_shape_check'
        AND contype = 'c' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%previous_performed_on%'
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%reversed_performed_on%'
    ) AS event_constraints_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.household_chore_assignments AS assignment_row
      WHERE (assignment_row.status = 'completed'
          AND (assignment_row.completed_at IS NULL
            OR assignment_row.performed_on IS NULL))
         OR (assignment_row.status <> 'completed'
          AND assignment_row.performed_on IS NOT NULL)
    ) AS assignment_data_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.household_chore_assignment_events AS event_row
      WHERE (event_row.event_type IN ('completed', 'recompleted')
          AND (event_row.performed_on IS NULL
            OR event_row.previous_performed_on IS NOT NULL
            OR event_row.reversed_performed_on IS NOT NULL))
         OR (event_row.event_type = 'completion_reversed'
          AND (event_row.reversed_performed_on IS NULL
            OR event_row.performed_on IS NOT NULL
            OR event_row.previous_performed_on IS NOT NULL))
         OR (event_row.event_type = 'completion_date_corrected'
          AND (event_row.performed_on IS NULL
            OR event_row.previous_performed_on IS NULL
            OR event_row.performed_on = event_row.previous_performed_on
            OR event_row.reversed_performed_on IS NOT NULL))
         OR (event_row.event_type IN ('created', 'cancelled')
          AND (event_row.performed_on IS NOT NULL
            OR event_row.previous_performed_on IS NOT NULL
            OR event_row.reversed_performed_on IS NOT NULL))
    ) AS event_data_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.household_chore_assignments AS assignment_row
      WHERE assignment_row.status = 'completed'
        AND assignment_row.performed_on <> (
          assignment_row.completed_at AT TIME ZONE 'Atlantic/Reykjavik'
        )::date
        AND NOT EXISTS (
          SELECT 1
          FROM public.household_chore_assignment_events AS correction_row
          WHERE correction_row.circle_id = assignment_row.circle_id
            AND correction_row.assignment_id = assignment_row.id
            AND correction_row.completion_sequence =
              assignment_row.completion_sequence
            AND correction_row.event_type = 'completion_date_corrected'
        )
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.household_chore_assignment_events AS completion_row
      WHERE completion_row.event_type IN ('completed', 'recompleted')
        AND completion_row.performed_on <> (
          completion_row.occurred_at AT TIME ZONE 'Atlantic/Reykjavik'
        )::date
    ) AS backfill_exact_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.household_chore_assignment_events AS reversal_row
      WHERE reversal_row.event_type = 'completion_reversed'
        AND reversal_row.reversed_performed_on IS DISTINCT FROM (
          SELECT source_row.performed_on
          FROM public.household_chore_assignment_events AS source_row
          WHERE source_row.circle_id = reversal_row.circle_id
            AND source_row.assignment_id = reversal_row.assignment_id
            AND source_row.completion_sequence = reversal_row.completion_sequence
            AND source_row.event_type IN (
              'completed', 'recompleted', 'completion_date_corrected'
            )
            AND (source_row.occurred_at, source_row.id)
              < (reversal_row.occurred_at, reversal_row.id)
          ORDER BY source_row.occurred_at DESC, source_row.id DESC
          LIMIT 1
        )
    ) AS reversal_audit_ok,
    pg_catalog.to_regclass(
      'public.household_chore_assignments_performed_definition_idx'
    ) IS NOT NULL
      AND pg_catalog.to_regclass(
        'public.household_chore_assignments_performed_participant_idx'
      ) IS NOT NULL AS indexes_ok,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid =
          'public.household_chore_assignments'::pg_catalog.regclass
        AND trigger_row.tgname =
          'household_chore_assignments_performed_date_guard'
        AND trigger_row.tgfoid =
          'public.household_chore_private_performed_date_guard()'::pg_catalog.regprocedure
        AND trigger_row.tgenabled = 'O' AND NOT trigger_row.tgisinternal
    ) AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid =
          'public.household_chore_assignment_events'::pg_catalog.regclass
        AND trigger_row.tgname = 'household_chore_events_performed_date_guard'
        AND trigger_row.tgfoid =
          'public.household_chore_private_event_date_guard()'::pg_catalog.regprocedure
        AND trigger_row.tgenabled = 'O' AND NOT trigger_row.tgisinternal
    ) AS triggers_ok,
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
    ) AS immutable_guard_preserved_ok,
    pg_catalog.to_regprocedure(
      'public.household_chore_get_priority_dashboard_v2(uuid,uuid)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_complete_definition_v2(uuid,uuid,uuid,uuid,uuid,text,date)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_complete_assignment_v2(uuid,uuid,uuid,uuid,bigint,date)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_correct_completion_date(uuid,uuid,uuid,uuid,bigint,integer,date)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_definition_history_v2(uuid,uuid,uuid,timestamptz,uuid,integer)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_assignment_timeline_v2(uuid,uuid,uuid,timestamptz,uuid,integer)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_assignment_v2(uuid,uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_definition_detail_v3(uuid,uuid,uuid)'
      ) IS NOT NULL AS public_functions_ok,
    pg_catalog.to_regprocedure(
      'public.household_chore_private_performed_date_guard()'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_event_date_guard()'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_performed_on_valid(text,date)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_latest_priority_event(uuid,uuid,uuid,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_complete_locked_assignment_v2(uuid,public.household_chore_assignments,date)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_complete_definition_core_v2(uuid,uuid,uuid,uuid,uuid,text,date,boolean)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_history_page_v2(uuid,uuid,uuid,uuid,boolean,timestamptz,uuid,integer)'
      ) IS NOT NULL AS private_functions_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS function_row
      WHERE function_row.oid =
          'public.household_chore_get_priority_dashboard(uuid,uuid)'::pg_catalog.regprocedure
        AND function_row.prosrc LIKE '%household_chore_get_priority_dashboard_v2%'
        AND function_row.prosrc LIKE '%get_priority_dashboard_loaded%'
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS function_row
      WHERE function_row.oid =
          'public.household_chore_get_priority_dashboard_v2(uuid,uuid)'::pg_catalog.regprocedure
        AND function_row.prosrc LIKE '%effective_performed_on%'
        AND function_row.prosrc LIKE '%latest_relevant_event_id%'
        AND function_row.prosrc LIKE '%server_today%'
        AND function_row.prosrc LIKE '%latest_completed_at%'
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS function_row
      WHERE function_row.oid =
          'public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'::pg_catalog.regprocedure
        AND function_row.prosrc LIKE
          '%household_chore_private_complete_definition_core_v2%'
        AND function_row.prosrc LIKE '%Atlantic/Reykjavik%'
    ) AS replacement_bodies_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS function_row
      WHERE function_row.oid =
          'public.household_chore_private_priority_token(jsonb)'::pg_catalog.regprocedure
        AND function_row.prosrc LIKE '%household_chore_private_fingerprint%'
        AND function_row.provolatile = 'i'
    ) AND pg_catalog.to_regprocedure(
      'public.household_chore_get_definition_detail_v2(uuid,uuid,uuid)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_create_definition_v2(uuid,uuid,uuid,text,text,text,integer,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_update_definition_v2(uuid,uuid,uuid,uuid,bigint,text,text,text,integer,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_complete_locked_assignment(uuid,public.household_chore_assignments)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_complete_assignment(uuid,uuid,uuid,uuid,bigint)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_undo_completion(uuid,uuid,uuid,uuid,bigint)'
      ) IS NOT NULL AS protected_functions_ok,
    NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('public.household_chore_get_priority_dashboard(uuid,uuid)'::pg_catalog.regprocedure),
        ('public.household_chore_get_priority_dashboard_v2(uuid,uuid)'::pg_catalog.regprocedure),
        ('public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'::pg_catalog.regprocedure),
        ('public.household_chore_complete_definition_v2(uuid,uuid,uuid,uuid,uuid,text,date)'::pg_catalog.regprocedure),
        ('public.household_chore_complete_assignment_v2(uuid,uuid,uuid,uuid,bigint,date)'::pg_catalog.regprocedure),
        ('public.household_chore_correct_completion_date(uuid,uuid,uuid,uuid,bigint,integer,date)'::pg_catalog.regprocedure),
        ('public.household_chore_get_definition_history_v2(uuid,uuid,uuid,timestamptz,uuid,integer)'::pg_catalog.regprocedure),
        ('public.household_chore_get_assignment_timeline_v2(uuid,uuid,uuid,timestamptz,uuid,integer)'::pg_catalog.regprocedure),
        ('public.household_chore_get_assignment_v2(uuid,uuid,uuid)'::pg_catalog.regprocedure),
        ('public.household_chore_get_definition_detail_v3(uuid,uuid,uuid)'::pg_catalog.regprocedure)
      ) AS callable(function_oid)
      WHERE pg_catalog.has_function_privilege(
          'anon', callable.function_oid, 'EXECUTE'
        )
        OR pg_catalog.has_function_privilege(
          'authenticated', callable.function_oid, 'EXECUTE'
        )
        OR NOT pg_catalog.has_function_privilege(
          'service_role', callable.function_oid, 'EXECUTE'
        )
    ) AS public_function_acl_ok,
    NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('public.household_chore_private_performed_date_guard()'::pg_catalog.regprocedure),
        ('public.household_chore_private_event_date_guard()'::pg_catalog.regprocedure),
        ('public.household_chore_private_performed_on_valid(text,date)'::pg_catalog.regprocedure),
        ('public.household_chore_private_latest_priority_event(uuid,uuid,uuid,text)'::pg_catalog.regprocedure),
        ('public.household_chore_private_complete_locked_assignment_v2(uuid,public.household_chore_assignments,date)'::pg_catalog.regprocedure),
        ('public.household_chore_private_complete_definition_core_v2(uuid,uuid,uuid,uuid,uuid,text,date,boolean)'::pg_catalog.regprocedure),
        ('public.household_chore_private_history_page_v2(uuid,uuid,uuid,uuid,boolean,timestamptz,uuid,integer)'::pg_catalog.regprocedure)
      ) AS private_callable(function_oid)
      WHERE pg_catalog.has_function_privilege(
          'anon', private_callable.function_oid, 'EXECUTE'
        )
        OR pg_catalog.has_function_privilege(
          'authenticated', private_callable.function_oid, 'EXECUTE'
        )
        OR pg_catalog.has_function_privilege(
          'service_role', private_callable.function_oid, 'EXECUTE'
        )
    ) AS private_function_acl_ok,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS function_row
      WHERE function_row.oid IN (
        'public.household_chore_private_performed_date_guard()'::pg_catalog.regprocedure,
        'public.household_chore_private_event_date_guard()'::pg_catalog.regprocedure,
        'public.household_chore_private_performed_on_valid(text,date)'::pg_catalog.regprocedure,
        'public.household_chore_private_latest_priority_event(uuid,uuid,uuid,text)'::pg_catalog.regprocedure,
        'public.household_chore_private_complete_locked_assignment_v2(uuid,public.household_chore_assignments,date)'::pg_catalog.regprocedure,
        'public.household_chore_private_complete_definition_core_v2(uuid,uuid,uuid,uuid,uuid,text,date,boolean)'::pg_catalog.regprocedure,
        'public.household_chore_private_history_page_v2(uuid,uuid,uuid,uuid,boolean,timestamptz,uuid,integer)'::pg_catalog.regprocedure,
        'public.household_chore_get_priority_dashboard(uuid,uuid)'::pg_catalog.regprocedure,
        'public.household_chore_get_priority_dashboard_v2(uuid,uuid)'::pg_catalog.regprocedure,
        'public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'::pg_catalog.regprocedure,
        'public.household_chore_complete_definition_v2(uuid,uuid,uuid,uuid,uuid,text,date)'::pg_catalog.regprocedure,
        'public.household_chore_complete_assignment_v2(uuid,uuid,uuid,uuid,bigint,date)'::pg_catalog.regprocedure,
        'public.household_chore_correct_completion_date(uuid,uuid,uuid,uuid,bigint,integer,date)'::pg_catalog.regprocedure,
        'public.household_chore_get_definition_history_v2(uuid,uuid,uuid,timestamptz,uuid,integer)'::pg_catalog.regprocedure,
        'public.household_chore_get_assignment_timeline_v2(uuid,uuid,uuid,timestamptz,uuid,integer)'::pg_catalog.regprocedure,
        'public.household_chore_get_assignment_v2(uuid,uuid,uuid)'::pg_catalog.regprocedure,
        'public.household_chore_get_definition_detail_v3(uuid,uuid,uuid)'::pg_catalog.regprocedure
      ) AND (
        NOT function_row.prosecdef
        OR pg_catalog.cardinality(
          COALESCE(function_row.proconfig, ARRAY[]::text[])
        ) <> 1
        OR function_row.proconfig[1] NOT IN ('search_path=', 'search_path=""')
      )
    ) AS function_security_shape_ok,
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
    ) AS rls_posture_ok
), final AS (
  SELECT *,
    assignment_column_ok AND event_columns_ok
      AND assignment_constraint_ok AND event_constraints_ok
      AND assignment_data_ok AND event_data_ok AND backfill_exact_ok
      AND reversal_audit_ok AND indexes_ok AND triggers_ok
      AND immutable_guard_preserved_ok
      AND public_functions_ok AND private_functions_ok
      AND replacement_bodies_ok AND protected_functions_ok
      AND public_function_acl_ok AND private_function_acl_ok
      AND function_security_shape_ok AND rls_posture_ok AS postconditions_ok
  FROM checks
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  assignment_column_ok,
  event_columns_ok,
  assignment_constraint_ok,
  event_constraints_ok,
  assignment_data_ok,
  event_data_ok,
  backfill_exact_ok,
  reversal_audit_ok,
  indexes_ok,
  triggers_ok,
  immutable_guard_preserved_ok,
  public_functions_ok,
  private_functions_ok,
  replacement_bodies_ok,
  protected_functions_ok,
  public_function_acl_ok,
  private_function_acl_ok,
  function_security_shape_ok,
  rls_posture_ok,
  postconditions_ok
FROM final;

SELECT
  pg_catalog.count(*) FILTER (
    WHERE assignment_row.status = 'completed'
  ) AS completed_assignment_count,
  pg_catalog.count(*) FILTER (
    WHERE assignment_row.status = 'completed'
      AND assignment_row.performed_on IS NULL
  ) AS missing_assignment_performed_on_count,
  pg_catalog.count(*) FILTER (
    WHERE assignment_row.status <> 'completed'
      AND assignment_row.performed_on IS NOT NULL
  ) AS unexpected_noncompleted_performed_on_count,
  pg_catalog.count(*) FILTER (
    WHERE assignment_row.status = 'completed'
      AND (assignment_row.completed_at AT TIME ZONE 'UTC')::date
        <> (assignment_row.completed_at AT TIME ZONE 'Atlantic/Reykjavik')::date
  ) AS assignment_reykjavik_utc_date_shift_count
FROM public.household_chore_assignments AS assignment_row;

SELECT
  pg_catalog.count(*) FILTER (
    WHERE event_row.event_type IN ('completed', 'recompleted')
  ) AS completion_event_count,
  pg_catalog.count(*) FILTER (
    WHERE event_row.event_type = 'completion_reversed'
  ) AS reversal_event_count,
  pg_catalog.count(*) FILTER (
    WHERE event_row.event_type = 'completion_date_corrected'
  ) AS correction_event_count,
  pg_catalog.count(*) FILTER (
    WHERE event_row.event_type IN ('completed', 'recompleted')
      AND event_row.performed_on IS NULL
  ) AS missing_completion_event_performed_on_count,
  pg_catalog.count(*) FILTER (
    WHERE event_row.event_type = 'completion_reversed'
      AND event_row.reversed_performed_on IS NULL
  ) AS missing_reversal_performed_on_count,
  pg_catalog.count(*) FILTER (
    WHERE event_row.event_type IN ('completed', 'recompleted')
      AND (event_row.occurred_at AT TIME ZONE 'UTC')::date
        <> (event_row.occurred_at AT TIME ZONE 'Atlantic/Reykjavik')::date
  ) AS event_reykjavik_utc_date_shift_count
FROM public.household_chore_assignment_events AS event_row;

ROLLBACK;

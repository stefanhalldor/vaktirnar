-- Household chores: authoritative work dates, compact completion state and correction audit.
-- Run validation/146-household-chore-performed-dates/preflight.sql first.
-- TODO: V1 intentionally uses Atlantic/Reykjavik. Add circle.time_zone before
-- supporting multiple product timezones; never infer it from a browser locale.
BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('teskeid:household-chores:sql146', 0)
);

DO $preconditions$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'household_chore_sql146_executor_invalid';
  END IF;
  IF pg_catalog.to_regclass('public.household_chore_definitions') IS NULL
     OR pg_catalog.to_regclass('public.household_chore_participant_values') IS NULL
     OR pg_catalog.to_regclass('public.household_chore_assignments') IS NULL
     OR pg_catalog.to_regclass('public.household_chore_assignment_events') IS NULL
     OR pg_catalog.to_regclass('public.household_chore_point_entries') IS NULL THEN
    RAISE EXCEPTION 'household_chore_sql146_foundation_missing';
  END IF;
  IF pg_catalog.to_regprocedure(
       'public.household_chore_get_priority_dashboard(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.household_chore_private_priority_token(jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.household_chore_private_complete_locked_assignment(uuid,public.household_chore_assignments)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.household_chore_complete_assignment(uuid,uuid,uuid,uuid,bigint)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.household_chore_undo_completion(uuid,uuid,uuid,uuid,bigint)'
     ) IS NULL THEN
    RAISE EXCEPTION 'household_chore_sql146_function_prerequisite_missing';
  END IF;
  IF NOT EXISTS (
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
  ) THEN
    RAISE EXCEPTION 'household_chore_sql146_immutable_guard_prerequisite_missing';
  END IF;
  IF EXISTS (
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
  ) OR pg_catalog.to_regprocedure(
    'public.household_chore_complete_definition_v2(uuid,uuid,uuid,uuid,uuid,text,date)'
  ) IS NOT NULL OR pg_catalog.to_regprocedure(
    'public.household_chore_get_priority_dashboard_v2(uuid,uuid)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'household_chore_sql146_target_collision';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.household_chore_assignments AS assignment_row
    WHERE (assignment_row.status = 'completed' AND assignment_row.completed_at IS NULL)
       OR (assignment_row.status <> 'completed' AND assignment_row.completed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'household_chore_sql146_assignment_source_invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.household_chore_assignment_events AS event_row
    WHERE event_row.event_type IN ('completed', 'recompleted')
      AND (event_row.completion_sequence IS NULL OR event_row.occurred_at IS NULL)
  ) OR EXISTS (
    SELECT 1
    FROM public.household_chore_assignment_events AS reversal_row
    WHERE reversal_row.event_type = 'completion_reversed'
      AND NOT EXISTS (
        SELECT 1
        FROM public.household_chore_assignment_events AS source_row
        WHERE source_row.circle_id = reversal_row.circle_id
          AND source_row.assignment_id = reversal_row.assignment_id
          AND source_row.completion_sequence = reversal_row.completion_sequence
          AND source_row.event_type IN ('completed', 'recompleted')
          AND (source_row.occurred_at, source_row.id)
            < (reversal_row.occurred_at, reversal_row.id)
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_sql146_event_source_invalid';
  END IF;
END;
$preconditions$;

ALTER TABLE public.household_chore_assignments
  ADD COLUMN performed_on date NULL;

ALTER TABLE public.household_chore_assignment_events
  ADD COLUMN performed_on date NULL,
  ADD COLUMN previous_performed_on date NULL,
  ADD COLUMN reversed_performed_on date NULL;

UPDATE public.household_chore_assignments AS assignment_row
SET performed_on = (
  assignment_row.completed_at AT TIME ZONE 'Atlantic/Reykjavik'
)::date
WHERE assignment_row.status = 'completed';

-- Existing assignment events are append-only. Pause only their exact immutable
-- trigger inside this transaction for the one-time NULL-to-audit-date backfill,
-- then restore it before any new SQL146 event guard/function is installed. If
-- any statement fails, PostgreSQL rolls the trigger state and data back together.
ALTER TABLE public.household_chore_assignment_events
  DISABLE TRIGGER household_chore_assignment_events_immutable;

UPDATE public.household_chore_assignment_events AS event_row
SET performed_on = (
  event_row.occurred_at AT TIME ZONE 'Atlantic/Reykjavik'
)::date
WHERE event_row.event_type IN ('completed', 'recompleted');

UPDATE public.household_chore_assignment_events AS reversal_row
SET reversed_performed_on = (
  SELECT completion_row.performed_on
  FROM public.household_chore_assignment_events AS completion_row
  WHERE completion_row.circle_id = reversal_row.circle_id
    AND completion_row.assignment_id = reversal_row.assignment_id
    AND completion_row.completion_sequence = reversal_row.completion_sequence
    AND completion_row.event_type IN ('completed', 'recompleted')
    AND (completion_row.occurred_at, completion_row.id)
      < (reversal_row.occurred_at, reversal_row.id)
  ORDER BY completion_row.occurred_at DESC, completion_row.id DESC
  LIMIT 1
)
WHERE reversal_row.event_type = 'completion_reversed';

ALTER TABLE public.household_chore_assignment_events
  ENABLE TRIGGER household_chore_assignment_events_immutable;

ALTER TABLE public.household_chore_assignments
  DROP CONSTRAINT household_chore_assignments_completion_check,
  ADD CONSTRAINT household_chore_assignments_completion_check CHECK (
    (status = 'open' AND completed_at IS NULL AND performed_on IS NULL
      AND cancelled_at IS NULL AND cancellation_reason IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL
      AND performed_on IS NOT NULL
      AND cancelled_at IS NULL AND cancellation_reason IS NULL
      AND completion_sequence > 0)
    OR (status = 'cancelled' AND completed_at IS NULL AND performed_on IS NULL
      AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
  );

ALTER TABLE public.household_chore_assignment_events
  DROP CONSTRAINT household_chore_events_type_check,
  DROP CONSTRAINT household_chore_events_shape_check,
  ADD CONSTRAINT household_chore_events_type_check CHECK (
    event_type IN (
      'created', 'completed', 'recompleted', 'cancelled',
      'completion_reversed', 'completion_date_corrected'
    )
  ),
  ADD CONSTRAINT household_chore_events_shape_check CHECK (
    ((event_type = 'created' AND completion_sequence IS NULL
        AND points_delta IS NULL AND cancellation_reason IS NULL
        AND reopen_outcome IS NULL AND status_after = 'open'
        AND performed_on IS NULL AND previous_performed_on IS NULL
        AND reversed_performed_on IS NULL)
      OR (event_type IN ('completed', 'recompleted')
        AND completion_sequence IS NOT NULL AND completion_sequence > 0
        AND points_delta = snapshot_points AND cancellation_reason IS NULL
        AND reopen_outcome IS NULL AND status_after = 'completed'
        AND performed_on IS NOT NULL AND previous_performed_on IS NULL
        AND reversed_performed_on IS NULL)
      OR (event_type = 'cancelled' AND completion_sequence IS NULL
        AND points_delta IS NULL AND cancellation_reason IS NOT NULL
        AND reopen_outcome IS NULL AND status_after = 'cancelled'
        AND performed_on IS NULL AND previous_performed_on IS NULL
        AND reversed_performed_on IS NULL)
      OR (event_type = 'completion_reversed'
        AND completion_sequence IS NOT NULL AND completion_sequence > 0
        AND points_delta = -snapshot_points AND cancellation_reason IS NULL
        AND reopen_outcome IN ('open', 'cancelled')
        AND status_after = reopen_outcome
        AND performed_on IS NULL AND previous_performed_on IS NULL
        AND reversed_performed_on IS NOT NULL)
      OR (event_type = 'completion_date_corrected'
        AND completion_sequence IS NOT NULL AND completion_sequence > 0
        AND points_delta IS NULL AND cancellation_reason IS NULL
        AND reopen_outcome IS NULL AND status_after = 'completed'
        AND performed_on IS NOT NULL AND previous_performed_on IS NOT NULL
        AND performed_on <> previous_performed_on
        AND reversed_performed_on IS NULL)) IS TRUE
  );

CREATE INDEX household_chore_assignments_performed_definition_idx
  ON public.household_chore_assignments
  (circle_id, definition_id, performed_on DESC, completed_at DESC, id DESC)
  WHERE status = 'completed';

CREATE INDEX household_chore_assignments_performed_participant_idx
  ON public.household_chore_assignments
  (circle_id, definition_id, participant_id,
    performed_on DESC, completed_at DESC, id DESC)
  WHERE status = 'completed';

CREATE OR REPLACE FUNCTION public.household_chore_private_performed_date_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status = 'completed' THEN
    IF NEW.completed_at IS NULL THEN
      RAISE EXCEPTION 'household_chore_completed_time_required';
    END IF;
    IF NEW.performed_on IS NULL THEN
      NEW.performed_on := (
        NEW.completed_at AT TIME ZONE 'Atlantic/Reykjavik'
      )::date;
    END IF;
  ELSE
    NEW.performed_on := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_event_date_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.event_type IN ('completed', 'recompleted') THEN
    IF NEW.performed_on IS NULL THEN
      SELECT assignment_row.performed_on
      INTO NEW.performed_on
      FROM public.household_chore_assignments AS assignment_row
      WHERE assignment_row.circle_id = NEW.circle_id
        AND assignment_row.id = NEW.assignment_id;
    END IF;
    IF NEW.performed_on IS NULL
       OR NEW.previous_performed_on IS NOT NULL
       OR NEW.reversed_performed_on IS NOT NULL THEN
      RAISE EXCEPTION 'household_chore_completion_work_date_invalid';
    END IF;
  ELSIF NEW.event_type = 'completion_reversed' THEN
    IF NEW.reversed_performed_on IS NULL THEN
      SELECT source_row.performed_on
      INTO NEW.reversed_performed_on
      FROM public.household_chore_assignment_events AS source_row
      WHERE source_row.circle_id = NEW.circle_id
        AND source_row.assignment_id = NEW.assignment_id
        AND source_row.completion_sequence = NEW.completion_sequence
        AND source_row.event_type IN (
          'completed', 'recompleted', 'completion_date_corrected'
        )
      ORDER BY source_row.occurred_at DESC, source_row.id DESC
      LIMIT 1;
    END IF;
    IF NEW.reversed_performed_on IS NULL
       OR NEW.performed_on IS NOT NULL
       OR NEW.previous_performed_on IS NOT NULL THEN
      RAISE EXCEPTION 'household_chore_reversal_work_date_invalid';
    END IF;
  ELSIF NEW.event_type = 'completion_date_corrected' THEN
    IF NEW.performed_on IS NULL OR NEW.previous_performed_on IS NULL
       OR NEW.performed_on = NEW.previous_performed_on
       OR NEW.reversed_performed_on IS NOT NULL THEN
      RAISE EXCEPTION 'household_chore_correction_work_date_invalid';
    END IF;
  ELSIF NEW.performed_on IS NOT NULL
     OR NEW.previous_performed_on IS NOT NULL
     OR NEW.reversed_performed_on IS NOT NULL THEN
    RAISE EXCEPTION 'household_chore_noncompletion_work_date_invalid';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER household_chore_assignments_performed_date_guard
BEFORE INSERT OR UPDATE OF status, completed_at, performed_on
ON public.household_chore_assignments
FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_performed_date_guard();

CREATE TRIGGER household_chore_events_performed_date_guard
BEFORE INSERT ON public.household_chore_assignment_events
FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_event_date_guard();

CREATE OR REPLACE FUNCTION public.household_chore_private_performed_on_valid(
  p_membership_type text,
  p_performed_on date
)
RETURNS boolean
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_performed_on <= (
      pg_catalog.statement_timestamp() AT TIME ZONE 'Atlantic/Reykjavik'
    )::date
    AND p_performed_on >= (
      pg_catalog.statement_timestamp() AT TIME ZONE 'Atlantic/Reykjavik'
    )::date - CASE p_membership_type
      WHEN 'member' THEN 365
      WHEN 'child' THEN 1
      ELSE -1
    END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_latest_priority_event(
  p_circle_id uuid,
  p_definition_id uuid,
  p_participant_id uuid,
  p_completion_scope text
)
RETURNS TABLE(event_id uuid, event_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT event_row.id, event_row.occurred_at
  FROM public.household_chore_assignment_events AS event_row
  WHERE event_row.circle_id = p_circle_id
    AND event_row.definition_id = p_definition_id
    AND (
      p_completion_scope = 'global'
      OR event_row.participant_id = p_participant_id
    )
  ORDER BY event_row.occurred_at DESC, event_row.id DESC
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_complete_locked_assignment_v2(
  p_actor_id uuid,
  p_assignment public.household_chore_assignments,
  p_performed_on date
)
RETURNS public.household_chore_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_sequence integer := p_assignment.completion_sequence + 1;
  v_event_type text;
BEGIN
  IF p_assignment.status <> 'open' OR p_performed_on IS NULL THEN
    RAISE EXCEPTION 'household_chore_v2_completion_assignment_invalid';
  END IF;
  v_event_type := CASE WHEN v_sequence = 1 THEN 'completed'
    ELSE 'recompleted' END;
  UPDATE public.household_chore_assignments AS assignment_row
  SET status = 'completed',
      completion_sequence = v_sequence,
      completed_by_user_id = p_actor_id,
      completed_at = pg_catalog.clock_timestamp(),
      performed_on = p_performed_on,
      cancelled_at = NULL,
      cancellation_reason = NULL,
      version = assignment_row.version + 1
  WHERE assignment_row.id = p_assignment.id
    AND assignment_row.circle_id = p_assignment.circle_id
    AND assignment_row.status = 'open'
    AND assignment_row.version = p_assignment.version
  RETURNING assignment_row.* INTO v_assignment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'household_chore_v2_completion_assignment_drift';
  END IF;
  INSERT INTO public.household_chore_point_entries (
    circle_id, assignment_id, participant_id, entry_kind,
    completion_sequence, points_delta, actor_user_id
  ) VALUES (
    v_assignment.circle_id, v_assignment.id, v_assignment.participant_id,
    'earned', v_sequence, v_assignment.points_snapshot, p_actor_id
  );
  PERFORM public.household_chore_private_insert_assignment_event(
    v_assignment, v_event_type, 'completed', p_actor_id, 'current',
    v_sequence, v_assignment.points_snapshot, NULL, NULL
  );
  RETURN v_assignment;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_complete_definition_core_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_participant_id uuid,
  p_expected_state_token text,
  p_performed_on date,
  p_include_dates boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_membership public.household_chore_memberships%ROWTYPE;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_value public.household_chore_participant_values%ROWTYPE;
  v_effective public.household_chore_assignments%ROWTYPE;
  v_oldest_open public.household_chore_assignments%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_latest_event_id uuid;
  v_latest_event_at timestamptz;
  v_current_token text;
  v_data jsonb;
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_expected_state_token IS NULL
     OR pg_catalog.char_length(p_expected_state_token) <> 64
     OR p_expected_state_token !~ '^[0-9a-f]{64}$'
     OR p_performed_on IS NULL THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  PERFORM 1
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id
  FOR UPDATE;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF NOT public.household_chore_private_performed_on_valid(
    v_membership.membership_type, p_performed_on
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'invalid_performed_date', p_request_id
      )
    );
  END IF;
  IF v_membership.membership_type = 'child'
     AND v_membership.participant_id IS DISTINCT FROM p_participant_id THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_allowed', p_request_id)
    );
  END IF;

  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = p_definition_id
  FOR UPDATE;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = p_participant_id
  FOR UPDATE;
  SELECT value_row.* INTO v_value
  FROM public.household_chore_participant_values AS value_row
  WHERE value_row.circle_id = p_circle_id
    AND value_row.definition_id = p_definition_id
    AND value_row.participant_id = p_participant_id
  FOR UPDATE;
  IF v_definition.id IS NULL OR v_definition.status <> 'active'
     OR v_participant.id IS NULL OR v_participant.status <> 'active'
     OR v_value.id IS NULL OR v_value.status <> 'active'
     OR (v_membership.membership_type = 'child'
       AND v_participant.linked_user_id IS DISTINCT FROM p_actor_id)
     OR (v_participant.linked_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1
       FROM public.household_chore_memberships AS target_membership
       WHERE target_membership.circle_id = p_circle_id
         AND target_membership.participant_id = v_participant.id
         AND target_membership.user_id = v_participant.linked_user_id
         AND target_membership.status = 'active'
     )) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  SELECT completed_row.* INTO v_effective
  FROM public.household_chore_assignments AS completed_row
  WHERE completed_row.circle_id = p_circle_id
    AND completed_row.definition_id = p_definition_id
    AND completed_row.status = 'completed'
    AND (
      v_definition.completion_scope = 'global'
      OR completed_row.participant_id = p_participant_id
    )
  ORDER BY completed_row.performed_on DESC,
    completed_row.completed_at DESC, completed_row.id DESC
  LIMIT 1
  FOR UPDATE;

  SELECT open_row.* INTO v_oldest_open
  FROM public.household_chore_assignments AS open_row
  WHERE open_row.circle_id = p_circle_id
    AND open_row.definition_id = p_definition_id
    AND open_row.participant_id = p_participant_id
    AND open_row.status = 'open'
  ORDER BY open_row.created_at, open_row.id
  LIMIT 1
  FOR UPDATE;

  SELECT seal_row.event_id, seal_row.event_at
  INTO v_latest_event_id, v_latest_event_at
  FROM public.household_chore_private_latest_priority_event(
    p_circle_id, p_definition_id, p_participant_id,
    v_definition.completion_scope
  ) AS seal_row;

  v_current_token := public.household_chore_private_priority_token(
    pg_catalog.jsonb_build_object(
      'scope', v_definition.completion_scope,
      'definition_version', v_definition.version::text,
      'value_version', v_value.version::text,
      'effective_assignment_id', v_effective.id,
      'effective_assignment_version', v_effective.version,
      'effective_completion_sequence', v_effective.completion_sequence,
      'effective_performed_on', v_effective.performed_on,
      'effective_completed_at', v_effective.completed_at,
      'oldest_open_assignment_id', v_oldest_open.id,
      'oldest_open_assignment_version', v_oldest_open.version,
      'latest_relevant_event_id', v_latest_event_id,
      'latest_relevant_event_at', v_latest_event_at
    )
  );
  IF v_current_token IS DISTINCT FROM p_expected_state_token THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'stale_version', p_request_id
      )
    );
  END IF;

  SELECT open_row.* INTO v_assignment
  FROM public.household_chore_assignments AS open_row
  WHERE open_row.circle_id = p_circle_id
    AND open_row.definition_id = p_definition_id
    AND open_row.participant_id = p_participant_id
    AND open_row.status = 'open'
    AND (open_row.created_at AT TIME ZONE 'Atlantic/Reykjavik')::date
      <= p_performed_on
  ORDER BY open_row.created_at, open_row.id
  LIMIT 1
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    IF v_membership.membership_type = 'child' THEN
      PERFORM public.household_chore_private_prune_rates(
        p_actor_id, p_circle_id, NULL, p_participant_id
      );
      IF (
        SELECT pg_catalog.count(*)
        FROM public.household_chore_rate_events AS rate_row
        WHERE rate_row.rate_kind = 'self_assign_created'
          AND rate_row.circle_id = p_circle_id
          AND rate_row.participant_id = p_participant_id
          AND rate_row.occurred_at > v_now - interval '24 hours'
      ) >= 20 THEN
        RETURN public.household_chore_private_finish_request(
          p_actor_id, p_request_id,
          public.household_chore_private_result(
            false, 'rate_limited', p_request_id,
            pg_catalog.jsonb_build_object('retry_after_seconds', 3600)
          )
        );
      END IF;
    END IF;
    v_assignment := public.household_chore_private_create_assignment(
      p_actor_id, v_definition, v_participant, v_value,
      'quick_completed', NULL
    );
    IF v_membership.membership_type = 'child' THEN
      INSERT INTO public.household_chore_rate_events (
        rate_kind, actor_user_id, circle_id, participant_id, occurred_at
      ) VALUES (
        'self_assign_created', p_actor_id, p_circle_id,
        p_participant_id, v_now
      );
    END IF;
  END IF;

  v_assignment := public.household_chore_private_complete_locked_assignment_v2(
    p_actor_id, v_assignment, p_performed_on
  );
  v_data := pg_catalog.jsonb_build_object(
    'resource_id', v_assignment.id,
    'definition_id', v_assignment.definition_id,
    'participant_id', v_assignment.participant_id,
    'version', v_assignment.version::text,
    'status', v_assignment.status,
    'completion_sequence', v_assignment.completion_sequence::text,
    'points_delta', v_assignment.points_snapshot
  );
  IF p_include_dates THEN
    v_data := v_data || pg_catalog.jsonb_build_object(
      'performed_on', v_assignment.performed_on,
      'recorded_at', v_assignment.completed_at
    );
  END IF;
  v_result := public.household_chore_private_result(
    true, 'assignment_completed', p_request_id, v_data
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_complete_definition(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_participant_id uuid,
  p_expected_state_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_performed_on date := (
    pg_catalog.clock_timestamp() AT TIME ZONE 'Atlantic/Reykjavik'
  )::date;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'definition_id', p_definition_id,
      'participant_id', p_participant_id,
      'expected_state_token', p_expected_state_token
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'complete_definition', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  RETURN public.household_chore_private_complete_definition_core_v2(
    p_actor_id, p_request_id, p_circle_id, p_definition_id,
    p_participant_id, p_expected_state_token, v_performed_on, false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_complete_definition_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_participant_id uuid,
  p_expected_state_token text,
  p_performed_on date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_performed_on date := COALESCE(
    p_performed_on,
    (pg_catalog.clock_timestamp() AT TIME ZONE 'Atlantic/Reykjavik')::date
  );
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'definition_id', p_definition_id,
      'participant_id', p_participant_id,
      'expected_state_token', p_expected_state_token,
      'performed_on', v_performed_on
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'complete_definition_v2', v_fingerprint
  );
  IF v_started->>'code' = 'conflict' THEN
    RETURN public.household_chore_private_result(
      false, 'fingerprint_mismatch', p_request_id
    );
  END IF;
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  RETURN public.household_chore_private_complete_definition_core_v2(
    p_actor_id, p_request_id, p_circle_id, p_definition_id,
    p_participant_id, p_expected_state_token, v_performed_on, true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_complete_assignment_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_assignment_id uuid,
  p_expected_version bigint,
  p_performed_on date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_membership public.household_chore_memberships%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_performed_on date := COALESCE(
    p_performed_on,
    (pg_catalog.clock_timestamp() AT TIME ZONE 'Atlantic/Reykjavik')::date
  );
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'assignment_id', p_assignment_id,
      'expected_version', p_expected_version,
      'performed_on', v_performed_on
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'complete_assignment_v2', v_fingerprint
  );
  IF v_started->>'code' = 'conflict' THEN
    RETURN public.household_chore_private_result(
      false, 'fingerprint_mismatch', p_request_id
    );
  END IF;
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  PERFORM 1
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id
  FOR UPDATE;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF NOT public.household_chore_private_performed_on_valid(
    v_membership.membership_type, v_performed_on
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'invalid_performed_date', p_request_id
      )
    );
  END IF;

  SELECT assignment_row.* INTO v_assignment
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_assignment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_assignment.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_assignment.status <> 'open' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', v_assignment.status)
      )
    );
  END IF;
  IF v_membership.membership_type = 'child'
     AND v_assignment.participant_id <> v_membership.participant_id THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_allowed', p_request_id)
    );
  END IF;
  IF v_assignment.origin <> 'quick_completed'
     AND v_performed_on < (
       v_assignment.created_at AT TIME ZONE 'Atlantic/Reykjavik'
     )::date THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'invalid_performed_date', p_request_id
      )
    );
  END IF;

  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = v_assignment.participant_id
  FOR UPDATE;
  IF NOT FOUND OR v_participant.status <> 'active'
     OR (v_participant.linked_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1
       FROM public.household_chore_memberships AS target_membership
       WHERE target_membership.circle_id = p_circle_id
         AND target_membership.participant_id = v_participant.id
         AND target_membership.user_id = v_participant.linked_user_id
         AND target_membership.status = 'active'
     )) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  v_assignment := public.household_chore_private_complete_locked_assignment_v2(
    p_actor_id, v_assignment, v_performed_on
  );
  v_result := public.household_chore_private_result(
    true, 'assignment_completed', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_assignment.id,
      'version', v_assignment.version::text,
      'status', v_assignment.status,
      'completion_sequence', v_assignment.completion_sequence::text,
      'points_delta', v_assignment.points_snapshot,
      'performed_on', v_assignment.performed_on,
      'recorded_at', v_assignment.completed_at
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_correct_completion_date(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_assignment_id uuid,
  p_expected_version bigint,
  p_completion_sequence integer,
  p_performed_on date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_membership public.household_chore_memberships%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_value public.household_chore_participant_values%ROWTYPE;
  v_effective_id uuid;
  v_previous_performed_on date;
  v_actor_label text;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'assignment_id', p_assignment_id,
      'expected_version', p_expected_version,
      'completion_sequence', p_completion_sequence,
      'performed_on', p_performed_on
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'correct_completion_date', v_fingerprint
  );
  IF v_started->>'code' = 'conflict' THEN
    RETURN public.household_chore_private_result(
      false, 'fingerprint_mismatch', p_request_id
    );
  END IF;
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  PERFORM 1
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id
  FOR UPDATE;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF p_performed_on IS NULL
     OR NOT public.household_chore_private_performed_on_valid(
       v_membership.membership_type, p_performed_on
     ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'invalid_performed_date', p_request_id
      )
    );
  END IF;

  SELECT assignment_row.* INTO v_assignment
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_assignment_id;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;

  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = v_assignment.definition_id
  FOR UPDATE;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = v_assignment.participant_id
  FOR UPDATE;
  SELECT value_row.* INTO v_value
  FROM public.household_chore_participant_values AS value_row
  WHERE value_row.circle_id = p_circle_id
    AND value_row.definition_id = v_assignment.definition_id
    AND value_row.participant_id = v_assignment.participant_id
  FOR UPDATE;
  SELECT assignment_row.* INTO v_assignment
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.status <> 'completed'
     OR v_assignment.version IS DISTINCT FROM p_expected_version
     OR v_assignment.completion_sequence IS DISTINCT FROM p_completion_sequence THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_assignment.performed_on = p_performed_on THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  IF v_assignment.origin <> 'quick_completed'
     AND p_performed_on < (
       v_assignment.created_at AT TIME ZONE 'Atlantic/Reykjavik'
     )::date THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'invalid_performed_date', p_request_id
      )
    );
  END IF;
  IF v_membership.membership_type = 'child' THEN
    IF v_assignment.participant_id IS DISTINCT FROM v_membership.participant_id
       OR v_participant.linked_user_id IS DISTINCT FROM p_actor_id THEN
      RETURN public.household_chore_private_finish_request(
        p_actor_id, p_request_id,
        public.household_chore_private_result(false, 'not_found', p_request_id)
      );
    END IF;
    SELECT effective_row.id INTO v_effective_id
    FROM public.household_chore_assignments AS effective_row
    WHERE effective_row.circle_id = p_circle_id
      AND effective_row.definition_id = v_assignment.definition_id
      AND effective_row.status = 'completed'
      AND (
        v_definition.completion_scope = 'global'
        OR effective_row.participant_id = v_membership.participant_id
      )
    ORDER BY effective_row.performed_on DESC,
      effective_row.completed_at DESC, effective_row.id DESC
    LIMIT 1
    FOR UPDATE;
    IF v_effective_id IS DISTINCT FROM v_assignment.id THEN
      RETURN public.household_chore_private_finish_request(
        p_actor_id, p_request_id,
        public.household_chore_private_result(false, 'not_allowed', p_request_id)
      );
    END IF;
  ELSIF v_membership.membership_type <> 'member' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_allowed', p_request_id)
    );
  END IF;

  v_previous_performed_on := v_assignment.performed_on;
  UPDATE public.household_chore_assignments AS assignment_row
  SET performed_on = p_performed_on,
      version = assignment_row.version + 1
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_assignment_id
    AND assignment_row.status = 'completed'
    AND assignment_row.version = p_expected_version
    AND assignment_row.completion_sequence = p_completion_sequence
  RETURNING assignment_row.* INTO v_assignment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'household_chore_completion_correction_drift';
  END IF;

  v_actor_label := public.household_chore_private_safe_user_label(p_actor_id);
  INSERT INTO public.household_chore_assignment_events (
    circle_id, assignment_id, definition_id, participant_id,
    event_type, status_after, participant_label_snapshot,
    participant_identity_marker, assignment_origin, snapshot_points,
    actor_user_id, actor_label_snapshot, actor_identity_marker,
    completion_sequence, points_delta, cancellation_reason, reopen_outcome,
    performed_on, previous_performed_on, reversed_performed_on
  ) VALUES (
    v_assignment.circle_id, v_assignment.id, v_assignment.definition_id,
    v_assignment.participant_id, 'completion_date_corrected', 'completed',
    v_assignment.participant_label_snapshot,
    v_assignment.participant_identity_marker, v_assignment.origin,
    v_assignment.points_snapshot, p_actor_id, v_actor_label, 'current',
    v_assignment.completion_sequence, NULL, NULL, NULL,
    v_assignment.performed_on, v_previous_performed_on, NULL
  );

  v_result := public.household_chore_private_result(
    true, 'completion_date_corrected', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_assignment.id,
      'version', v_assignment.version::text,
      'status', v_assignment.status,
      'completion_sequence', v_assignment.completion_sequence::text,
      'performed_on', v_assignment.performed_on,
      'recorded_at', v_assignment.completed_at,
      'points_delta', 0
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_priority_dashboard_v2(
  p_actor_id uuid,
  p_circle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_membership public.household_chore_memberships%ROWTYPE;
  v_participants jsonb;
  v_definitions jsonb;
  v_today date := (
    pg_catalog.statement_timestamp() AT TIME ZONE 'Atlantic/Reykjavik'
  )::date;
  v_next_boundary timestamptz;
BEGIN
  v_next_boundary := (v_today + 1)::timestamp
    AT TIME ZONE 'Atlantic/Reykjavik';
  IF p_actor_id IS NULL OR p_circle_id IS NULL
     OR NOT public.household_chore_private_actor_ready(p_actor_id) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active';
  IF NOT FOUND THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  IF v_membership.membership_type = 'member' THEN
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        item.payload ORDER BY item.sort_label, item.participant_id
      ),
      '[]'::jsonb
    ) INTO v_participants
    FROM (
      SELECT
        participant_row.id AS participant_id,
        COALESCE(participant_row.display_name_snapshot, '') AS sort_label,
        pg_catalog.jsonb_build_object(
          'participant_id', participant_row.id,
          'label', participant_row.display_name_snapshot,
          'identity_marker', participant_row.identity_marker,
          'is_viewer', participant_row.id = v_membership.participant_id
        ) AS payload
      FROM public.household_chore_participants AS participant_row
      WHERE participant_row.circle_id = p_circle_id
        AND participant_row.status = 'active'
        AND (
          participant_row.linked_user_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.household_chore_memberships AS linked_membership
            WHERE linked_membership.circle_id = p_circle_id
              AND linked_membership.participant_id = participant_row.id
              AND linked_membership.user_id = participant_row.linked_user_id
              AND linked_membership.status = 'active'
          )
        )
      ORDER BY sort_label, participant_row.id
      LIMIT 100
    ) AS item;

    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        item.payload ORDER BY item.null_cadence, item.priority_due_on,
          item.sort_title, item.definition_id
      ),
      '[]'::jsonb
    ) INTO v_definitions
    FROM (
      SELECT
        definition_row.id AS definition_id,
        pg_catalog.lower(definition_row.title) AS sort_title,
        definition_row.cadence_days IS NULL AS null_cadence,
        state_rollup.priority_due_on,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'definition_id', definition_row.id,
          'title', definition_row.title,
          'description', definition_row.description,
          'materials', definition_row.materials,
          'version', definition_row.version::text,
          'cadence_days', definition_row.cadence_days,
          'completion_scope', definition_row.completion_scope,
          'priority_due_on', state_rollup.priority_due_on,
          'priority_due_at', CASE WHEN state_rollup.priority_due_on IS NULL
            THEN NULL ELSE state_rollup.priority_due_on::timestamp
              AT TIME ZONE 'Atlantic/Reykjavik' END,
          'participant_states', COALESCE(state_rollup.states, '[]'::jsonb),
          'open_assignments', COALESCE(open_rollup.items, '[]'::jsonb),
          'open_assignment_count', COALESCE(open_rollup.total_count, 0),
          'latest_performer_id', CASE
            WHEN definition_row.completion_scope = 'global'
              THEN global_latest.participant_id ELSE NULL END,
          'latest_performer_label', CASE
            WHEN definition_row.completion_scope = 'global'
              THEN global_latest.participant_label_snapshot ELSE NULL END,
          'latest_performer_identity_marker', CASE
            WHEN definition_row.completion_scope = 'global'
              THEN global_latest.participant_identity_marker ELSE NULL END,
          'latest_performed_on', CASE
            WHEN definition_row.completion_scope = 'global'
              THEN global_latest.performed_on ELSE NULL END,
          'recorded_at', CASE
            WHEN definition_row.completion_scope = 'global'
              THEN global_latest.completed_at ELSE NULL END
        )) AS payload
      FROM public.household_chore_definitions AS definition_row
      LEFT JOIN LATERAL (
        SELECT
          pg_catalog.jsonb_agg(
            state_item.payload ORDER BY state_item.sort_label,
              state_item.participant_id
          ) AS states,
          pg_catalog.min(state_item.due_on) AS priority_due_on
        FROM (
          SELECT
            participant_row.id AS participant_id,
            COALESCE(participant_row.display_name_snapshot, '') AS sort_label,
            calculated.due_on,
            pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
              'participant_id', participant_row.id,
              'label', participant_row.display_name_snapshot,
              'identity_marker', participant_row.identity_marker,
              'points', value_row.points,
              'value_version', value_row.version::text,
              'baseline_on', calculated.baseline_on,
              'due_on', calculated.due_on,
              'is_remaining', definition_row.cadence_days IS NOT NULL
                AND calculated.due_on <= v_today,
              'latest_completion_id', latest_row.id,
              'latest_performed_on', latest_row.performed_on,
              'recorded_at', latest_row.completed_at,
              'oldest_open_assignment_id', open_row.id,
              'oldest_open_assignment_version', open_row.version::text,
              -- Legacy rollout fields retained until Phase 2 consumers ship.
              'baseline_at', calculated.baseline_on::timestamp
                AT TIME ZONE 'Atlantic/Reykjavik',
              'due_at', CASE WHEN calculated.due_on IS NULL THEN NULL
                ELSE calculated.due_on::timestamp
                  AT TIME ZONE 'Atlantic/Reykjavik' END,
              'latest_completed_at', latest_row.completed_at,
              'expected_state_token',
                public.household_chore_private_priority_token(
                  pg_catalog.jsonb_build_object(
                    'scope', definition_row.completion_scope,
                    'definition_version', definition_row.version::text,
                    'value_version', value_row.version::text,
                    'effective_assignment_id', latest_row.id,
                    'effective_assignment_version', latest_row.version,
                    'effective_completion_sequence',
                      latest_row.completion_sequence,
                    'effective_performed_on', latest_row.performed_on,
                    'effective_completed_at', latest_row.completed_at,
                    'oldest_open_assignment_id', open_row.id,
                    'oldest_open_assignment_version', open_row.version,
                    'latest_relevant_event_id', seal_row.event_id,
                    'latest_relevant_event_at', seal_row.event_at
                  )
                )
            )) AS payload
          FROM public.household_chore_participant_values AS value_row
          JOIN public.household_chore_participants AS participant_row
            ON participant_row.circle_id = value_row.circle_id
           AND participant_row.id = value_row.participant_id
          LEFT JOIN LATERAL (
            SELECT completed_row.*
            FROM public.household_chore_assignments AS completed_row
            WHERE completed_row.circle_id = p_circle_id
              AND completed_row.definition_id = definition_row.id
              AND completed_row.status = 'completed'
              AND (
                definition_row.completion_scope = 'global'
                OR completed_row.participant_id = participant_row.id
              )
            ORDER BY completed_row.performed_on DESC,
              completed_row.completed_at DESC, completed_row.id DESC
            LIMIT 1
          ) AS latest_row ON true
          LEFT JOIN LATERAL (
            SELECT open_assignment.id, open_assignment.version
            FROM public.household_chore_assignments AS open_assignment
            WHERE open_assignment.circle_id = p_circle_id
              AND open_assignment.definition_id = definition_row.id
              AND open_assignment.participant_id = participant_row.id
              AND open_assignment.status = 'open'
            ORDER BY open_assignment.created_at, open_assignment.id
            LIMIT 1
          ) AS open_row ON true
          LEFT JOIN LATERAL public.household_chore_private_latest_priority_event(
            p_circle_id, definition_row.id, participant_row.id,
            definition_row.completion_scope
          ) AS seal_row ON true
          CROSS JOIN LATERAL (
            SELECT COALESCE(
              latest_row.performed_on,
              CASE WHEN definition_row.completion_scope = 'per_participant'
                THEN GREATEST(
                  (definition_row.created_at AT TIME ZONE 'Atlantic/Reykjavik')::date,
                  (value_row.created_at AT TIME ZONE 'Atlantic/Reykjavik')::date
                )
                ELSE (
                  definition_row.created_at AT TIME ZONE 'Atlantic/Reykjavik'
                )::date END
            ) AS baseline_on
          ) AS baseline
          CROSS JOIN LATERAL (
            SELECT baseline.baseline_on,
              CASE WHEN definition_row.cadence_days IS NULL THEN NULL
                ELSE baseline.baseline_on + definition_row.cadence_days END AS due_on
          ) AS calculated
          WHERE value_row.circle_id = p_circle_id
            AND value_row.definition_id = definition_row.id
            AND value_row.status = 'active'
            AND participant_row.status = 'active'
            AND (
              participant_row.linked_user_id IS NULL
              OR EXISTS (
                SELECT 1
                FROM public.household_chore_memberships AS linked_membership
                WHERE linked_membership.circle_id = p_circle_id
                  AND linked_membership.participant_id = participant_row.id
                  AND linked_membership.user_id = participant_row.linked_user_id
                  AND linked_membership.status = 'active'
              )
            )
          ORDER BY sort_label, participant_row.id
          LIMIT 100
        ) AS state_item
      ) AS state_rollup ON true
      LEFT JOIN LATERAL (
        SELECT completed_row.participant_id,
          completed_row.participant_label_snapshot,
          completed_row.participant_identity_marker,
          completed_row.performed_on,
          completed_row.completed_at
        FROM public.household_chore_assignments AS completed_row
        WHERE completed_row.circle_id = p_circle_id
          AND completed_row.definition_id = definition_row.id
          AND completed_row.status = 'completed'
        ORDER BY completed_row.performed_on DESC,
          completed_row.completed_at DESC, completed_row.id DESC
        LIMIT 1
      ) AS global_latest ON true
      LEFT JOIN LATERAL (
        SELECT
          pg_catalog.count(*)::integer AS total_count,
          pg_catalog.jsonb_agg(
            open_item.payload ORDER BY open_item.created_at,
              open_item.assignment_id
          ) FILTER (WHERE open_item.ordinal <= 20) AS items
        FROM (
          SELECT assignment_row.id AS assignment_id,
            assignment_row.created_at,
            pg_catalog.row_number() OVER (
              ORDER BY assignment_row.created_at, assignment_row.id
            ) AS ordinal,
            pg_catalog.jsonb_build_object(
              'assignment_id', assignment_row.id,
              'participant_id', assignment_row.participant_id,
              'participant_label', assignment_row.participant_label_snapshot,
              'version', assignment_row.version::text,
              'created_at', assignment_row.created_at
            ) AS payload
          FROM public.household_chore_assignments AS assignment_row
          WHERE assignment_row.circle_id = p_circle_id
            AND assignment_row.definition_id = definition_row.id
            AND assignment_row.status = 'open'
        ) AS open_item
      ) AS open_rollup ON true
      WHERE definition_row.circle_id = p_circle_id
        AND definition_row.status = 'active'
      ORDER BY null_cadence, state_rollup.priority_due_on,
        sort_title, definition_row.id
      LIMIT 200
    ) AS item;

    RETURN public.household_chore_private_read_result(
      true, 'get_priority_dashboard_v2_loaded',
      pg_catalog.jsonb_build_object(
        'viewer_type', 'member',
        'own_participant_id', v_membership.participant_id,
        'server_today', v_today,
        'next_day_boundary_at', v_next_boundary,
        'participants', v_participants,
        'definitions', v_definitions
      )
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      child_item.payload ORDER BY child_item.null_cadence,
        child_item.due_on, child_item.sort_title, child_item.definition_id
    ),
    '[]'::jsonb
  ) INTO v_definitions
  FROM (
    SELECT
      definition_row.id AS definition_id,
      pg_catalog.lower(definition_row.title) AS sort_title,
      definition_row.cadence_days IS NULL AS null_cadence,
      calculated.due_on,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'definition_id', definition_row.id,
        'title', definition_row.title,
        'description', definition_row.description,
        'materials', definition_row.materials,
        'cadence_days', definition_row.cadence_days,
        'completion_scope', definition_row.completion_scope,
        'priority_due_on', calculated.due_on,
        'priority_due_at', CASE WHEN calculated.due_on IS NULL THEN NULL
          ELSE calculated.due_on::timestamp
            AT TIME ZONE 'Atlantic/Reykjavik' END,
        'own_state', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'participant_id', participant_row.id,
          'label', participant_row.display_name_snapshot,
          'points', value_row.points,
          'baseline_on', CASE WHEN latest_row.participant_id = participant_row.id
            THEN calculated.baseline_on ELSE NULL END,
          'due_on', calculated.due_on,
          'is_remaining', definition_row.cadence_days IS NOT NULL
            AND calculated.due_on <= v_today,
          'latest_completion_id', CASE
            WHEN latest_row.participant_id = participant_row.id
              THEN latest_row.id ELSE NULL END,
          'latest_performed_on', CASE
            WHEN latest_row.participant_id = participant_row.id
              THEN latest_row.performed_on ELSE NULL END,
          'recorded_at', CASE
            WHEN latest_row.participant_id = participant_row.id
              THEN latest_row.completed_at ELSE NULL END,
          'oldest_open_assignment_id', open_row.id,
          'oldest_open_assignment_version', open_row.version::text,
          -- Legacy rollout fields. For global work by another participant,
          -- baseline/due are sufficient but the other person's completion is hidden.
          'baseline_at', calculated.baseline_on::timestamp
            AT TIME ZONE 'Atlantic/Reykjavik',
          'due_at', CASE WHEN calculated.due_on IS NULL THEN NULL
            ELSE calculated.due_on::timestamp
              AT TIME ZONE 'Atlantic/Reykjavik' END,
          'latest_completed_at', CASE
            WHEN latest_row.participant_id = participant_row.id
              THEN latest_row.completed_at ELSE NULL END,
          'expected_state_token',
            public.household_chore_private_priority_token(
              pg_catalog.jsonb_build_object(
                'scope', definition_row.completion_scope,
                'definition_version', definition_row.version::text,
                'value_version', value_row.version::text,
                'effective_assignment_id', latest_row.id,
                'effective_assignment_version', latest_row.version,
                'effective_completion_sequence', latest_row.completion_sequence,
                'effective_performed_on', latest_row.performed_on,
                'effective_completed_at', latest_row.completed_at,
                'oldest_open_assignment_id', open_row.id,
                'oldest_open_assignment_version', open_row.version,
                'latest_relevant_event_id', seal_row.event_id,
                'latest_relevant_event_at', seal_row.event_at
              )
            )
        ))
      )) AS payload
    FROM public.household_chore_definitions AS definition_row
    JOIN public.household_chore_participant_values AS value_row
      ON value_row.circle_id = definition_row.circle_id
     AND value_row.definition_id = definition_row.id
     AND value_row.participant_id = v_membership.participant_id
     AND value_row.status = 'active'
    JOIN public.household_chore_participants AS participant_row
      ON participant_row.circle_id = value_row.circle_id
     AND participant_row.id = value_row.participant_id
     AND participant_row.status = 'active'
     AND participant_row.linked_user_id = p_actor_id
    LEFT JOIN LATERAL (
      SELECT completed_row.*
      FROM public.household_chore_assignments AS completed_row
      WHERE completed_row.circle_id = p_circle_id
        AND completed_row.definition_id = definition_row.id
        AND completed_row.status = 'completed'
        AND (
          definition_row.completion_scope = 'global'
          OR completed_row.participant_id = participant_row.id
        )
      ORDER BY completed_row.performed_on DESC,
        completed_row.completed_at DESC, completed_row.id DESC
      LIMIT 1
    ) AS latest_row ON true
    LEFT JOIN LATERAL (
      SELECT open_assignment.id, open_assignment.version
      FROM public.household_chore_assignments AS open_assignment
      WHERE open_assignment.circle_id = p_circle_id
        AND open_assignment.definition_id = definition_row.id
        AND open_assignment.participant_id = participant_row.id
        AND open_assignment.status = 'open'
      ORDER BY open_assignment.created_at, open_assignment.id
      LIMIT 1
    ) AS open_row ON true
    LEFT JOIN LATERAL public.household_chore_private_latest_priority_event(
      p_circle_id, definition_row.id, participant_row.id,
      definition_row.completion_scope
    ) AS seal_row ON true
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        latest_row.performed_on,
        CASE WHEN definition_row.completion_scope = 'per_participant'
          THEN GREATEST(
            (definition_row.created_at AT TIME ZONE 'Atlantic/Reykjavik')::date,
            (value_row.created_at AT TIME ZONE 'Atlantic/Reykjavik')::date
          )
          ELSE (
            definition_row.created_at AT TIME ZONE 'Atlantic/Reykjavik'
          )::date END
      ) AS baseline_on
    ) AS baseline
    CROSS JOIN LATERAL (
      SELECT baseline.baseline_on,
        CASE WHEN definition_row.cadence_days IS NULL THEN NULL
          ELSE baseline.baseline_on + definition_row.cadence_days END AS due_on
    ) AS calculated
    WHERE definition_row.circle_id = p_circle_id
      AND definition_row.status = 'active'
    ORDER BY null_cadence, due_on, sort_title, definition_row.id
    LIMIT 200
  ) AS child_item;

  RETURN public.household_chore_private_read_result(
    true, 'get_priority_dashboard_v2_loaded',
    pg_catalog.jsonb_build_object(
      'viewer_type', 'child',
      'own_participant_id', v_membership.participant_id,
      'server_today', v_today,
      'next_day_boundary_at', v_next_boundary,
      'definitions', v_definitions
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_priority_dashboard(
  p_actor_id uuid,
  p_circle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rich jsonb;
  v_definitions jsonb;
  v_viewer_type text;
BEGIN
  v_rich := public.household_chore_get_priority_dashboard_v2(
    p_actor_id, p_circle_id
  );
  IF v_rich->>'ok' <> 'true' THEN RETURN v_rich; END IF;
  v_viewer_type := v_rich#>>'{data,viewer_type}';

  IF v_viewer_type = 'member' THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'definition_id', definition_item.value->'definition_id',
        'title', definition_item.value->'title',
        'description', definition_item.value->'description',
        'materials', definition_item.value->'materials',
        'version', definition_item.value->'version',
        'cadence_days', definition_item.value->'cadence_days',
        'completion_scope', definition_item.value->'completion_scope',
        'priority_due_at', definition_item.value->'priority_due_at',
        'participant_states', (
          SELECT COALESCE(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
              'participant_id', state_item.value->'participant_id',
              'label', state_item.value->'label',
              'identity_marker', state_item.value->'identity_marker',
              'points', state_item.value->'points',
              'value_version', state_item.value->'value_version',
              'baseline_at', state_item.value->'baseline_at',
              'due_at', state_item.value->'due_at',
              'latest_completion_id', state_item.value->'latest_completion_id',
              'latest_completed_at', state_item.value->'latest_completed_at',
              'oldest_open_assignment_id',
                state_item.value->'oldest_open_assignment_id',
              'oldest_open_assignment_version',
                state_item.value->'oldest_open_assignment_version',
              'expected_state_token', state_item.value->'expected_state_token'
            )) ORDER BY state_item.ordinal
          ), '[]'::jsonb)
          FROM pg_catalog.jsonb_array_elements(
            COALESCE(definition_item.value->'participant_states', '[]'::jsonb)
          ) WITH ORDINALITY AS state_item(value, ordinal)
        ),
        'open_assignments', (
          SELECT COALESCE(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
              'assignment_id', open_item.value->'assignment_id',
              'participant_id', open_item.value->'participant_id',
              'participant_label', open_item.value->'participant_label',
              'version', open_item.value->'version',
              'created_at', open_item.value->'created_at'
            )) ORDER BY open_item.ordinal
          ), '[]'::jsonb)
          FROM pg_catalog.jsonb_array_elements(
            COALESCE(definition_item.value->'open_assignments', '[]'::jsonb)
          ) WITH ORDINALITY AS open_item(value, ordinal)
        ),
        'open_assignment_count', definition_item.value->'open_assignment_count'
      )) ORDER BY definition_item.ordinal
    ), '[]'::jsonb) INTO v_definitions
    FROM pg_catalog.jsonb_array_elements(
      COALESCE(v_rich#>'{data,definitions}', '[]'::jsonb)
    ) WITH ORDINALITY AS definition_item(value, ordinal);

    RETURN public.household_chore_private_read_result(
      true, 'get_priority_dashboard_loaded',
      pg_catalog.jsonb_build_object(
        'viewer_type', 'member',
        'own_participant_id', v_rich#>'{data,own_participant_id}',
        'participants', v_rich#>'{data,participants}',
        'definitions', v_definitions
      )
    );
  END IF;

  IF v_viewer_type <> 'child' THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'definition_id', definition_item.value->'definition_id',
      'title', definition_item.value->'title',
      'description', definition_item.value->'description',
      'materials', definition_item.value->'materials',
      'cadence_days', definition_item.value->'cadence_days',
      'completion_scope', definition_item.value->'completion_scope',
      'own_state', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'participant_id', definition_item.value#>'{own_state,participant_id}',
        'label', definition_item.value#>'{own_state,label}',
        'points', definition_item.value#>'{own_state,points}',
        'baseline_at', definition_item.value#>'{own_state,baseline_at}',
        'due_at', definition_item.value#>'{own_state,due_at}',
        'latest_completed_at',
          definition_item.value#>'{own_state,latest_completed_at}',
        'oldest_open_assignment_id',
          definition_item.value#>'{own_state,oldest_open_assignment_id}',
        'oldest_open_assignment_version',
          definition_item.value#>'{own_state,oldest_open_assignment_version}',
        'expected_state_token',
          definition_item.value#>'{own_state,expected_state_token}'
      ))
    )) ORDER BY definition_item.ordinal
  ), '[]'::jsonb) INTO v_definitions
  FROM pg_catalog.jsonb_array_elements(
    COALESCE(v_rich#>'{data,definitions}', '[]'::jsonb)
  ) WITH ORDINALITY AS definition_item(value, ordinal);

  RETURN public.household_chore_private_read_result(
    true, 'get_priority_dashboard_loaded',
    pg_catalog.jsonb_build_object(
      'viewer_type', 'child',
      'own_participant_id', v_rich#>'{data,own_participant_id}',
      'definitions', v_definitions
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_history_page_v2(
  p_actor_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_assignment_id uuid,
  p_include_created boolean,
  p_cursor_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_membership public.household_chore_memberships%ROWTYPE;
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_circle_id IS NULL
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
     OR ((p_cursor_at IS NULL) <> (p_cursor_id IS NULL))
     OR NOT public.household_chore_private_actor_ready(p_actor_id) THEN
    RETURN NULL;
  END IF;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active';
  IF NOT FOUND THEN RETURN NULL; END IF;

  WITH page_rows AS (
    SELECT event_row.*,
      assignment_row.title_snapshot AS assignment_title,
      participant_row.linked_user_id AS participant_user_id
    FROM public.household_chore_assignment_events AS event_row
    JOIN public.household_chore_assignments AS assignment_row
      ON assignment_row.circle_id = event_row.circle_id
     AND assignment_row.id = event_row.assignment_id
    JOIN public.household_chore_participants AS participant_row
      ON participant_row.circle_id = event_row.circle_id
     AND participant_row.id = event_row.participant_id
    WHERE event_row.circle_id = p_circle_id
      AND (p_definition_id IS NULL OR event_row.definition_id = p_definition_id)
      AND (p_assignment_id IS NULL OR event_row.assignment_id = p_assignment_id)
      AND (p_include_created OR event_row.event_type <> 'created')
      AND (
        v_membership.membership_type = 'member'
        OR (
          event_row.participant_id = v_membership.participant_id
          AND participant_row.linked_user_id = p_actor_id
        )
      )
      AND (
        p_cursor_at IS NULL
        OR (event_row.occurred_at, event_row.id) < (p_cursor_at, p_cursor_id)
      )
    ORDER BY event_row.occurred_at DESC, event_row.id DESC
    LIMIT p_limit + 1
  ), visible AS (
    SELECT page_rows.*
    FROM page_rows
    ORDER BY page_rows.occurred_at DESC, page_rows.id DESC
    LIMIT p_limit
  )
  SELECT
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'event_id', visible.id,
        'assignment_id', visible.assignment_id,
        'title', visible.assignment_title,
        'event_type', visible.event_type,
        'occurred_at', visible.occurred_at,
        'participant_label', visible.participant_label_snapshot,
        'participant_identity_marker', visible.participant_identity_marker,
        'assignment_origin', visible.assignment_origin,
        'snapshot_points', visible.snapshot_points,
        'status_after', visible.status_after,
        'actor_kind', CASE
          WHEN visible.actor_identity_marker = 'system' THEN 'system'
          WHEN visible.actor_identity_marker = 'former_member' THEN 'former_member'
          WHEN visible.actor_user_id = visible.participant_user_id THEN 'participant'
          ELSE 'member'
        END,
        'actor_label', visible.actor_label_snapshot,
        'completion_sequence', visible.completion_sequence,
        'performed_on', visible.performed_on,
        'previous_performed_on', visible.previous_performed_on,
        'reversed_performed_on', visible.reversed_performed_on,
        'recorded_at', CASE
          WHEN visible.event_type IN ('completed', 'recompleted')
            THEN visible.occurred_at ELSE NULL END,
        'points_delta', visible.points_delta,
        'cancellation_reason', visible.cancellation_reason,
        'reopen_outcome', visible.reopen_outcome
      )) ORDER BY visible.occurred_at DESC, visible.id DESC
    ), '[]'::jsonb),
    (SELECT pg_catalog.count(*) > p_limit FROM page_rows),
    CASE WHEN (SELECT pg_catalog.count(*) > p_limit FROM page_rows)
      THEN (
        SELECT pg_catalog.jsonb_build_object(
          'occurred_at', last_row.occurred_at,
          'event_id', last_row.id
        )
        FROM visible AS last_row
        ORDER BY last_row.occurred_at, last_row.id
        LIMIT 1
      ) ELSE NULL END
  INTO v_items, v_has_more, v_next_cursor
  FROM visible;

  RETURN pg_catalog.jsonb_build_object(
    'items', v_items,
    'next_cursor', v_next_cursor,
    'has_more', COALESCE(v_has_more, false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_definition_history_v2(
  p_actor_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_cursor_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_page jsonb;
BEGIN
  IF p_definition_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_definitions AS definition_row
    WHERE definition_row.circle_id = p_circle_id
      AND definition_row.id = p_definition_id
  ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  v_page := public.household_chore_private_history_page_v2(
    p_actor_id, p_circle_id, p_definition_id, NULL, false,
    p_cursor_at, p_cursor_id, p_limit
  );
  IF v_page IS NULL THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  RETURN public.household_chore_private_read_result(
    true, 'get_definition_history_v2_loaded', v_page
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_assignment_timeline_v2(
  p_actor_id uuid,
  p_circle_id uuid,
  p_assignment_id uuid,
  p_cursor_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_page jsonb;
BEGIN
  IF p_assignment_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.circle_id = p_circle_id
      AND assignment_row.id = p_assignment_id
  ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  v_page := public.household_chore_private_history_page_v2(
    p_actor_id, p_circle_id, NULL, p_assignment_id, true,
    p_cursor_at, p_cursor_id, p_limit
  );
  IF v_page IS NULL THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  RETURN public.household_chore_private_read_result(
    true, 'get_assignment_timeline_v2_loaded', v_page
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_assignment_v2(
  p_actor_id uuid,
  p_circle_id uuid,
  p_assignment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_membership public.household_chore_memberships%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_assignment_payload jsonb;
  v_timeline jsonb;
  v_is_own boolean;
  v_is_latest_effective boolean := false;
BEGIN
  IF p_actor_id IS NULL OR p_circle_id IS NULL OR p_assignment_id IS NULL
     OR NOT public.household_chore_private_actor_ready(p_actor_id) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  JOIN public.household_chore_participants AS own_participant
    ON own_participant.circle_id = membership_row.circle_id
   AND own_participant.id = membership_row.participant_id
   AND own_participant.linked_user_id = membership_row.user_id
   AND own_participant.status = 'active'
   AND own_participant.identity_marker = 'current'
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active';
  IF NOT FOUND THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT assignment_row.* INTO v_assignment
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_assignment_id;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  v_is_own := v_assignment.participant_id = v_membership.participant_id;
  IF v_membership.membership_type = 'child' AND NOT v_is_own THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = v_assignment.definition_id;
  IF v_assignment.status = 'completed' AND v_is_own THEN
    SELECT effective_row.id = v_assignment.id INTO v_is_latest_effective
    FROM public.household_chore_assignments AS effective_row
    WHERE effective_row.circle_id = p_circle_id
      AND effective_row.definition_id = v_assignment.definition_id
      AND effective_row.status = 'completed'
      AND (
        v_definition.completion_scope = 'global'
        OR effective_row.participant_id = v_assignment.participant_id
      )
    ORDER BY effective_row.performed_on DESC,
      effective_row.completed_at DESC, effective_row.id DESC
    LIMIT 1;
  END IF;

  v_timeline := public.household_chore_private_history_page_v2(
    p_actor_id, p_circle_id, NULL, p_assignment_id, true,
    NULL, NULL, 20
  );
  IF v_membership.membership_type = 'member' THEN
    v_assignment_payload := pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'assignment_id', v_assignment.id,
        'circle_id', v_assignment.circle_id,
        'definition_id', v_assignment.definition_id,
        'participant_id', v_assignment.participant_id,
        'title', v_assignment.title_snapshot,
        'description', v_assignment.description_snapshot,
        'materials', v_assignment.materials_snapshot,
        'participant_label', v_assignment.participant_label_snapshot,
        'participant_identity_marker', v_assignment.participant_identity_marker,
        'points', v_assignment.points_snapshot,
        'origin', v_assignment.origin,
        'status', v_assignment.status,
        'completion_sequence', v_assignment.completion_sequence,
        'version', v_assignment.version::text,
        'created_at', v_assignment.created_at,
        'performed_on', v_assignment.performed_on,
        'recorded_at', v_assignment.completed_at,
        'completed_at', v_assignment.completed_at,
        'cancelled_at', v_assignment.cancelled_at,
        'recorder_label', CASE WHEN v_assignment.completed_by_user_id IS NULL
          THEN NULL ELSE public.household_chore_private_safe_user_label(
            v_assignment.completed_by_user_id
          ) END,
        'can_correct_date', v_assignment.status = 'completed'
      )
    );
  ELSE
    v_assignment_payload := pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'assignment_id', v_assignment.id,
        'title', v_assignment.title_snapshot,
        'description', v_assignment.description_snapshot,
        'materials', v_assignment.materials_snapshot,
        'participant_label', v_assignment.participant_label_snapshot,
        'participant_identity_marker', v_assignment.participant_identity_marker,
        'points', v_assignment.points_snapshot,
        'origin', v_assignment.origin,
        'status', v_assignment.status,
        'created_at', v_assignment.created_at,
        'performed_on', v_assignment.performed_on,
        'recorded_at', v_assignment.completed_at,
        'completed_at', v_assignment.completed_at,
        'cancelled_at', v_assignment.cancelled_at,
        'own_assignment', true,
        'completion_sequence', CASE
          WHEN v_is_latest_effective THEN v_assignment.completion_sequence
          ELSE NULL END,
        'version', CASE
          WHEN v_assignment.status = 'open' OR v_is_latest_effective
            THEN v_assignment.version::text ELSE NULL END,
        'can_complete', v_assignment.status = 'open',
        'can_cancel', v_assignment.status = 'open',
        'can_correct_date', v_is_latest_effective
      )
    );
  END IF;

  RETURN public.household_chore_private_read_result(
    true, 'get_assignment_v2_loaded',
    pg_catalog.jsonb_build_object(
      'viewer_type', v_membership.membership_type,
      'assignment', v_assignment_payload,
      'timeline', COALESCE(v_timeline, pg_catalog.jsonb_build_object(
        'items', '[]'::jsonb, 'next_cursor', NULL, 'has_more', false
      ))
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_definition_detail_v3(
  p_actor_id uuid,
  p_circle_id uuid,
  p_definition_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_dashboard jsonb;
  v_definition jsonb;
  v_history jsonb;
BEGIN
  IF p_definition_id IS NULL THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  v_dashboard := public.household_chore_get_priority_dashboard_v2(
    p_actor_id, p_circle_id
  );
  IF v_dashboard->>'ok' <> 'true' THEN RETURN v_dashboard; END IF;
  SELECT item.value INTO v_definition
  FROM pg_catalog.jsonb_array_elements(
    COALESCE(v_dashboard#>'{data,definitions}', '[]'::jsonb)
  ) AS item(value)
  WHERE item.value->>'definition_id' = p_definition_id::text
  LIMIT 1;
  IF v_definition IS NULL THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  v_history := public.household_chore_private_history_page_v2(
    p_actor_id, p_circle_id, p_definition_id, NULL, false,
    NULL, NULL, 20
  );
  RETURN public.household_chore_private_read_result(
    true, 'get_definition_detail_v3_loaded',
    pg_catalog.jsonb_build_object(
      'viewer_type', v_dashboard#>>'{data,viewer_type}',
      'server_today', v_dashboard#>>'{data,server_today}',
      'definition', v_definition,
      'history', COALESCE(v_history, pg_catalog.jsonb_build_object(
        'items', '[]'::jsonb, 'next_cursor', NULL, 'has_more', false
      ))
    )
  );
END;
$function$;

COMMENT ON COLUMN public.household_chore_assignments.performed_on IS
  'Calendar date when work was performed; V1 authority uses Atlantic/Reykjavik.';
COMMENT ON COLUMN public.household_chore_assignment_events.performed_on IS
  'Immutable performed date for completion/correction audit events.';
COMMENT ON COLUMN public.household_chore_assignment_events.previous_performed_on IS
  'Previous performed date for completion_date_corrected events.';
COMMENT ON COLUMN public.household_chore_assignment_events.reversed_performed_on IS
  'Performed date removed by a completion_reversed event.';

REVOKE ALL ON FUNCTION public.household_chore_private_performed_date_guard()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.household_chore_private_event_date_guard()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.household_chore_private_performed_on_valid(text, date)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.household_chore_private_latest_priority_event(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.household_chore_private_complete_locked_assignment_v2(
  uuid, public.household_chore_assignments, date
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.household_chore_private_complete_definition_core_v2(
  uuid, uuid, uuid, uuid, uuid, text, date, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.household_chore_private_history_page_v2(
  uuid, uuid, uuid, uuid, boolean, timestamptz, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.household_chore_get_priority_dashboard(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_get_priority_dashboard_v2(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_complete_definition(
  uuid, uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_complete_definition_v2(
  uuid, uuid, uuid, uuid, uuid, text, date
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_complete_assignment_v2(
  uuid, uuid, uuid, uuid, bigint, date
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_correct_completion_date(
  uuid, uuid, uuid, uuid, bigint, integer, date
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_get_definition_history_v2(
  uuid, uuid, uuid, timestamptz, uuid, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_get_assignment_timeline_v2(
  uuid, uuid, uuid, timestamptz, uuid, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_get_assignment_v2(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_get_definition_detail_v3(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.household_chore_get_priority_dashboard(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_priority_dashboard_v2(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_complete_definition(
  uuid, uuid, uuid, uuid, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_complete_definition_v2(
  uuid, uuid, uuid, uuid, uuid, text, date
) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_complete_assignment_v2(
  uuid, uuid, uuid, uuid, bigint, date
) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_correct_completion_date(
  uuid, uuid, uuid, uuid, bigint, integer, date
) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_definition_history_v2(
  uuid, uuid, uuid, timestamptz, uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_assignment_timeline_v2(
  uuid, uuid, uuid, timestamptz, uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_assignment_v2(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_definition_detail_v3(
  uuid, uuid, uuid
) TO service_role;

COMMIT;

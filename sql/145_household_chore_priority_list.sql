-- Household chores: recurring priority semantics and atomic quick completion.
-- Additive migration. Run validation/145.../preflight.sql first.
BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('teskeid:household-chores:sql145', 0)
);

DO $preconditions$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'household_chore_sql145_executor_invalid';
  END IF;
  IF pg_catalog.to_regclass('public.household_chore_definitions') IS NULL
     OR pg_catalog.to_regclass('public.household_chore_assignments') IS NULL
     OR pg_catalog.to_regclass('public.household_chore_assignment_events') IS NULL
     OR pg_catalog.to_regclass('public.household_chore_participant_values') IS NULL THEN
    RAISE EXCEPTION 'household_chore_sql145_foundation_missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.household_chore_definitions'::pg_catalog.regclass
      AND attname IN ('cadence_days', 'completion_scope')
      AND attnum > 0 AND NOT attisdropped
  ) OR pg_catalog.to_regprocedure(
    'public.household_chore_get_priority_dashboard(uuid,uuid)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'household_chore_sql145_target_collision';
  END IF;
END;
$preconditions$;

ALTER TABLE public.household_chore_definitions
  ADD COLUMN cadence_days integer NULL,
  ADD COLUMN completion_scope text NOT NULL DEFAULT 'global',
  ADD CONSTRAINT household_chore_definitions_cadence_days_check
    CHECK (cadence_days IS NULL OR cadence_days BETWEEN 1 AND 3650),
  ADD CONSTRAINT household_chore_definitions_completion_scope_check
    CHECK (completion_scope IN ('global', 'per_participant'));

ALTER TABLE public.household_chore_assignments
  DROP CONSTRAINT household_chore_assignments_origin_check,
  ADD CONSTRAINT household_chore_assignments_origin_check CHECK (
    (origin IN ('member_assigned', 'self_assigned', 'quick_completed')
      AND repeated_from_assignment_id IS NULL)
    OR (origin = 'member_repeated'
      AND repeated_from_assignment_id IS NOT NULL)
  );

ALTER TABLE public.household_chore_assignment_events
  DROP CONSTRAINT household_chore_events_origin_check,
  ADD CONSTRAINT household_chore_events_origin_check CHECK (
    assignment_origin IN (
      'member_assigned', 'self_assigned', 'member_repeated', 'quick_completed'
    )
  );

CREATE INDEX household_chore_assignments_completed_definition_idx
  ON public.household_chore_assignments
  (circle_id, definition_id, completed_at DESC, id DESC)
  WHERE status = 'completed';

CREATE INDEX household_chore_assignments_completed_participant_idx
  ON public.household_chore_assignments
  (circle_id, definition_id, participant_id, completed_at DESC, id DESC)
  WHERE status = 'completed';

CREATE INDEX household_chore_assignments_definition_participant_open_idx
  ON public.household_chore_assignments
  (circle_id, definition_id, participant_id, created_at, id)
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.household_chore_private_priority_token(
  p_state jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.encode(
    public.household_chore_private_fingerprint(p_state),
    'hex'
  );
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_definition_detail_v2(
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
  v_definition public.household_chore_definitions%ROWTYPE;
  v_participant_values jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_circle_id IS NULL OR p_definition_id IS NULL
     OR NOT public.household_chore_private_actor_ready(p_actor_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.household_chore_memberships AS membership_row
       WHERE membership_row.circle_id = p_circle_id
         AND membership_row.user_id = p_actor_id
         AND membership_row.status = 'active'
         AND membership_row.membership_type = 'member'
     ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = p_definition_id;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(item.payload ORDER BY item.sort_label, item.participant_id),
    '[]'::jsonb
  ) INTO v_participant_values
  FROM (
    SELECT
      participant_row.id AS participant_id,
      COALESCE(participant_row.display_name_snapshot, '') AS sort_label,
      pg_catalog.jsonb_build_object(
        'participant_id', participant_row.id,
        'label', participant_row.display_name_snapshot,
        'identity_marker', participant_row.identity_marker,
        'participant_status', participant_row.status,
        'participant_version', participant_row.version::text,
        'value_status', CASE WHEN value_row.id IS NULL THEN 'missing'
          ELSE value_row.status END,
        'value_version', CASE WHEN value_row.id IS NULL THEN '0'
          ELSE value_row.version::text END,
        'points', value_row.points
      ) AS payload
    FROM public.household_chore_participants AS participant_row
    LEFT JOIN public.household_chore_participant_values AS value_row
      ON value_row.circle_id = participant_row.circle_id
     AND value_row.definition_id = p_definition_id
     AND value_row.participant_id = participant_row.id
    WHERE participant_row.circle_id = p_circle_id
    ORDER BY sort_label, participant_row.id
    LIMIT 100
  ) AS item;

  RETURN public.household_chore_private_read_result(
    true,
    'get_definition_detail_v2_loaded',
    pg_catalog.jsonb_build_object(
      'definition', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'definition_id', v_definition.id,
        'title', v_definition.title,
        'description', v_definition.description,
        'materials', v_definition.materials,
        'status', v_definition.status,
        'version', v_definition.version::text,
        'cadence_days', v_definition.cadence_days,
        'completion_scope', v_definition.completion_scope
      )),
      'participant_values', v_participant_values
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
  v_membership public.household_chore_memberships%ROWTYPE;
  v_participants jsonb;
  v_definitions jsonb;
BEGIN
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
      pg_catalog.jsonb_agg(item.payload ORDER BY item.sort_label, item.participant_id),
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
        item.payload ORDER BY item.null_cadence, item.priority_due,
          item.sort_title, item.definition_id
      ),
      '[]'::jsonb
    ) INTO v_definitions
    FROM (
      SELECT
        definition_row.id AS definition_id,
        pg_catalog.lower(definition_row.title) AS sort_title,
        (definition_row.cadence_days IS NULL) AS null_cadence,
        state_rollup.priority_due,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'definition_id', definition_row.id,
          'title', definition_row.title,
          'description', definition_row.description,
          'materials', definition_row.materials,
          'version', definition_row.version::text,
          'cadence_days', definition_row.cadence_days,
          'completion_scope', definition_row.completion_scope,
          'priority_due_at', state_rollup.priority_due,
          'participant_states', COALESCE(state_rollup.states, '[]'::jsonb),
          'open_assignments', COALESCE(open_rollup.items, '[]'::jsonb),
          'open_assignment_count', COALESCE(open_rollup.total_count, 0)
        )) AS payload
      FROM public.household_chore_definitions AS definition_row
      LEFT JOIN LATERAL (
        SELECT
          pg_catalog.jsonb_agg(
            state_item.payload ORDER BY state_item.sort_label,
              state_item.participant_id
          ) AS states,
          pg_catalog.min(state_item.due_at) AS priority_due
        FROM (
          SELECT
            participant_row.id AS participant_id,
            COALESCE(participant_row.display_name_snapshot, '') AS sort_label,
            CASE
              WHEN definition_row.cadence_days IS NULL THEN NULL
              ELSE effective_state.baseline_at
                + definition_row.cadence_days * interval '1 day'
            END AS due_at,
            pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
              'participant_id', participant_row.id,
              'label', participant_row.display_name_snapshot,
              'identity_marker', participant_row.identity_marker,
              'points', value_row.points,
              'value_version', value_row.version::text,
              'baseline_at', effective_state.baseline_at,
              'due_at', CASE
                WHEN definition_row.cadence_days IS NULL THEN NULL
                ELSE effective_state.baseline_at
                  + definition_row.cadence_days * interval '1 day'
              END,
              'latest_completion_id', effective_state.assignment_id,
              'latest_completed_at', effective_state.completed_at,
              'oldest_open_assignment_id', open_row.id,
              'oldest_open_assignment_version', open_row.version::text,
              'expected_state_token',
                public.household_chore_private_priority_token(
                  pg_catalog.jsonb_build_object(
                    'scope', definition_row.completion_scope,
                    'definition_version', definition_row.version::text,
                    'value_version', value_row.version::text,
                    'effective_assignment_id', effective_state.assignment_id,
                    'effective_assignment_version', effective_state.assignment_version,
                    'effective_completion_sequence', effective_state.completion_sequence,
                    'effective_completed_at', effective_state.completed_at,
                    'oldest_open_assignment_id', open_row.id,
                    'oldest_open_assignment_version', open_row.version
                  )
                )
            )) AS payload
          FROM public.household_chore_participant_values AS value_row
          JOIN public.household_chore_participants AS participant_row
            ON participant_row.circle_id = value_row.circle_id
           AND participant_row.id = value_row.participant_id
          LEFT JOIN LATERAL (
            SELECT
              completed_row.id AS assignment_id,
              completed_row.version AS assignment_version,
              completed_row.completion_sequence,
              completed_row.completed_at,
              completed_row.completed_at AS baseline_at
            FROM public.household_chore_assignments AS completed_row
            WHERE completed_row.circle_id = p_circle_id
              AND completed_row.definition_id = definition_row.id
              AND completed_row.status = 'completed'
              AND (
                definition_row.completion_scope = 'global'
                OR completed_row.participant_id = participant_row.id
              )
            ORDER BY completed_row.completed_at DESC, completed_row.id DESC
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
          CROSS JOIN LATERAL (
            SELECT
              latest_row.assignment_id,
              latest_row.assignment_version,
              latest_row.completion_sequence,
              latest_row.completed_at,
              COALESCE(
                latest_row.completed_at,
                CASE
                  WHEN definition_row.completion_scope = 'per_participant'
                    THEN GREATEST(
                      definition_row.created_at, value_row.created_at
                    )
                  ELSE definition_row.created_at
                END
              ) AS baseline_at
          ) AS effective_state
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
        SELECT
          pg_catalog.count(*)::integer AS total_count,
          pg_catalog.jsonb_agg(
            open_item.payload ORDER BY open_item.created_at,
              open_item.assignment_id
          ) FILTER (WHERE open_item.ordinal <= 20) AS items
        FROM (
          SELECT
            assignment_row.id AS assignment_id,
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
      ORDER BY null_cadence, state_rollup.priority_due,
        sort_title, definition_row.id
      LIMIT 200
    ) AS item;

    RETURN public.household_chore_private_read_result(
      true,
      'get_priority_dashboard_loaded',
      pg_catalog.jsonb_build_object(
        'viewer_type', 'member',
        'own_participant_id', v_membership.participant_id,
        'participants', v_participants,
        'definitions', v_definitions
      )
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      child_item.payload ORDER BY child_item.null_cadence,
        child_item.due_at, child_item.sort_title, child_item.definition_id
    ),
    '[]'::jsonb
  ) INTO v_definitions
  FROM (
    SELECT
      definition_row.id AS definition_id,
      pg_catalog.lower(definition_row.title) AS sort_title,
      (definition_row.cadence_days IS NULL) AS null_cadence,
      CASE WHEN definition_row.cadence_days IS NULL THEN NULL
        ELSE effective_state.baseline_at
          + definition_row.cadence_days * interval '1 day' END AS due_at,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'definition_id', definition_row.id,
        'title', definition_row.title,
        'description', definition_row.description,
        'materials', definition_row.materials,
        'cadence_days', definition_row.cadence_days,
        'completion_scope', definition_row.completion_scope,
        'own_state', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'participant_id', participant_row.id,
          'label', participant_row.display_name_snapshot,
          'points', value_row.points,
          'baseline_at', effective_state.baseline_at,
          'due_at', CASE WHEN definition_row.cadence_days IS NULL THEN NULL
            ELSE effective_state.baseline_at
              + definition_row.cadence_days * interval '1 day' END,
          'latest_completed_at', effective_state.completed_at,
          'oldest_open_assignment_id', open_row.id,
          'oldest_open_assignment_version', open_row.version::text,
          'expected_state_token',
            public.household_chore_private_priority_token(
              pg_catalog.jsonb_build_object(
                'scope', definition_row.completion_scope,
                'definition_version', definition_row.version::text,
                'value_version', value_row.version::text,
                'effective_assignment_id', effective_state.assignment_id,
                'effective_assignment_version', effective_state.assignment_version,
                'effective_completion_sequence', effective_state.completion_sequence,
                'effective_completed_at', effective_state.completed_at,
                'oldest_open_assignment_id', open_row.id,
                'oldest_open_assignment_version', open_row.version
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
    LEFT JOIN LATERAL (
      SELECT
        completed_row.id AS assignment_id,
        completed_row.version AS assignment_version,
        completed_row.completion_sequence,
        completed_row.completed_at
      FROM public.household_chore_assignments AS completed_row
      WHERE completed_row.circle_id = p_circle_id
        AND completed_row.definition_id = definition_row.id
        AND completed_row.status = 'completed'
        AND (
          definition_row.completion_scope = 'global'
          OR completed_row.participant_id = participant_row.id
        )
      ORDER BY completed_row.completed_at DESC, completed_row.id DESC
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
    CROSS JOIN LATERAL (
      SELECT
        latest_row.assignment_id,
        latest_row.assignment_version,
        latest_row.completion_sequence,
        latest_row.completed_at,
        COALESCE(
          latest_row.completed_at,
          CASE WHEN definition_row.completion_scope = 'per_participant'
            THEN GREATEST(
              definition_row.created_at, value_row.created_at
            )
            ELSE definition_row.created_at END
        ) AS baseline_at
    ) AS effective_state
    WHERE definition_row.circle_id = p_circle_id
      AND definition_row.status = 'active'
    ORDER BY null_cadence, due_at, sort_title, definition_row.id
    LIMIT 200
  ) AS child_item;

  RETURN public.household_chore_private_read_result(
    true,
    'get_priority_dashboard_loaded',
    pg_catalog.jsonb_build_object(
      'viewer_type', 'child',
      'own_participant_id', v_membership.participant_id,
      'definitions', v_definitions
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_create_definition_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_title text,
  p_description text,
  p_materials text,
  p_cadence_days integer,
  p_completion_scope text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_title text := NULLIF(pg_catalog.btrim(p_title), '');
  v_description text := NULLIF(pg_catalog.btrim(p_description), '');
  v_materials text := NULLIF(pg_catalog.btrim(p_materials), '');
  v_scope text := NULLIF(pg_catalog.btrim(p_completion_scope), '');
  v_fingerprint bytea;
  v_started jsonb;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'title', v_title,
      'description', v_description, 'materials', v_materials,
      'cadence_days', p_cadence_days, 'completion_scope', v_scope
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'create_definition_v2', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_title IS NULL OR pg_catalog.char_length(v_title) > 120
     OR pg_catalog.char_length(COALESCE(v_description, '')) > 2000
     OR pg_catalog.char_length(COALESCE(v_materials, '')) > 4000
     OR p_cadence_days IS NULL
     OR p_cadence_days NOT BETWEEN 1 AND 3650
     OR v_scope IS NULL
     OR v_scope NOT IN ('global', 'per_participant') THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'not_available', p_request_id
      )
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_definitions AS definition_row
    WHERE definition_row.circle_id = p_circle_id
  ) >= 200 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'cap_reached', p_request_id)
    );
  END IF;
  INSERT INTO public.household_chore_definitions (
    circle_id, title, description, materials, cadence_days,
    completion_scope, created_by
  ) VALUES (
    p_circle_id, v_title, v_description, v_materials, p_cadence_days,
    v_scope, p_actor_id
  ) RETURNING * INTO v_definition;
  INSERT INTO public.household_chore_definition_events (
    circle_id, definition_id, actor_user_id, event_type
  ) VALUES (p_circle_id, v_definition.id, p_actor_id, 'created');
  v_result := public.household_chore_private_result(
    true, 'definition_created', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_definition.id,
      'version', v_definition.version::text,
      'status', v_definition.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_update_definition_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_expected_version bigint,
  p_title text,
  p_description text,
  p_materials text,
  p_cadence_days integer,
  p_completion_scope text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_title text := NULLIF(pg_catalog.btrim(p_title), '');
  v_description text := NULLIF(pg_catalog.btrim(p_description), '');
  v_materials text := NULLIF(pg_catalog.btrim(p_materials), '');
  v_scope text := NULLIF(pg_catalog.btrim(p_completion_scope), '');
  v_fingerprint bytea;
  v_started jsonb;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'definition_id', p_definition_id,
      'expected_version', p_expected_version, 'title', v_title,
      'description', v_description, 'materials', v_materials,
      'cadence_days', p_cadence_days, 'completion_scope', v_scope
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'update_definition_v2', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = p_definition_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_definition.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'stale_version', p_request_id
      )
    );
  END IF;
  IF v_definition.status <> 'active' OR v_title IS NULL
     OR pg_catalog.char_length(v_title) > 120
     OR pg_catalog.char_length(COALESCE(v_description, '')) > 2000
     OR pg_catalog.char_length(COALESCE(v_materials, '')) > 4000
     OR p_cadence_days IS NULL
     OR p_cadence_days NOT BETWEEN 1 AND 3650
     OR v_scope IS NULL
     OR v_scope NOT IN ('global', 'per_participant') THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'not_available', p_request_id
      )
    );
  END IF;
  UPDATE public.household_chore_definitions AS definition_row
  SET title = v_title,
      description = v_description,
      materials = v_materials,
      cadence_days = p_cadence_days,
      completion_scope = v_scope,
      version = definition_row.version + 1
  WHERE definition_row.id = p_definition_id
  RETURNING definition_row.* INTO v_definition;
  INSERT INTO public.household_chore_definition_events (
    circle_id, definition_id, actor_user_id, event_type
  ) VALUES (p_circle_id, p_definition_id, p_actor_id, 'updated');
  v_result := public.household_chore_private_result(
    true, 'definition_updated', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_definition.id,
      'version', v_definition.version::text,
      'status', v_definition.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_complete_locked_assignment(
  p_actor_id uuid,
  p_assignment public.household_chore_assignments
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
  IF p_assignment.status <> 'open' THEN
    RAISE EXCEPTION 'household_chore_quick_completion_assignment_not_open';
  END IF;
  v_event_type := CASE WHEN v_sequence = 1 THEN 'completed'
    ELSE 'recompleted' END;
  UPDATE public.household_chore_assignments AS assignment_row
  SET status = 'completed',
      completion_sequence = v_sequence,
      completed_by_user_id = p_actor_id,
      completed_at = pg_catalog.clock_timestamp(),
      cancelled_at = NULL,
      cancellation_reason = NULL,
      version = assignment_row.version + 1
  WHERE assignment_row.id = p_assignment.id
    AND assignment_row.circle_id = p_assignment.circle_id
    AND assignment_row.status = 'open'
    AND assignment_row.version = p_assignment.version
  RETURNING assignment_row.* INTO v_assignment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'household_chore_quick_completion_assignment_drift';
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
  v_membership public.household_chore_memberships%ROWTYPE;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_value public.household_chore_participant_values%ROWTYPE;
  v_effective public.household_chore_assignments%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_current_token text;
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
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
  IF p_expected_state_token IS NULL
     OR pg_catalog.char_length(p_expected_state_token) <> 64
     OR p_expected_state_token !~ '^[0-9a-f]{64}$' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'not_available', p_request_id
      )
    );
  END IF;

  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
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
  IF v_membership.membership_type = 'child'
     AND v_membership.participant_id IS DISTINCT FROM p_participant_id THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'not_allowed', p_request_id
      )
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
       SELECT 1 FROM public.household_chore_memberships AS target_membership
       WHERE target_membership.circle_id = p_circle_id
         AND target_membership.participant_id = v_participant.id
         AND target_membership.user_id = v_participant.linked_user_id
         AND target_membership.status = 'active'
     )) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'not_available', p_request_id
      )
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
  ORDER BY completed_row.completed_at DESC, completed_row.id DESC
  LIMIT 1
  FOR UPDATE;

  SELECT open_row.* INTO v_assignment
  FROM public.household_chore_assignments AS open_row
  WHERE open_row.circle_id = p_circle_id
    AND open_row.definition_id = p_definition_id
    AND open_row.participant_id = p_participant_id
    AND open_row.status = 'open'
  ORDER BY open_row.created_at, open_row.id
  LIMIT 1
  FOR UPDATE;

  v_current_token := public.household_chore_private_priority_token(
    pg_catalog.jsonb_build_object(
      'scope', v_definition.completion_scope,
      'definition_version', v_definition.version::text,
      'value_version', v_value.version::text,
      'effective_assignment_id', v_effective.id,
      'effective_assignment_version', v_effective.version,
      'effective_completion_sequence', v_effective.completion_sequence,
      'effective_completed_at', v_effective.completed_at,
      'oldest_open_assignment_id', v_assignment.id,
      'oldest_open_assignment_version', v_assignment.version
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
  v_assignment := public.household_chore_private_complete_locked_assignment(
    p_actor_id, v_assignment
  );

  v_result := public.household_chore_private_result(
    true, 'assignment_completed', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_assignment.id,
      'definition_id', v_assignment.definition_id,
      'participant_id', v_assignment.participant_id,
      'version', v_assignment.version::text,
      'status', v_assignment.status,
      'completion_sequence', v_assignment.completion_sequence::text,
      'points_delta', v_assignment.points_snapshot
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.household_chore_private_priority_token(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.household_chore_private_complete_locked_assignment(
  uuid, public.household_chore_assignments
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.household_chore_get_definition_detail_v2(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_get_priority_dashboard(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_create_definition_v2(
  uuid, uuid, uuid, text, text, text, integer, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_update_definition_v2(
  uuid, uuid, uuid, uuid, bigint, text, text, text, integer, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_complete_definition(
  uuid, uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.household_chore_get_definition_detail_v2(
  uuid, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_priority_dashboard(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_create_definition_v2(
  uuid, uuid, uuid, text, text, text, integer, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_update_definition_v2(
  uuid, uuid, uuid, uuid, bigint, text, text, text, integer, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_complete_definition(
  uuid, uuid, uuid, uuid, uuid, text
) TO service_role;

COMMIT;

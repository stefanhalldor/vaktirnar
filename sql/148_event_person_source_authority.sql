-- SQL148: Event-only, browse-only person-source authority.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('teskeid:sql148:event-person-source-authority', 148)
);

DO $sql148_preconditions$
DECLARE
  v_protected_exact boolean;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'sql148_postgresql_15_required';
  END IF;
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'sql148_executor_not_allowed:%', current_user;
  END IF;
  IF pg_catalog.to_regclass('public.teskeid_events') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_guests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_assert_actor(uuid)') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_attendance_safe_guest_label(text,text,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_uuid_from_text(text)') IS NULL THEN
    RAISE EXCEPTION 'sql148_prerequisites_missing';
  END IF;
  SELECT pg_catalog.count(procedure_row.oid) = 3
    AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'))
        = expected.expected_md5
      AND procedure_row.provolatile::text = expected.expected_volatility
      AND procedure_row.prosecdef
      AND pg_catalog.cardinality(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND owner_role.rolname = 'postgres'
    )
  INTO v_protected_exact
  FROM (VALUES
    ('public.teskeid_event_assert_actor(uuid)',
      '9dd7c34f6cc6c78131e7ebbb9a718ea4', 's'),
    ('public.teskeid_event_uuid_from_text(text)',
      '27229cbc71c621e5a8592265b07f874d', 'i'),
    ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)',
      '2377be525ed29f2d4bc26d453fa8cf51', 's')
  ) AS expected(signature, expected_md5, expected_volatility)
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner;
  IF v_protected_exact IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'sql148_protected_dependency_drift';
  END IF;
  IF pg_catalog.to_regprocedure(
       'public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_person_source_roster_v1(uuid,uuid)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'sql148_target_already_exists';
  END IF;
END;
$sql148_preconditions$;

CREATE FUNCTION public.teskeid_event_list_person_source_events_v1(
  p_actor_id uuid,
  p_before_sort_at timestamptz,
  p_before_event_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50
     OR ((p_before_sort_at IS NULL) <> (p_before_event_id IS NULL))
     OR (p_before_sort_at IS NOT NULL
       AND NOT pg_catalog.isfinite(p_before_sort_at)) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  WITH visible_candidates AS (
    SELECT
      event_row.id AS event_id,
      event_row.name,
      event_row.roster_revision,
      'owner'::text AS viewer_role,
      event_row.created_at AS visible_sort_at,
      0 AS role_priority
    FROM public.teskeid_events AS event_row
    WHERE event_row.owner_user_id = p_actor_id

    UNION ALL

    SELECT
      event_row.id AS event_id,
      event_row.name,
      event_row.roster_revision,
      'attendee'::text AS viewer_role,
      membership.accepted_at AS visible_sort_at,
      1 AS role_priority
    FROM public.teskeid_event_attendance_memberships AS membership
    JOIN public.teskeid_events AS event_row
      ON event_row.id = membership.event_id
    JOIN public.teskeid_event_guests AS self_guest
      ON self_guest.event_id = membership.event_id
     AND self_guest.id = membership.event_guest_id
     AND self_guest.status = 'active'
     AND self_guest.linked_user_id = p_actor_id
    WHERE membership.user_id = p_actor_id
  ), owner_precedence AS (
    SELECT DISTINCT ON (candidate.event_id)
      candidate.event_id,
      candidate.name,
      candidate.roster_revision,
      candidate.viewer_role,
      candidate.visible_sort_at
    FROM visible_candidates AS candidate
    ORDER BY candidate.event_id, candidate.role_priority
  ), bounded AS (
    SELECT
      candidate.event_id,
      candidate.name,
      candidate.roster_revision,
      candidate.viewer_role,
      candidate.visible_sort_at,
      1 + (
        SELECT pg_catalog.count(*)::integer
        FROM public.teskeid_event_guests AS active_guest
        WHERE active_guest.event_id = candidate.event_id
          AND active_guest.status = 'active'
      ) AS active_person_count
    FROM owner_precedence AS candidate
    WHERE p_before_sort_at IS NULL
       OR (candidate.visible_sort_at, candidate.event_id)
          < (p_before_sort_at, p_before_event_id)
    ORDER BY candidate.visible_sort_at DESC, candidate.event_id DESC
    LIMIT p_limit + 1
  ), numbered AS (
    SELECT
      bounded.*,
      pg_catalog.row_number() OVER (
        ORDER BY bounded.visible_sort_at DESC, bounded.event_id DESC
      ) AS row_number
    FROM bounded
  )
  SELECT pg_catalog.jsonb_build_object(
    'events', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'event_id', page_row.event_id,
          'name', page_row.name,
          'roster_revision', page_row.roster_revision,
          'viewer_role', page_row.viewer_role,
          'active_person_count', page_row.active_person_count
        ) ORDER BY page_row.visible_sort_at DESC, page_row.event_id DESC
      )
      FROM numbered AS page_row
      WHERE page_row.row_number <= p_limit
    ), '[]'::jsonb),
    'next_cursor', CASE WHEN EXISTS (
      SELECT 1 FROM numbered AS extra_row
      WHERE extra_row.row_number = p_limit + 1
    ) THEN (
      SELECT pg_catalog.jsonb_build_object(
        'before_sort_at', cursor_row.visible_sort_at,
        'before_event_id', cursor_row.event_id
      )
      FROM numbered AS cursor_row
      WHERE cursor_row.row_number = p_limit
    ) ELSE NULL END
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_person_source_roster_v1(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event public.teskeid_events%ROWTYPE;
  v_viewer_role text;
  v_people jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);

  SELECT event_row.*
  INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  IF v_event.owner_user_id = p_actor_id THEN
    v_viewer_role := 'owner';
  ELSIF EXISTS (
    SELECT 1
    FROM public.teskeid_event_attendance_memberships AS membership
    JOIN public.teskeid_event_guests AS self_guest
      ON self_guest.event_id = membership.event_id
     AND self_guest.id = membership.event_guest_id
     AND self_guest.status = 'active'
     AND self_guest.linked_user_id = p_actor_id
    WHERE membership.event_id = p_event_id
      AND membership.user_id = p_actor_id
  ) THEN
    v_viewer_role := 'attendee';
  ELSE
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  WITH source_people AS (
    SELECT
      public.teskeid_event_uuid_from_text(
        'teskeid-event-person-source-organizer:' || v_event.id::text
      ) AS person_ref,
      'organizer'::text AS participant_kind,
      'linked_user'::text AS owner_source_kind,
      'linked_user'::text AS attendee_source_kind,
      public.teskeid_event_attendance_safe_guest_label(
        'relationship', NULL, v_event.owner_user_id
      ) AS owner_display_name,
      public.teskeid_event_attendance_safe_guest_label(
        'relationship', NULL, v_event.owner_user_id
      ) AS attendee_display_name,
      (-1)::integer AS source_position,
      v_event.owner_user_id = p_actor_id AS is_self

    UNION ALL

    SELECT
      guest.id AS person_ref,
      'guest'::text AS participant_kind,
      CASE
        WHEN guest.linked_user_id IS NOT NULL THEN 'linked_user'
        WHEN guest.source_kind = 'manual_email' THEN 'manual_email'
        ELSE 'manual_name'
      END AS owner_source_kind,
      CASE
        WHEN guest.linked_user_id IS NOT NULL THEN 'linked_user'
        ELSE 'unlinked_guest'
      END AS attendee_source_kind,
      CASE WHEN guest.source_kind = 'manual_email'
             AND guest.linked_user_id IS NULL
        THEN NULL
        ELSE public.teskeid_event_attendance_safe_guest_label(
          CASE WHEN guest.linked_user_id IS NULL THEN 'manual_name'
               ELSE guest.source_kind END,
          guest.display_name_snapshot,
          guest.linked_user_id
        )
      END AS owner_display_name,
      public.teskeid_event_attendance_safe_guest_label(
        guest.source_kind,
        guest.display_name_snapshot,
        guest.linked_user_id
      ) AS attendee_display_name,
      guest.position::integer AS source_position,
      v_viewer_role = 'attendee'
        AND guest.linked_user_id = p_actor_id AS is_self
    FROM public.teskeid_event_guests AS guest
    WHERE guest.event_id = p_event_id
      AND guest.status = 'active'
  ), positioned AS (
    SELECT
      person.*,
      (pg_catalog.row_number() OVER (
        ORDER BY person.source_position, person.person_ref
      ) - 1)::integer AS position
    FROM source_people AS person
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'person_ref', person.person_ref,
      'participant_kind', person.participant_kind,
      'source_kind', CASE WHEN v_viewer_role = 'owner'
        THEN person.owner_source_kind ELSE person.attendee_source_kind END,
      'display_name', CASE WHEN v_viewer_role = 'owner'
        THEN person.owner_display_name ELSE person.attendee_display_name END,
      'position', person.position,
      'is_self', person.is_self
    ) ORDER BY person.position
  ), '[]'::jsonb)
  INTO v_people
  FROM positioned AS person;

  IF pg_catalog.jsonb_array_length(v_people) < 1
     OR pg_catalog.jsonb_array_length(v_people) > 50 THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'event_id', v_event.id,
    'name', v_event.name,
    'roster_revision', v_event.roster_revision,
    'viewer_role', v_viewer_role,
    'people', v_people
  );
END;
$function$;

ALTER FUNCTION public.teskeid_event_list_person_source_events_v1(
  uuid, timestamptz, uuid, integer
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_person_source_roster_v1(uuid, uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.teskeid_event_list_person_source_events_v1(
  uuid, timestamptz, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_person_source_roster_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_list_person_source_events_v1(
  uuid, timestamptz, uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_person_source_roster_v1(uuid, uuid)
  TO service_role;

COMMIT;

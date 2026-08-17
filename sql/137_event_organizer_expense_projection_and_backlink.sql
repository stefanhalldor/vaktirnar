-- SQL137: expose the Event organizer as an attendee-safe one-off Expense
-- participant and resolve an authorized Expense -> Event backlink.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $block$
DECLARE
  v_source pg_catalog.pg_proc%ROWTYPE;
BEGIN
  IF pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_source(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_uuid_from_text(text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_attendance_safe_guest_label(text,text,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_active_member_role(uuid,uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_organizer_expense_prerequisite_missing';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_event_link(uuid,uuid)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_organizer_expense_target_exists';
  END IF;

  SELECT function_row.* INTO v_source
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = function_row.proowner
  WHERE namespace_row.nspname = 'public'
    AND function_row.oid = pg_catalog.to_regprocedure(
      'public.teskeid_event_get_expense_source(uuid,uuid)'
    )
    AND owner_role.rolname = 'postgres';
  IF v_source.oid IS NULL
     OR pg_catalog.md5(pg_catalog.replace(
       v_source.prosrc, E'\r\n', E'\n'
     )) <> 'f69351f768ebeb45f750b088ef31f5a2'
     OR NOT v_source.prosecdef
     OR v_source.provolatile <> 's'
     OR v_source.proretset
     OR v_source.prorettype <> 'jsonb'::pg_catalog.regtype
     OR pg_catalog.cardinality(COALESCE(v_source.proconfig, ARRAY[]::text[])) <> 1
     OR v_source.proconfig[1] NOT IN ('search_path=', 'search_path=""')
     OR NOT pg_catalog.has_function_privilege(
       'service_role', v_source.oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege('anon', v_source.oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_source.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'teskeid_event_organizer_expense_source_drift';
  END IF;
END;
$block$;

CREATE OR REPLACE FUNCTION public.teskeid_event_get_expense_source(
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
  v_owner_user_id uuid;
  v_is_owner boolean := false;
  v_owner_participant_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_event_id';
  END IF;

  SELECT event_row.owner_user_id INTO v_owner_user_id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  v_is_owner := v_owner_user_id = p_actor_id;
  IF v_owner_user_id IS NULL OR (
    NOT v_is_owner AND NOT EXISTS (
      SELECT 1
      FROM public.teskeid_event_attendance_memberships AS membership
      JOIN public.teskeid_event_guests AS self_guest
        ON self_guest.event_id = membership.event_id
       AND self_guest.id = membership.event_guest_id
       AND self_guest.status = 'active'
       AND self_guest.linked_user_id = membership.user_id
      WHERE membership.event_id = p_event_id
        AND membership.user_id = p_actor_id
    )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  v_owner_participant_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-owner-participant:' || p_event_id::text
  );

  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', event_row.name,
    'roster_revision', event_row.roster_revision,
    'viewer_role', CASE WHEN v_is_owner THEN 'owner' ELSE 'attendee' END,
    'guests', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_guest_id', projected.id,
        'display_name', projected.display_name,
        'source_kind', projected.source_kind,
        'participant_kind', projected.participant_kind,
        'position', projected.position
      ) ORDER BY projected.position)
      FROM (
        SELECT candidate.id, candidate.display_name, candidate.source_kind,
          candidate.participant_kind,
          (pg_catalog.row_number() OVER (
            ORDER BY candidate.sort_group, candidate.sort_position, candidate.id
          ) - 1)::integer AS position
        FROM (
          SELECT v_owner_participant_id AS id,
            COALESCE(public.teskeid_event_attendance_safe_guest_label(
              'relationship', NULL, event_row.owner_user_id
            ), 'Teskeiðarnotandi') AS display_name,
            'manual_name'::text AS source_kind,
            'organizer'::text AS participant_kind,
            0 AS sort_group,
            0 AS sort_position
          WHERE NOT v_is_owner
          UNION ALL
          SELECT guest.id,
            CASE WHEN v_is_owner THEN guest.display_name_snapshot
              ELSE COALESCE(public.teskeid_event_attendance_safe_guest_label(
                guest.source_kind, guest.display_name_snapshot, guest.linked_user_id
              ), 'Gestur') END AS display_name,
            CASE WHEN v_is_owner THEN guest.source_kind
              ELSE 'manual_name' END AS source_kind,
            'guest'::text AS participant_kind,
            1 AS sort_group,
            guest.position AS sort_position
          FROM public.teskeid_event_guests AS guest
          WHERE guest.event_id = event_row.id
            AND guest.status = 'active'
            AND (v_is_owner OR guest.linked_user_id IS DISTINCT FROM p_actor_id)
        ) AS candidate
      ) AS projected
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_expense_event_link(
  p_actor_id uuid,
  p_expense_id uuid
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
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_expense_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  SELECT pg_catalog.jsonb_build_object('event_id', link.event_id)
  INTO v_result
  FROM public.teskeid_event_expense_links AS link
  JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
  JOIN public.expenses AS expense
    ON expense.id = link.expense_id AND expense.group_id = link.group_id
  WHERE link.expense_id = p_expense_id
    AND public.expense_active_member_role(p_actor_id, link.group_id) IS NOT NULL
    AND (
      event_row.owner_user_id = p_actor_id
      OR EXISTS (
        SELECT 1
        FROM public.teskeid_event_attendance_memberships AS membership
        JOIN public.teskeid_event_guests AS self_guest
          ON self_guest.event_id = membership.event_id
         AND self_guest.id = membership.event_guest_id
         AND self_guest.status = 'active'
         AND self_guest.linked_user_id = membership.user_id
        WHERE membership.event_id = event_row.id
          AND membership.user_id = p_actor_id
      )
    )
  LIMIT 1;
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.teskeid_event_get_expense_source(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_event_link(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_source(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_source(uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_event_link(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_event_link(uuid,uuid)
  TO service_role;

DO $block$
DECLARE
  v_source pg_catalog.pg_proc%ROWTYPE;
  v_link pg_catalog.pg_proc%ROWTYPE;
BEGIN
  SELECT function_row.* INTO v_source
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_source(uuid,uuid)'
  );
  SELECT function_row.* INTO v_link
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_event_link(uuid,uuid)'
  );
  IF v_source.oid IS NULL
     OR pg_catalog.md5(pg_catalog.replace(
       v_source.prosrc, E'\r\n', E'\n'
     )) <> '3d01501bdb03f0f6bca83e0817688006'
     OR v_link.oid IS NULL
     OR pg_catalog.md5(pg_catalog.replace(
       v_link.prosrc, E'\r\n', E'\n'
     )) <> 'e600e30ddb2660788d0542825e8162ca'
     OR NOT v_source.prosecdef OR NOT v_link.prosecdef
     OR v_source.provolatile <> 's' OR v_link.provolatile <> 's'
     OR v_source.proretset OR v_link.proretset
     OR v_source.prorettype <> 'jsonb'::pg_catalog.regtype
     OR v_link.prorettype <> 'jsonb'::pg_catalog.regtype
     OR pg_catalog.cardinality(COALESCE(v_source.proconfig, ARRAY[]::text[])) <> 1
     OR pg_catalog.cardinality(COALESCE(v_link.proconfig, ARRAY[]::text[])) <> 1
     OR v_source.proconfig[1] NOT IN ('search_path=', 'search_path=""')
     OR v_link.proconfig[1] NOT IN ('search_path=', 'search_path=""')
     OR NOT pg_catalog.has_function_privilege(
       'service_role', v_source.oid, 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role', v_link.oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege('anon', v_source.oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_source.oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_link.oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_link.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'teskeid_event_organizer_expense_attestation_failed';
  END IF;
END;
$block$;

COMMIT;

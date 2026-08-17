-- SQL135: allow an accepted Event attendee with separate Expenses access to
-- create an Event-tagged one-off expense. Event attendance itself still grants
-- no financial membership, debt visibility or Expense consent.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog, public;

DO $block$
BEGIN
  IF pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_source(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_assert_expense_link(uuid,uuid,uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_attendee_expense_prerequisite_missing';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
  ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_cleanup_attendee_expense_links()'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_attendee_expense_target_exists';
  END IF;
END;
$block$;

-- The exact-event picker is owner-private for owners and attendee-safe for an
-- accepted attendee. The attendee projection omits their own roster row because
-- the Expense form already represents the actor as its owner member.
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
        'position', projected.position
      ) ORDER BY projected.position)
      FROM (
        SELECT guest.id,
          CASE WHEN v_is_owner THEN guest.display_name_snapshot
            ELSE COALESCE(public.teskeid_event_attendance_safe_guest_label(
              guest.source_kind, guest.display_name_snapshot, guest.linked_user_id
            ), 'Gestur') END AS display_name,
          CASE WHEN v_is_owner THEN guest.source_kind
            ELSE 'manual_name' END AS source_kind,
          (pg_catalog.row_number() OVER (ORDER BY guest.position) - 1)::integer AS position
        FROM public.teskeid_event_guests AS guest
        WHERE guest.event_id = event_row.id
          AND guest.status = 'active'
          AND (v_is_owner OR guest.linked_user_id IS DISTINCT FROM p_actor_id)
      ) AS projected
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  RETURN v_result;
END;
$function$;

-- Existing owner links remain valid. An attendee-created link is valid only
-- when its Expense owner is the same actor and an accepted invitation proves
-- that the actor previously consented to this exact Event.
CREATE OR REPLACE FUNCTION public.teskeid_event_assert_expense_link(
  p_event_id uuid,
  p_group_id uuid,
  p_expense_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_expense_links AS link
    JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
    JOIN public.expense_groups AS group_row
      ON group_row.id = link.group_id AND group_row.kind = 'one_off'
    JOIN public.expenses AS expense
      ON expense.group_id = link.group_id AND expense.id = link.expense_id
    JOIN public.expense_group_members AS owner_member
      ON owner_member.group_id = link.group_id
     AND owner_member.user_id = link.linked_by_user_id
     AND owner_member.role = 'owner' AND owner_member.status = 'active'
    WHERE link.event_id = p_event_id
      AND link.group_id = p_group_id
      AND link.expense_id = p_expense_id
      AND link.linked_by_user_id IS NOT NULL
      AND (
        event_row.owner_user_id = link.linked_by_user_id
        OR EXISTS (
          SELECT 1
          FROM public.teskeid_event_guest_invitations AS invitation
          WHERE invitation.event_id = link.event_id
            AND invitation.accepted_user_id = link.linked_by_user_id
            AND invitation.accepted_at IS NOT NULL
        )
      )
      AND (
        SELECT pg_catalog.count(*) FROM public.expenses AS group_expense
        WHERE group_expense.group_id = link.group_id
      ) = 1
  ) THEN
    RAISE EXCEPTION 'teskeid_event_expense_link_invalid';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_cleanup_attendee_expense_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.role = 'owner' AND OLD.user_id IS NOT NULL AND NEW.user_id IS NULL THEN
    DELETE FROM public.teskeid_event_expense_links AS link
    USING public.teskeid_events AS event_row
    WHERE link.group_id = OLD.group_id
      AND link.event_id = event_row.id
      AND link.linked_by_user_id = OLD.user_id
      AND event_row.owner_user_id <> OLD.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER teskeid_event_cleanup_attendee_expense_links_before_unlink
BEFORE UPDATE OF user_id ON public.expense_group_members
FOR EACH ROW
WHEN (OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)
EXECUTE FUNCTION public.teskeid_event_cleanup_attendee_expense_links();

CREATE FUNCTION public.teskeid_event_create_tagged_expense_for_actor(
  p_actor_id uuid,
  p_request_id uuid,
  p_event_id uuid,
  p_expected_roster_revision bigint,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event public.teskeid_events%ROWTYPE;
  v_membership public.teskeid_event_attendance_memberships%ROWTYPE;
  v_fingerprint text;
  v_replay jsonb;
  v_member jsonb;
  v_member_id uuid;
  v_guest_id uuid;
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_mapping_found boolean;
  v_members jsonb := '[]'::jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_expense_id uuid;
  v_inner_request_id uuid;
  v_group_id uuid;
  v_created jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF EXISTS (
    SELECT 1 FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id AND event_row.owner_user_id = p_actor_id
  ) THEN
    RETURN public.teskeid_event_create_tagged_expense(
      p_actor_id, p_request_id, p_event_id, p_expected_roster_revision, p_payload
    );
  END IF;
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_event_id IS NULL
     OR p_expected_roster_revision IS NULL OR p_expected_roster_revision < 1
     OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.pg_column_size(p_payload) > 262144
     OR NOT (p_payload ?& ARRAY[
       'title','total_minor','currency','incurred_on','category','note',
       'split_method','one_off_members','payments','shares','obligations',
       'participant_invitations','event_guest_members'
     ]::text[])
     OR pg_catalog.jsonb_typeof(p_payload->'one_off_members') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'one_off_members') NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_typeof(p_payload->'payments') <> 'array'
     OR pg_catalog.jsonb_typeof(p_payload->'shares') <> 'array'
     OR pg_catalog.jsonb_typeof(p_payload->'obligations') <> 'array'
     OR pg_catalog.jsonb_typeof(p_payload->'participant_invitations') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'participant_invitations') <> 0
     OR pg_catalog.jsonb_typeof(p_payload->'event_guest_members') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload->'event_guest_members') > 48 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id, 'expectedRosterRevision', p_expected_roster_revision,
    'payload', p_payload
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id,
    'teskeid_event_create_tagged_expense_for_actor', v_fingerprint, true
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
  FOR UPDATE;
  IF v_event.id IS NULL OR v_event.owner_user_id = p_actor_id THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_event.roster_revision <> p_expected_roster_revision THEN
    RAISE EXCEPTION 'teskeid_event_revision_conflict';
  END IF;
  SELECT membership.* INTO v_membership
  FROM public.teskeid_event_attendance_memberships AS membership
  JOIN public.teskeid_event_guests AS self_guest
    ON self_guest.event_id = membership.event_id
   AND self_guest.id = membership.event_guest_id
   AND self_guest.status = 'active'
   AND self_guest.linked_user_id = membership.user_id
  WHERE membership.event_id = p_event_id AND membership.user_id = p_actor_id;
  IF v_membership.event_id IS NULL THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;

  PERFORM guest.id FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id AND guest.status = 'active'
  ORDER BY guest.id FOR SHARE;
  PERFORM invitation.id FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.id = v_membership.accepted_invitation_id
    AND invitation.event_id = p_event_id
    AND invitation.accepted_user_id = p_actor_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  PERFORM membership.event_id
  FROM public.teskeid_event_attendance_memberships AS membership
  WHERE membership.event_id = p_event_id
    AND membership.user_id = p_actor_id
    AND membership.event_guest_id = v_membership.event_guest_id
    AND membership.accepted_invitation_id = v_membership.accepted_invitation_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;

  FOR v_member IN SELECT item.value
    FROM pg_catalog.jsonb_array_elements(p_payload->'one_off_members')
      WITH ORDINALITY AS item(value, ordinal) ORDER BY item.ordinal
  LOOP
    BEGIN v_member_id := (v_member->>'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END;
    SELECT (mapping.value->>'event_guest_id')::uuid, true
    INTO v_guest_id, v_mapping_found
    FROM pg_catalog.jsonb_array_elements(p_payload->'event_guest_members') AS mapping(value)
    WHERE mapping.value->>'member_id' = v_member_id::text;
    IF COALESCE(v_mapping_found, false) THEN
      SELECT guest.* INTO v_guest FROM public.teskeid_event_guests AS guest
      WHERE guest.event_id = p_event_id AND guest.id = v_guest_id
        AND guest.status = 'active'
        AND guest.id <> v_membership.event_guest_id;
      IF v_guest.id IS NULL THEN RAISE EXCEPTION 'teskeid_event_roster_conflict'; END IF;
      v_members := v_members || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_member_id, 'user_id', NULL,
          'display_name', COALESCE(public.teskeid_event_attendance_safe_guest_label(
            v_guest.source_kind, v_guest.display_name_snapshot, v_guest.linked_user_id
          ), 'Gestur'),
          'role', 'member', 'status', 'active'
        )
      );
      v_sources := v_sources || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('event_guest_id', v_guest_id, 'member_id', v_member_id)
      );
    ELSE
      v_members := v_members || pg_catalog.jsonb_build_array(v_member);
    END IF;
    v_guest := NULL; v_guest_id := NULL; v_mapping_found := false;
  END LOOP;
  IF pg_catalog.jsonb_array_length(v_sources)
       <> pg_catalog.jsonb_array_length(p_payload->'event_guest_members') THEN
    RAISE EXCEPTION 'teskeid_event_roster_conflict';
  END IF;

  v_expense_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-expense:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-expense-inner-request:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_created := public.expense_create_expense_with_participants(
    p_actor_id, v_inner_request_id, v_expense_id, NULL,
    p_payload->>'title', (p_payload->>'total_minor')::bigint,
    p_payload->>'currency', (p_payload->>'incurred_on')::date,
    p_payload->>'category', p_payload->>'note', p_payload->>'split_method',
    v_members, p_payload->'payments', p_payload->'shares',
    p_payload->'obligations', '[]'::jsonb
  );
  v_group_id := (v_created->>'group_id')::uuid;
  INSERT INTO public.teskeid_event_expense_links(
    event_id, group_id, expense_id, linked_by_user_id
  ) VALUES (p_event_id, v_group_id, v_expense_id, p_actor_id);
  INSERT INTO public.teskeid_event_expense_participant_sources(
    event_id, group_id, expense_id, event_guest_id, expense_member_id
  ) SELECT p_event_id, v_group_id, v_expense_id,
      (source.value->>'event_guest_id')::uuid,
      (source.value->>'member_id')::uuid
    FROM pg_catalog.jsonb_array_elements(v_sources) AS source(value);
  PERFORM public.teskeid_event_assert_expense_link(p_event_id, v_group_id, v_expense_id);
  v_result := pg_catalog.jsonb_build_object(
    'group_id', v_group_id, 'expense_id', v_expense_id,
    'invitation_ids', '[]'::jsonb
  );
  PERFORM public.teskeid_event_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.teskeid_event_get_expense_source(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_assert_expense_link(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_cleanup_attendee_expense_links() OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_source(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_source(uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_assert_expense_link(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_cleanup_attendee_expense_links()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)
  TO service_role;

COMMIT;

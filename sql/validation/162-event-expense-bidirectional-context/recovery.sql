BEGIN;

-- Separately approved function-only recovery. This restores SQL102 generic
-- save plus exact SQL149/157 predecessor functions and removes additive
-- SQL162 RPC capability. It never rewrites rows.
DO $sql162_recovery_guard$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' OR EXISTS (
    WITH expected(
      signature, exact_arguments, source_hash, exact_config, service_execute,
      language_name, volatility, return_type, returns_set, argument_defaults
    ) AS (VALUES
      ('public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)', 'p_actor_id uuid, p_event_id uuid, p_expected_roster_revision bigint', '8b6a4c09987ab097352ff54e2e4bf1c6', ARRAY['search_path=""']::text[], true, 'plpgsql', 's', 'jsonb', false, 0),
      ('public.teskeid_event_list_expense_contexts_v1(uuid)', 'p_actor_id uuid', 'f5eeb1874518bd5952f7e8a6f92c26ea', ARRAY['search_path=""']::text[], true, 'plpgsql', 's', 'jsonb', false, 0),
      ('public.teskeid_event_get_expense_source_v3(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '9fdcb060bd933599b8f04fe42da27874', ARRAY['search_path=""']::text[], true, 'plpgsql', 's', 'jsonb', false, 0),
      ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', 'e6dc71178a96bb4f398d61b44b39c57a', ARRAY['search_path=""']::text[], true, 'plpgsql', 's', 'jsonb', false, 0),
      ('public.teskeid_event_get_expense_link_management_v2(uuid,uuid)', 'p_actor_id uuid, p_expense_id uuid', 'e154667946fb4756b433d6e632dc0575', ARRAY['search_path=""']::text[], true, 'plpgsql', 's', 'jsonb', false, 0),
      ('public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)', 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_event_id uuid, p_expected_financial_version bigint, p_expected_roster_revision bigint, p_visibility text', 'ed635a847824d8c5669af82c93c3c57d', ARRAY['search_path=""']::text[], true, 'plpgsql', 'v', 'jsonb', false, 0),
      ('public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)', 'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint, p_expected_publication_is_live boolean, p_expected_event_id uuid, p_expected_event_roster_revision bigint, p_new_event_id uuid, p_new_event_roster_revision bigint', 'a1bba12665e8651121bac578d7e936d4', ARRAY['search_path=""']::text[], true, 'plpgsql', 'v', 'jsonb', false, 0),
      ('public.expense_sql162_event_relation_tuple(jsonb)', 'p_payload jsonb', '0fa02c46d2b8b7c0c24506be5549743c', ARRAY['search_path=""']::text[], false, 'plpgsql', 'i', 'jsonb', false, 0),
      ('public.expense_sql162_assert_event_context(uuid,uuid,bigint)', 'p_actor_id uuid, p_event_id uuid, p_expected_roster_revision bigint', 'c59811554d33da10a2a8a66040e484ac', ARRAY['search_path=""']::text[], false, 'plpgsql', 's', 'jsonb', false, 0),
      ('public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', 'p_actor_id uuid, p_draft_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid, p_current_step text, p_payload jsonb, p_expected_version bigint DEFAULT NULL::bigint', '59f7c91049839431bf068d58f8462673', ARRAY['search_path=pg_catalog, public']::text[], true, 'plpgsql', 'v', 'TABLE(draft_id uuid, draft_version bigint, saved_at timestamp with time zone)', true, 1)
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = routine.prolang
    WHERE routine.oid IS NULL
       OR pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) <> expected.source_hash
       OR pg_catalog.pg_get_function_arguments(routine.oid) <> expected.exact_arguments
       OR pg_catalog.pg_get_function_result(routine.oid) <> expected.return_type
       OR language_row.lanname <> expected.language_name
       OR routine.provolatile::text <> expected.volatility
       OR routine.proretset <> expected.returns_set
       OR routine.pronargdefaults <> expected.argument_defaults
       OR routine.proisstrict
       OR pg_catalog.pg_get_userbyid(routine.proowner) <> 'postgres'
       OR NOT routine.prosecdef OR routine.proleakproof OR routine.proparallel <> 'u'
       OR routine.proconfig::text[] IS DISTINCT FROM expected.exact_config
       OR (SELECT pg_catalog.count(*) = CASE
             WHEN expected.service_execute THEN 2 ELSE 1
           END
           FROM pg_catalog.aclexplode(COALESCE(
             routine.proacl, pg_catalog.acldefault('f', routine.proowner)
           )) AS privilege
           LEFT JOIN pg_catalog.pg_roles AS grantee_role
             ON grantee_role.oid = privilege.grantee
           WHERE privilege.privilege_type = 'EXECUTE'
             AND privilege.grantor = routine.proowner
             AND NOT privilege.is_grantable
             AND (privilege.grantee = routine.proowner OR (
               expected.service_execute AND grantee_role.rolname = 'service_role'
             ))) IS NOT TRUE
       OR EXISTS (
         SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
           routine.proacl, pg_catalog.acldefault('f', routine.proowner)
         )) AS privilege
         LEFT JOIN pg_catalog.pg_roles AS grantee_role
           ON grantee_role.oid = privilege.grantee
         WHERE privilege.privilege_type <> 'EXECUTE'
            OR privilege.grantor <> routine.proowner
            OR privilege.is_grantable OR privilege.grantee = 0
            OR (privilege.grantee <> routine.proowner AND (
              NOT expected.service_execute
              OR grantee_role.rolname IS DISTINCT FROM 'service_role'
            ))
       )
  ) THEN
    RAISE EXCEPTION 'sql162_recovery_state_mismatch';
  END IF;
END;
$sql162_recovery_guard$;

REVOKE ALL ON FUNCTION public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_list_expense_contexts_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_source_v3(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.teskeid_event_get_legacy_expense_source_v2(
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
  v_role text;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_event.owner_user_id = p_actor_id THEN
    v_role := 'owner';
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
    v_role := 'attendee';
  ELSE
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'event_id', v_event.id,
    'name', public.teskeid_event_private_normalize_shared_name_v2(
      v_event.name
    ),
    'roster_revision', v_event.roster_revision::text,
    'viewer_role', v_role,
    'people', public.teskeid_event_private_legacy_people_v2(
      p_actor_id, p_event_id, v_role
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.teskeid_event_get_expense_link_management_v2(
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
  v_group_id uuid;
  v_current_event jsonb;
  v_events jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  SELECT expense.group_id INTO v_group_id
  FROM public.expenses AS expense
  JOIN public.expense_groups AS group_row
    ON group_row.id = expense.group_id
   AND group_row.kind = 'one_off'
   AND group_row.status <> 'closed'
  WHERE expense.id = p_expense_id
    AND expense.status = 'active'
    AND (
      expense.created_by = p_actor_id
      OR public.expense_active_member_role(p_actor_id, expense.group_id)
           IN ('owner', 'admin')
    )
    AND (
      SELECT pg_catalog.count(*) FROM public.expenses AS group_expense
      WHERE group_expense.group_id = expense.group_id
    ) = 1;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', CASE WHEN event_row.owner_user_id = p_actor_id OR EXISTS (
      SELECT 1
      FROM public.teskeid_event_attendance_memberships AS membership
      JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = membership.event_id
       AND guest.id = membership.event_guest_id
       AND guest.status = 'active'
       AND guest.linked_user_id = membership.user_id
      WHERE membership.event_id = event_row.id
        AND membership.user_id = p_actor_id
    ) THEN event_row.name ELSE NULL END,
    'can_open', event_row.owner_user_id = p_actor_id OR EXISTS (
      SELECT 1
      FROM public.teskeid_event_attendance_memberships AS membership
      JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = membership.event_id
       AND guest.id = membership.event_guest_id
       AND guest.status = 'active'
       AND guest.linked_user_id = membership.user_id
      WHERE membership.event_id = event_row.id
        AND membership.user_id = p_actor_id
    ),
    'visibility', link.visibility,
    'link_revision', link.link_revision::text
  ) INTO v_current_event
  FROM public.teskeid_event_expense_links AS link
  JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
  WHERE link.expense_id = p_expense_id
    AND link.group_id = v_group_id;

  IF v_current_event IS NULL THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'event_id', candidate.id,
      'name', candidate.name,
      'roster_revision', candidate.roster_revision::text,
      'viewer_role', candidate.viewer_role
    ) ORDER BY candidate.created_at DESC, candidate.id DESC), '[]'::jsonb)
    INTO v_events
    FROM (
      SELECT event_row.id, event_row.name, event_row.roster_revision,
        event_row.created_at,
        CASE WHEN event_row.owner_user_id = p_actor_id
          THEN 'owner' ELSE 'attendee' END AS viewer_role
      FROM public.teskeid_events AS event_row
      WHERE event_row.owner_user_id = p_actor_id
         OR EXISTS (
           SELECT 1
           FROM public.teskeid_event_attendance_memberships AS membership
           JOIN public.teskeid_event_guests AS guest
             ON guest.event_id = membership.event_id
            AND guest.id = membership.event_guest_id
            AND guest.status = 'active'
            AND guest.linked_user_id = membership.user_id
           WHERE membership.event_id = event_row.id
             AND membership.user_id = p_actor_id
         )
      ORDER BY event_row.created_at DESC, event_row.id DESC
      LIMIT 100
    ) AS candidate;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'current_event', v_current_event,
    'events', v_events
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.teskeid_event_attach_expense_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_event_id uuid,
  p_expected_financial_version bigint,
  p_expected_roster_revision bigint,
  p_visibility text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_event public.teskeid_events%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_role text;
  v_existing public.teskeid_event_expense_links%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_expense_id IS NULL
     OR p_event_id IS NULL OR p_expected_financial_version IS NULL
     OR p_expected_financial_version < 0
     OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision < 1
     OR p_visibility IS NULL
     OR p_visibility NOT IN ('participants_only', 'all_event') THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'expenseId', p_expense_id, 'eventId', p_event_id,
    'expectedFinancialVersion', p_expected_financial_version,
    'expectedRosterRevision', p_expected_roster_revision,
    'visibility', p_visibility
  )::text);
  -- Acquire the canonical actor/idempotency locks before any Expense row lock,
  -- but do not return a replay until current authority is re-proven below.
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id, 'teskeid_event_attach_expense_v2',
    v_fingerprint, true
  );

  SELECT expense.group_id INTO v_expense.group_id
  FROM public.expenses AS expense WHERE expense.id = p_expense_id;
  IF v_expense.group_id IS NULL THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
  WHERE group_row.id = v_expense.group_id FOR UPDATE;
  SELECT expense.* INTO v_expense FROM public.expenses AS expense
  WHERE expense.id = p_expense_id AND expense.group_id = v_group.id FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group.id);
  IF v_group.id IS NULL OR v_group.kind <> 'one_off'
     OR v_group.status = 'closed'
     OR v_expense.id IS NULL OR v_expense.status <> 'active'
     OR v_role IS NULL
     OR (v_expense.created_by IS DISTINCT FROM p_actor_id
       AND COALESCE(v_role, '') NOT IN ('owner', 'admin'))
     OR (SELECT pg_catalog.count(*) FROM public.expenses AS group_expense
         WHERE group_expense.group_id = v_group.id) <> 1 THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;

  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
  FOR UPDATE;
  IF v_event.id IS NULL
     OR (
       v_event.owner_user_id <> p_actor_id
       AND NOT EXISTS (
         SELECT 1
         FROM public.teskeid_event_attendance_memberships AS membership
         JOIN public.teskeid_event_guests AS guest
           ON guest.event_id = membership.event_id
          AND guest.id = membership.event_guest_id
          AND guest.status = 'active'
          AND guest.linked_user_id = membership.user_id
         WHERE membership.event_id = p_event_id
           AND membership.user_id = p_actor_id
       )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;

  -- Re-prove current exact Expense and Event-context authority before a lost-
  -- response replay. Expected versions stay after replay so a legitimate retry
  -- remains byte-stable after its own successful mutation.
  SELECT link.* INTO v_existing
  FROM public.teskeid_event_expense_links AS link
  WHERE link.expense_id = p_expense_id
  FOR UPDATE;
  IF v_replay IS NOT NULL THEN
    IF v_existing.event_id IS NULL
       OR v_existing.event_id <> p_event_id
       OR v_existing.group_id <> v_group.id THEN
      RAISE EXCEPTION 'teskeid_event_link_conflict';
    END IF;
    PERFORM public.teskeid_event_assert_expense_link(
      p_event_id, v_group.id, p_expense_id
    );
    RETURN v_replay;
  END IF;
  IF v_group.financial_version <> p_expected_financial_version THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  IF v_event.roster_revision <> p_expected_roster_revision THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;

  IF v_existing.event_id IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_link_conflict';
  END IF;
  INSERT INTO public.teskeid_event_expense_links(
    event_id, group_id, expense_id, linked_by_user_id, link_revision, visibility
  ) VALUES (
    p_event_id, v_group.id, p_expense_id, p_actor_id, 1, p_visibility
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_existing;
  IF v_existing.event_id IS NULL OR v_existing.link_revision <> 1 THEN
    RAISE EXCEPTION 'teskeid_event_link_conflict';
  END IF;
  PERFORM public.teskeid_event_assert_expense_link(
    p_event_id, v_group.id, p_expense_id
  );
  v_result := pg_catalog.jsonb_build_object(
    'expense_id', p_expense_id,
    'event_id', p_event_id,
    'visibility', v_existing.visibility,
    'link_revision', v_existing.link_revision::text
  );
  PERFORM public.teskeid_event_finish_request(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_save_private_draft(
  p_actor_id uuid,
  p_draft_id uuid,
  p_context_type text,
  p_group_id uuid,
  p_expense_id uuid,
  p_current_step text,
  p_payload jsonb,
  p_expected_version bigint DEFAULT NULL
)
RETURNS TABLE(draft_id uuid, draft_version bigint, saved_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_row public.expense_private_drafts%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_draft_id IS NULL
     OR p_current_step NOT IN ('details', 'people', 'split', 'review')
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(p_payload::text) > 65536 THEN
    RAISE EXCEPTION 'expense_draft_invalid_input';
  END IF;

  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, p_context_type, p_group_id, p_expense_id
  );

  IF p_expected_version IS NULL THEN
    INSERT INTO public.expense_private_drafts (
      id, actor_user_id, context_type, group_id, expense_id,
      current_step, payload, version
    ) VALUES (
      p_draft_id, p_actor_id, p_context_type, p_group_id, p_expense_id,
      p_current_step, p_payload, 1
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      SELECT * INTO v_row
      FROM public.expense_private_drafts AS drafts
      WHERE drafts.id = p_draft_id
        AND drafts.actor_user_id = p_actor_id;
      IF v_row.id IS NULL
         OR v_row.context_type <> p_context_type
         OR v_row.group_id IS DISTINCT FROM p_group_id
         OR v_row.expense_id IS DISTINCT FROM p_expense_id
         OR v_row.current_step <> p_current_step
         OR v_row.payload <> p_payload THEN
        RAISE EXCEPTION 'expense_draft_conflict';
      END IF;
    END IF;
  ELSE
    UPDATE public.expense_private_drafts AS drafts
    SET current_step = p_current_step,
        payload = p_payload,
        version = drafts.version + 1,
        updated_at = now()
    WHERE drafts.id = p_draft_id
      AND drafts.actor_user_id = p_actor_id
      AND drafts.context_type = p_context_type
      AND drafts.group_id IS NOT DISTINCT FROM p_group_id
      AND drafts.expense_id IS NOT DISTINCT FROM p_expense_id
      AND drafts.version = p_expected_version
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'expense_draft_conflict';
    END IF;
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.version, v_row.updated_at;
END;
$function$;

DO $sql162_recovery_restore_guard$
BEGIN
  IF (SELECT pg_catalog.md5(pg_catalog.replace(
        routine.prosrc, E'\r\n', E'\n'
      ))
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = pg_catalog.to_regprocedure(
        'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'
      )) IS DISTINCT FROM 'aa7eb65be2210108d99736fa2f7d8b37'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(
          routine.prosrc, E'\r\n', E'\n'
        ))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = pg_catalog.to_regprocedure(
           'public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)'
         )) IS DISTINCT FROM '279be97e3295b9d2ae6f2457bf106d6a'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(
          routine.prosrc, E'\r\n', E'\n'
        ))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = pg_catalog.to_regprocedure(
           'public.teskeid_event_get_expense_link_management_v2(uuid,uuid)'
         )) IS DISTINCT FROM '7ab39825d58918dfc99ebb01b53128ec'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(
          routine.prosrc, E'\r\n', E'\n'
        ))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = pg_catalog.to_regprocedure(
           'public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)'
         )) IS DISTINCT FROM 'aec7d0cf817826697338e74de645dc4e' THEN
    RAISE EXCEPTION 'sql162_recovery_restore_mismatch';
  END IF;
END;
$sql162_recovery_restore_guard$;

ALTER FUNCTION public.expense_save_private_draft(
  uuid,uuid,text,uuid,uuid,text,jsonb,bigint
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attach_expense_v2(
  uuid,uuid,uuid,uuid,bigint,bigint,text
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_link_management_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)
  TO service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_link_management_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_link_management_v2(uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)
  TO service_role;

DROP FUNCTION public.expense_set_private_draft_event_relation_v1(
  uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint
);
DROP FUNCTION public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint);
DROP FUNCTION public.teskeid_event_list_expense_contexts_v1(uuid);
DROP FUNCTION public.expense_sql162_assert_event_context(uuid,uuid,bigint);
DROP FUNCTION public.teskeid_event_get_expense_source_v3(uuid,uuid);
DROP FUNCTION public.expense_sql162_event_relation_tuple(jsonb);

COMMIT;

BEGIN;

-- SQL162: bounded bidirectional Event/Expense discovery and one canonical
-- draft Event-relation mutation. SQL153 current attendance is Event-context
-- authority; SQL157 Expense authority and SQL159/160 financial truth remain.

DO $sql162_precondition$
BEGIN
  IF pg_catalog.to_regprocedure(
       'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_sql159_event_scope_read_only(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_link_management_v2(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_sql159_event_scope_allows(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_begin_request(uuid,uuid,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_finish_request(uuid,uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_finish_request(uuid,uuid,jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION 'sql162_predecessor_missing';
  END IF;
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
           'public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)'
         )) IS DISTINCT FROM '14ac1abc9046fea4812ac652a9b96088'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(
          routine.prosrc, E'\r\n', E'\n'
        ))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = pg_catalog.to_regprocedure(
           'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'
         )) IS DISTINCT FROM '18a6e628bdb1d3c175b515541ab56787'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(
          routine.prosrc, E'\r\n', E'\n'
        ))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = pg_catalog.to_regprocedure(
           'public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)'
         )) IS DISTINCT FROM '4332f4ccfd5e58f2e17ebe9389c13311' THEN
    RAISE EXCEPTION 'sql162_predecessor_drift';
  END IF;
  IF pg_catalog.to_regprocedure(
       'public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_list_expense_contexts_v1(uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_sql162_event_relation_tuple(jsonb)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_sql162_assert_event_context(uuid,uuid,bigint)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_source_v3(uuid,uuid)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'sql162_target_collision';
  END IF;
END;
$sql162_precondition$;

-- Freeze every direct SQL162 helper boundary, including complete EXECUTE ACLs.
-- A source hash alone is not sufficient evidence for a SECURITY DEFINER call.
DO $sql162_dependency_contract$
BEGIN
  IF EXISTS (
    WITH expected(
      signature, exact_arguments, source_hash, language_name, volatility,
      return_type, is_strict, exact_config, service_execute
    ) AS (VALUES
      ('public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)', 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_event_id uuid, p_expected_financial_version bigint, p_expected_roster_revision bigint, p_visibility text', '279be97e3295b9d2ae6f2457bf106d6a', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], true),
      ('public.teskeid_event_get_expense_link_management_v2(uuid,uuid)', 'p_actor_id uuid, p_expense_id uuid', '7ab39825d58918dfc99ebb01b53128ec', 'plpgsql', 's', 'jsonb', false, ARRAY['search_path=""']::text[], true),
      ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', 'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint, p_split_confirmed boolean', '14ac1abc9046fea4812ac652a9b96088', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], true),
      ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '4332f4ccfd5e58f2e17ebe9389c13311', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], true),
      ('public.expense_active_member_role(uuid,uuid)', 'p_actor_id uuid, p_group_id uuid', 'b25f994a64dde4a3f94ec8bad8535b17', 'sql', 's', 'text', false, ARRAY['search_path=""']::text[], false),
      ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', 'p_actor_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid', 'aeb9b8246978d630fb69db9365a22f34', 'plpgsql', 'v', 'void', false, ARRAY['search_path=pg_catalog, public']::text[], false),
      ('public.expense_begin_request(uuid,uuid,text,text)', 'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text', 'd8631d60cc2f0df56dd9e958537db2a7', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], false),
      ('public.expense_finish_request(uuid,uuid,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_result jsonb', '194c5812642b4aaaafe888bc0ba5aa29', 'plpgsql', 'v', 'void', false, ARRAY['search_path=""']::text[], false),
      ('public.expense_identity_request_id(text,uuid)', 'p_scope text, p_request_id uuid', '496d1e1dd94d149cf607198c9271a25d', 'sql', 'i', 'uuid', true, ARRAY['search_path=""']::text[], false),
      ('public.expense_sql159_event_scope_read_only(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '4ba9308ba12eef6405ed24916bc0bb74', 'plpgsql', 's', 'jsonb', false, ARRAY['search_path=""']::text[], false),
      ('public.expense_sql159_event_scope_allows(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', '0be29be5cda2d34bf41dc2f67e0afa2e', 'plpgsql', 's', 'boolean', false, ARRAY['search_path=""']::text[], false),
      ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)', 'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean', '18a6e628bdb1d3c175b515541ab56787', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], false),
      ('public.teskeid_event_assert_financial_actor(uuid)', 'p_actor_id uuid', '7f6ced4f5e7472aff27d9a6d5c624355', 'plpgsql', 's', 'void', false, ARRAY['search_path=""']::text[], false),
      ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)', 'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text, p_require_expenses boolean', '4e70b62a5fa28cfe2b884d703935a16c', 'plpgsql', 'v', 'jsonb', false, ARRAY['search_path=""']::text[], false),
      ('public.teskeid_event_finish_request(uuid,uuid,jsonb)', 'p_actor_id uuid, p_request_id uuid, p_result jsonb', 'eaa006157dc5377e0ae1f8979651f8aa', 'plpgsql', 'v', 'void', false, ARRAY['search_path=""']::text[], false),
      ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)', 'p_actor_id uuid, p_event_id uuid', 'aec7d0cf817826697338e74de645dc4e', 'plpgsql', 's', 'jsonb', false, ARRAY['search_path=""']::text[], true),
      ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)', 'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_participant_kind text, p_position integer', '25394edc6b084676921c3a65b1f19a8a', 'plpgsql', 's', 'jsonb', false, ARRAY['search_path=""']::text[], false),
      ('public.teskeid_event_private_normalize_shared_name_v2(text)', 'p_value text', 'd118ab08bc0346cdf31519344a2f65a7', 'sql', 'i', 'text', false, ARRAY['search_path=""']::text[], false)
    )
    SELECT 1
    FROM expected
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
       OR routine.proisstrict <> expected.is_strict
       OR routine.proretset OR routine.pronargdefaults <> 0
       OR routine.proargdefaults IS NOT NULL OR routine.proallargtypes IS NOT NULL
       OR routine.proargmodes IS NOT NULL OR NOT routine.prosecdef
       OR routine.proleakproof OR routine.proparallel <> 'u'
       OR routine.proconfig::text[] IS DISTINCT FROM expected.exact_config
       OR pg_catalog.pg_get_userbyid(routine.proowner) <> 'postgres'
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
    RAISE EXCEPTION 'sql162_dependency_contract_drift';
  END IF;
END;
$sql162_dependency_contract$;

-- SQL153 current participation is canonical Event-context authority. Legacy
-- membership is compatibility evidence only: every legacy tuple must still be
-- current, while current-only tuples are valid without legacy backfill.
DO $sql162_authority_graph_gate$
BEGIN
  IF EXISTS (
    WITH old_graph AS MATERIALIZED (
      SELECT membership.event_id, membership.user_id,
        membership.event_guest_id
      FROM public.teskeid_event_attendance_memberships AS membership
      JOIN public.teskeid_events AS event_row
        ON event_row.id = membership.event_id
       AND event_row.owner_user_id <> membership.user_id
      JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = membership.event_id
       AND guest.id = membership.event_guest_id
       AND guest.status = 'active'
       AND guest.linked_user_id = membership.user_id
    ), current_graph AS MATERIALIZED (
      SELECT participation.event_id,
        participation.recipient_user_id AS user_id,
        participation.event_guest_id
      FROM public.teskeid_event_participations AS participation
      JOIN public.teskeid_events AS event_row
        ON event_row.id = participation.event_id
       AND event_row.owner_user_id <> participation.recipient_user_id
      JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = participation.event_id
       AND guest.id = participation.event_guest_id
       AND guest.status = 'active'
      JOIN public.teskeid_event_participation_rsvp_v3 AS decision
        ON decision.event_id = participation.event_id
       AND decision.event_guest_id = participation.event_guest_id
       AND decision.identity_generation = participation.identity_generation
       AND decision.decision_version = participation.rsvp_version
      WHERE participation.recipient_user_id IS NOT NULL
        AND participation.access_state = 'active'
    ), malformed_current AS MATERIALIZED (
      SELECT participation.event_id, participation.recipient_user_id,
        participation.event_guest_id
      FROM public.teskeid_event_participations AS participation
      JOIN public.teskeid_events AS event_row
        ON event_row.id = participation.event_id
       AND event_row.owner_user_id <> participation.recipient_user_id
      LEFT JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = participation.event_id
       AND guest.id = participation.event_guest_id
       AND guest.status = 'active'
      LEFT JOIN public.teskeid_event_participation_rsvp_v3 AS decision
        ON decision.event_id = participation.event_id
       AND decision.event_guest_id = participation.event_guest_id
       AND decision.identity_generation = participation.identity_generation
       AND decision.decision_version = participation.rsvp_version
      WHERE participation.recipient_user_id IS NOT NULL
        AND participation.access_state = 'active'
        AND (guest.id IS NULL OR decision.event_guest_id IS NULL)
    ), duplicate_current AS MATERIALIZED (
      SELECT current_row.event_id, current_row.user_id
      FROM current_graph AS current_row
      GROUP BY current_row.event_id, current_row.user_id
      HAVING pg_catalog.count(*) <> 1
    )
    SELECT 1 FROM (
      SELECT * FROM old_graph EXCEPT SELECT * FROM current_graph
    ) AS legacy_without_current
    UNION ALL
    SELECT 1 FROM malformed_current
    UNION ALL
    SELECT 1 FROM duplicate_current
  ) THEN
    RAISE EXCEPTION 'sql162_current_authority_graph_invalid';
  END IF;
END;
$sql162_authority_graph_gate$;

CREATE FUNCTION public.expense_sql162_event_relation_tuple(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_link boolean;
  v_event_id uuid;
  v_revision bigint;
BEGIN
  IF pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR (p_payload ? 'linkToEvent'
       AND pg_catalog.jsonb_typeof(p_payload->'linkToEvent') <> 'boolean') THEN
    RAISE EXCEPTION 'expense_draft_invalid_input';
  END IF;
  v_link := COALESCE((p_payload->>'linkToEvent')::boolean, false);
  IF NOT v_link THEN
    RETURN pg_catalog.jsonb_build_object(
      'link_to_event', false,
      'event_id', NULL,
      'event_roster_revision', NULL
    );
  END IF;
  IF pg_catalog.jsonb_typeof(p_payload->'eventId') <> 'string'
     OR p_payload->>'eventId'
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR pg_catalog.jsonb_typeof(p_payload->'eventRosterRevision') <> 'number'
     OR p_payload->>'eventRosterRevision' !~ '^[1-9][0-9]*$'
     OR (p_payload->>'eventRosterRevision')::numeric > 9007199254740991 THEN
    RAISE EXCEPTION 'expense_draft_invalid_input';
  END IF;
  v_event_id := (p_payload->>'eventId')::uuid;
  v_revision := (p_payload->>'eventRosterRevision')::bigint;
  RETURN pg_catalog.jsonb_build_object(
    'link_to_event', true,
    'event_id', v_event_id,
    'event_roster_revision', v_revision
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_expense_source_v3(
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
  v_scope jsonb;
  v_role text;
  v_self_guest_id uuid;
  v_people jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_scope := public.expense_sql159_event_scope_read_only(
    p_actor_id, p_event_id
  );
  IF pg_catalog.jsonb_typeof(v_scope) <> 'object'
     OR v_scope - ARRAY[
       'viewer_role', 'event_guest_id', 'identity_generation'
     ]::text[] <> '{}'::jsonb
     OR v_scope->>'viewer_role' NOT IN ('owner', 'attendee') THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  v_role := v_scope->>'viewer_role';
  IF v_role = 'attendee' THEN
    IF v_scope->>'event_guest_id'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'teskeid_event_not_found';
    END IF;
    v_self_guest_id := (v_scope->>'event_guest_id')::uuid;
  END IF;
  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  WITH source_rows AS (
    SELECT 0 AS position,
      public.teskeid_event_private_legacy_person_v2(
        p_actor_id, p_event_id, NULL, 'organizer', 0
      ) AS person
    WHERE v_role = 'attendee'
    UNION ALL
    SELECT
      (pg_catalog.row_number() OVER (
        ORDER BY guest.position, guest.id
      ) - CASE WHEN v_role = 'owner' THEN 1 ELSE 0 END)::integer,
      public.teskeid_event_private_legacy_person_v2(
        p_actor_id, p_event_id, guest.id, 'guest',
        (pg_catalog.row_number() OVER (
          ORDER BY guest.position, guest.id
        ) - CASE WHEN v_role = 'owner' THEN 1 ELSE 0 END)::integer
      )
    FROM public.teskeid_event_guests AS guest
    WHERE guest.event_id = p_event_id
      AND guest.status = 'active'
      AND (v_role = 'owner' OR guest.id <> v_self_guest_id)
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    source_row.person ORDER BY source_row.position
  ), '[]'::jsonb)
  INTO v_people
  FROM source_rows AS source_row;

  RETURN pg_catalog.jsonb_build_object(
    'event_id', v_event.id,
    'name', public.teskeid_event_private_normalize_shared_name_v2(
      v_event.name
    ),
    'roster_revision', v_event.roster_revision::text,
    'viewer_role', v_role,
    'people', v_people
  );
END;
$function$;

-- SQL159 normalization calls this frozen signature. Preserve its exact wire,
-- owner/security/ACL contract while delegating authority to the bounded
-- current-attendance source above.
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
BEGIN
  RETURN public.teskeid_event_get_expense_source_v3(
    p_actor_id, p_event_id
  );
END;
$function$;

CREATE FUNCTION public.expense_sql162_assert_event_context(
  p_actor_id uuid,
  p_event_id uuid,
  p_expected_roster_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope jsonb;
  v_source jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_event_id IS NULL
     OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision NOT BETWEEN 1 AND 9007199254740991 THEN
    RAISE EXCEPTION 'expense_draft_event_invalid_input';
  END IF;
  v_scope := public.expense_sql159_event_scope_read_only(
    p_actor_id, p_event_id
  );
  v_source := public.teskeid_event_get_expense_source_v3(
    p_actor_id, p_event_id
  );
  IF pg_catalog.jsonb_typeof(v_scope) <> 'object'
     OR v_scope - ARRAY[
       'viewer_role', 'event_guest_id', 'identity_generation'
     ]::text[] <> '{}'::jsonb
     OR pg_catalog.jsonb_typeof(v_source) <> 'object'
     OR v_source - ARRAY[
       'event_id', 'name', 'roster_revision', 'viewer_role', 'people'
     ]::text[] <> '{}'::jsonb
     OR v_source->>'event_id' IS DISTINCT FROM p_event_id::text
     OR v_source->>'roster_revision' !~ '^[1-9][0-9]*$'
     OR (v_source->>'roster_revision')::numeric > 9007199254740991
     OR (v_source->>'roster_revision')::bigint
       <> p_expected_roster_revision
     OR v_source->>'viewer_role' IS DISTINCT FROM v_scope->>'viewer_role'
     OR pg_catalog.jsonb_typeof(v_source->'people') <> 'array'
     OR pg_catalog.jsonb_array_length(v_source->'people') > 49 THEN
    RAISE EXCEPTION 'expense_draft_event_context_conflict';
  END IF;
  RETURN v_source;
END;
$function$;

CREATE FUNCTION public.teskeid_event_list_expense_contexts_v1(
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows jsonb;
  v_count integer;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  WITH candidates AS MATERIALIZED (
    SELECT event_row.id, event_row.name, event_row.roster_revision,
      event_row.created_at,
      CASE WHEN event_row.owner_user_id = p_actor_id
        THEN 'owner'::text ELSE 'attendee'::text END AS viewer_role
    FROM public.teskeid_events AS event_row
    WHERE public.expense_sql159_event_scope_allows(
      p_actor_id, event_row.id
    )
    ORDER BY event_row.created_at DESC, event_row.id DESC
    LIMIT 101
  )
  SELECT pg_catalog.count(*), COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'event_id', candidate.id,
      'name', public.teskeid_event_private_normalize_shared_name_v2(
        candidate.name
      ),
      'roster_revision', candidate.roster_revision::text,
      'viewer_role', candidate.viewer_role
    ) ORDER BY candidate.created_at DESC, candidate.id DESC
  ), '[]'::jsonb)
  INTO v_count, v_rows
  FROM candidates AS candidate;
  IF v_count > 100 THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'unavailable', 'events', '[]'::jsonb
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', CASE WHEN v_count = 0 THEN 'none' ELSE 'ready' END,
    'events', v_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'unavailable', 'events', '[]'::jsonb
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_list_attachable_expenses_v1(
  p_actor_id uuid,
  p_event_id uuid,
  p_expected_roster_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows jsonb;
  v_count integer;
BEGIN
  PERFORM public.teskeid_event_assert_financial_actor(p_actor_id);
  IF p_event_id IS NULL OR p_expected_roster_revision IS NULL
     OR p_expected_roster_revision NOT BETWEEN 1 AND 9007199254740991
     OR NOT EXISTS (
       SELECT 1 FROM public.teskeid_events AS event_row
       WHERE event_row.id = p_event_id
         AND event_row.roster_revision = p_expected_roster_revision
         AND public.expense_sql159_event_scope_allows(
           p_actor_id, event_row.id
         )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  WITH candidates AS MATERIALIZED (
    SELECT expense.id, expense.title, expense.total_minor, expense.currency,
      expense.incurred_on, group_row.financial_version, expense.created_at
    FROM public.expenses AS expense
    JOIN public.expense_groups AS group_row
      ON group_row.id = expense.group_id
     AND group_row.kind = 'one_off'
     AND group_row.status <> 'closed'
    WHERE expense.status = 'active'
      AND public.expense_active_member_role(
        p_actor_id, expense.group_id
      ) IS NOT NULL
      AND (
        expense.created_by = p_actor_id
        OR public.expense_active_member_role(
          p_actor_id, expense.group_id
        ) IN ('owner', 'admin')
      )
      AND (
        SELECT pg_catalog.count(*)
        FROM public.expenses AS group_expense
        WHERE group_expense.group_id = expense.group_id
      ) = 1
      AND NOT EXISTS (
        SELECT 1 FROM public.teskeid_event_expense_links AS link
        WHERE link.expense_id = expense.id
      )
    ORDER BY expense.created_at DESC, expense.id DESC
    LIMIT 101
  )
  SELECT pg_catalog.count(*), COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'expense_id', candidate.id,
      'title', pg_catalog.btrim(candidate.title),
      'total_minor', candidate.total_minor::text,
      'currency', candidate.currency,
      'incurred_on', pg_catalog.to_char(candidate.incurred_on, 'YYYY-MM-DD'),
      'financial_version', candidate.financial_version::text
    ) ORDER BY candidate.created_at DESC, candidate.id DESC
  ), '[]'::jsonb)
  INTO v_count, v_rows
  FROM candidates AS candidate;
  IF v_count > 100 THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'unavailable', 'expenses', '[]'::jsonb
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', CASE WHEN v_count = 0 THEN 'none' ELSE 'ready' END,
    'expenses', v_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'unavailable', 'expenses', '[]'::jsonb
  );
END;
$function$;

-- Preserve SQL157's exact management contract and Expense authority while
-- converging only its Event-context branch on canonical SQL153 attendance.
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
    'name', CASE WHEN public.expense_sql159_event_scope_allows(
      p_actor_id, event_row.id
    ) THEN event_row.name ELSE NULL END,
    'can_open', public.expense_sql159_event_scope_allows(
      p_actor_id, event_row.id
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
      WHERE public.expense_sql159_event_scope_allows(
        p_actor_id, event_row.id
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

-- Preserve SQL157's exact attach contract, locks, replay and Expense checks.
-- Only the Event-context predicate changes from legacy membership to SQL153.
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
  IF v_event.id IS NULL OR NOT public.expense_sql159_event_scope_allows(
    p_actor_id, p_event_id
  ) THEN
    RAISE EXCEPTION 'teskeid_event_not_allowed';
  END IF;

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

-- Preserve SQL102's exact public contract. Only semantic Event-relation
-- changes are removed from generic autosave authority.
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
  v_existing public.expense_private_drafts%ROWTYPE;
  v_incoming_relation jsonb;
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
  IF p_context_type = 'one_off' THEN
    v_incoming_relation := public.expense_sql162_event_relation_tuple(p_payload);
  END IF;

  IF p_expected_version IS NULL THEN
    IF p_context_type = 'one_off'
       AND (v_incoming_relation->>'link_to_event')::boolean THEN
      RAISE EXCEPTION 'expense_draft_event_relation_conflict';
    END IF;
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
    SELECT * INTO v_existing
    FROM public.expense_private_drafts AS drafts
    WHERE drafts.id = p_draft_id
      AND drafts.actor_user_id = p_actor_id
      AND drafts.context_type = p_context_type
      AND drafts.group_id IS NOT DISTINCT FROM p_group_id
      AND drafts.expense_id IS NOT DISTINCT FROM p_expense_id
      AND drafts.version = p_expected_version
    FOR UPDATE;
    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'expense_draft_conflict';
    END IF;
    IF p_context_type = 'one_off'
       AND public.expense_sql162_event_relation_tuple(v_existing.payload)
         IS DISTINCT FROM v_incoming_relation THEN
      RAISE EXCEPTION 'expense_draft_event_relation_conflict';
    END IF;
    UPDATE public.expense_private_drafts AS drafts
    SET current_step = p_current_step,
        payload = p_payload,
        version = drafts.version + 1,
        updated_at = now()
    WHERE drafts.id = p_draft_id
      AND drafts.actor_user_id = p_actor_id
      AND drafts.version = p_expected_version
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'expense_draft_conflict';
    END IF;
  END IF;
  RETURN QUERY SELECT v_row.id, v_row.version, v_row.updated_at;
END;
$function$;

CREATE FUNCTION public.expense_set_private_draft_event_relation_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_draft_id uuid,
  p_expected_draft_version bigint,
  p_expected_publication_version bigint,
  p_expected_publication_is_live boolean,
  p_expected_event_id uuid,
  p_expected_event_roster_revision bigint,
  p_new_event_id uuid,
  p_new_event_roster_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_gate_event_id uuid;
  v_event_request_id uuid;
  v_event_fingerprint text;
  v_event_replay jsonb;
  v_draft public.expense_private_drafts%ROWTYPE;
  v_publication public.expense_unconfirmed_publications%ROWTYPE;
  v_old_tuple jsonb;
  v_new_source jsonb;
  v_new_payload jsonb;
  v_new_normalized jsonb;
  v_new_draft_version bigint;
  v_new_publication_version bigint;
  v_visibility text;
  v_privacy_fail_closed boolean := false;
  v_existing_parties jsonb;
  v_existing_audience jsonb;
  v_result jsonb;
  v_receipt jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_draft_id IS NULL
     OR p_expected_draft_version IS NULL
     OR p_expected_draft_version NOT BETWEEN 1 AND 9007199254740991
     OR (p_expected_publication_version IS NULL)
       <> (p_expected_publication_is_live IS NULL)
     OR (p_expected_publication_version IS NOT NULL AND (
       p_expected_publication_version NOT BETWEEN 1 AND 9007199254740991
     ))
     OR (p_expected_event_id IS NULL)
       <> (p_expected_event_roster_revision IS NULL)
     OR (p_new_event_id IS NULL) <> (p_new_event_roster_revision IS NULL)
     OR (p_expected_event_roster_revision IS NOT NULL AND
       p_expected_event_roster_revision NOT BETWEEN 1 AND 9007199254740991)
     OR (p_new_event_roster_revision IS NOT NULL AND
       p_new_event_roster_revision NOT BETWEEN 1 AND 9007199254740991) THEN
    RAISE EXCEPTION 'expense_draft_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'draftId', p_draft_id,
    'expectedDraftVersion', p_expected_draft_version,
    'expectedPublicationVersion', p_expected_publication_version,
    'expectedPublicationIsLive', p_expected_publication_is_live,
    'expectedEventId', p_expected_event_id,
    'expectedEventRosterRevision', p_expected_event_roster_revision,
    'newEventId', p_new_event_id,
    'newEventRosterRevision', p_new_event_roster_revision
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id,
    'expense_set_private_draft_event_relation_v1', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(v_replay) <> 'object'
       OR NOT (v_replay ?& ARRAY[
         'contract_version', 'state', 'draft_id',
         'previous_draft_version', 'draft_version', 'publication_id',
         'previous_publication_version', 'publication_version',
         'previous_event_id', 'previous_event_roster_revision',
         'event_id', 'event_roster_revision', 'visibility',
         'privacy_fail_closed', 'receipt_publication_is_live',
         'receipt_publication_event_id',
         'receipt_publication_event_roster_revision',
         'receipt_publication_visibility'
       ]::text[])
       OR v_replay - ARRAY[
         'contract_version', 'state', 'draft_id',
         'previous_draft_version', 'draft_version', 'publication_id',
         'previous_publication_version', 'publication_version',
         'previous_event_id', 'previous_event_roster_revision',
         'event_id', 'event_roster_revision', 'visibility',
         'privacy_fail_closed', 'receipt_publication_is_live',
         'receipt_publication_event_id',
         'receipt_publication_event_roster_revision',
         'receipt_publication_visibility'
       ]::text[] <> '{}'::jsonb
       OR pg_catalog.jsonb_typeof(v_replay->'contract_version') <> 'number'
       OR pg_catalog.jsonb_typeof(v_replay->'state') <> 'string'
       OR pg_catalog.jsonb_typeof(v_replay->'draft_id') <> 'string'
       OR pg_catalog.jsonb_typeof(v_replay->'previous_draft_version') <> 'number'
       OR pg_catalog.jsonb_typeof(v_replay->'draft_version') <> 'number'
       OR pg_catalog.jsonb_typeof(v_replay->'visibility') <> 'string'
       OR pg_catalog.jsonb_typeof(v_replay->'privacy_fail_closed') <> 'boolean'
       OR NOT (v_replay->>'draft_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       OR NOT (v_replay->>'previous_draft_version' ~ '^[1-9][0-9]{0,15}$')
       OR NOT (v_replay->>'draft_version' ~ '^[1-9][0-9]{0,15}$')
       OR (v_replay->>'previous_draft_version')::bigint > 9007199254740991
       OR (v_replay->>'draft_version')::bigint > 9007199254740991
       OR (v_replay->>'visibility') NOT IN ('participants_only', 'all_event')
       OR (v_replay->'publication_id' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'publication_id') <> 'string'
         OR NOT (v_replay->>'publication_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       ))
       OR (v_replay->'previous_publication_version' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'previous_publication_version') <> 'number'
         OR NOT (v_replay->>'previous_publication_version' ~ '^[1-9][0-9]{0,15}$')
         OR (v_replay->>'previous_publication_version')::bigint > 9007199254740991
       ))
       OR (v_replay->'publication_version' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'publication_version') <> 'number'
         OR NOT (v_replay->>'publication_version' ~ '^[1-9][0-9]{0,15}$')
         OR (v_replay->>'publication_version')::bigint > 9007199254740991
       ))
       OR (v_replay->'previous_event_id' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'previous_event_id') <> 'string'
         OR NOT (v_replay->>'previous_event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       ))
       OR (v_replay->'event_id' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'event_id') <> 'string'
         OR NOT (v_replay->>'event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       ))
       OR (v_replay->'previous_event_roster_revision' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'previous_event_roster_revision') <> 'number'
         OR NOT (v_replay->>'previous_event_roster_revision' ~ '^[1-9][0-9]{0,15}$')
         OR (v_replay->>'previous_event_roster_revision')::bigint > 9007199254740991
       ))
       OR (v_replay->'event_roster_revision' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'event_roster_revision') <> 'number'
         OR NOT (v_replay->>'event_roster_revision' ~ '^[1-9][0-9]{0,15}$')
         OR (v_replay->>'event_roster_revision')::bigint > 9007199254740991
       ))
       OR (v_replay->'receipt_publication_is_live' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_replay->'receipt_publication_is_live') <> 'boolean')
       OR (v_replay->'receipt_publication_event_id' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'receipt_publication_event_id') <> 'string'
         OR NOT (v_replay->>'receipt_publication_event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       ))
       OR (v_replay->'receipt_publication_event_roster_revision' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'receipt_publication_event_roster_revision') <> 'number'
         OR NOT (v_replay->>'receipt_publication_event_roster_revision' ~ '^[1-9][0-9]{0,15}$')
         OR (v_replay->>'receipt_publication_event_roster_revision')::bigint > 9007199254740991
       ))
       OR (v_replay->'receipt_publication_visibility' <> 'null'::jsonb AND (
         pg_catalog.jsonb_typeof(v_replay->'receipt_publication_visibility') <> 'string'
         OR (v_replay->>'receipt_publication_visibility') NOT IN ('participants_only', 'all_event')
       ))
       OR ((v_replay->'publication_id' = 'null'::jsonb) IS DISTINCT FROM
         (v_replay->'publication_version' = 'null'::jsonb))
       OR ((v_replay->'publication_id' = 'null'::jsonb) IS DISTINCT FROM
         (v_replay->'previous_publication_version' = 'null'::jsonb))
       OR ((v_replay->'publication_id' = 'null'::jsonb) IS DISTINCT FROM
         (v_replay->'receipt_publication_is_live' = 'null'::jsonb))
       OR ((v_replay->'publication_id' = 'null'::jsonb) IS DISTINCT FROM
         (v_replay->'receipt_publication_visibility' = 'null'::jsonb))
       OR ((v_replay->'receipt_publication_event_id' = 'null'::jsonb) IS DISTINCT FROM
         (v_replay->'receipt_publication_event_roster_revision' = 'null'::jsonb))
       OR ((v_replay->'previous_event_id' = 'null'::jsonb) IS DISTINCT FROM
         (v_replay->'previous_event_roster_revision' = 'null'::jsonb))
       OR ((v_replay->'event_id' = 'null'::jsonb) IS DISTINCT FROM
         (v_replay->'event_roster_revision' = 'null'::jsonb))
       OR v_replay->>'contract_version' <> '1'
       OR v_replay->>'state' <> 'event_relation_set'
       OR v_replay->>'draft_id' IS DISTINCT FROM p_draft_id::text
       OR (v_replay->>'previous_draft_version')::bigint
         <> p_expected_draft_version
       OR (v_replay->>'previous_publication_version')::bigint
         IS DISTINCT FROM p_expected_publication_version
       OR (v_replay->>'previous_event_id')::uuid
         IS DISTINCT FROM p_expected_event_id
       OR (v_replay->>'previous_event_roster_revision')::bigint
         IS DISTINCT FROM p_expected_event_roster_revision
       OR (v_replay->>'event_id')::uuid IS DISTINCT FROM p_new_event_id
       OR (v_replay->>'event_roster_revision')::bigint
         IS DISTINCT FROM p_new_event_roster_revision THEN
      RAISE EXCEPTION 'expense_draft_event_replay_invalid';
    END IF;
    SELECT draft_row.* INTO v_draft
    FROM public.expense_private_drafts AS draft_row
    WHERE draft_row.id = p_draft_id
      AND draft_row.actor_user_id = p_actor_id;
    IF v_draft.id IS NULL
       OR v_draft.version <> (v_replay->>'draft_version')::bigint
       OR v_draft.payload->>'eventVisibility' IS DISTINCT FROM v_replay->>'visibility'
       OR public.expense_sql162_event_relation_tuple(v_draft.payload)
         <> pg_catalog.jsonb_build_object(
           'link_to_event', p_new_event_id IS NOT NULL,
           'event_id', p_new_event_id,
           'event_roster_revision', p_new_event_roster_revision
         ) THEN
      RAISE EXCEPTION 'expense_draft_event_replay_stale';
    END IF;
    SELECT publication_row.* INTO v_publication
    FROM public.expense_unconfirmed_publications AS publication_row
    WHERE publication_row.draft_id = p_draft_id;
    IF (v_replay->'publication_id' = 'null'::jsonb AND v_publication.draft_id IS NOT NULL)
       OR (v_replay->'publication_id' <> 'null'::jsonb AND (
         v_publication.draft_id IS NULL
         OR v_publication.publication_id IS DISTINCT FROM (v_replay->>'publication_id')::uuid
         OR v_publication.publication_version IS DISTINCT FROM
           (v_replay->>'publication_version')::bigint
         OR v_publication.is_live IS DISTINCT FROM
           (v_replay->>'receipt_publication_is_live')::boolean
         OR v_publication.event_id IS DISTINCT FROM
           (v_replay->>'receipt_publication_event_id')::uuid
         OR v_publication.event_roster_revision IS DISTINCT FROM
           (v_replay->>'receipt_publication_event_roster_revision')::bigint
         OR v_publication.visibility IS DISTINCT FROM
           v_replay->>'receipt_publication_visibility'
       )) THEN
      RAISE EXCEPTION 'expense_draft_event_replay_stale';
    END IF;
    IF p_new_event_id IS NOT NULL THEN
      PERFORM public.expense_sql162_assert_event_context(
        p_actor_id, p_new_event_id, p_new_event_roster_revision
      );
    END IF;
    RETURN v_replay - ARRAY[
      'receipt_publication_is_live', 'receipt_publication_event_id',
      'receipt_publication_event_roster_revision',
      'receipt_publication_visibility'
    ]::text[];
  END IF;

  v_gate_event_id := COALESCE(p_new_event_id, p_expected_event_id);
  IF v_gate_event_id IS NOT NULL THEN
    v_event_request_id := public.expense_identity_request_id(
      'expense-sql162-relation-event-gate-v1', p_request_id
    );
    v_event_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
      'operation', 'expense_set_private_draft_event_relation_v1',
      'outerFingerprint', v_fingerprint,
      'eventId', v_gate_event_id
    )::text);
    v_event_replay := public.teskeid_event_begin_request(
      p_actor_id, v_event_request_id,
      'expense_sql162_relation_gate_v1', v_event_fingerprint, true
    );
    IF v_event_replay IS NOT NULL THEN
      RAISE EXCEPTION 'expense_draft_event_receipt_conflict';
    END IF;
  END IF;

  SELECT draft_row.* INTO v_draft
  FROM public.expense_private_drafts AS draft_row
  WHERE draft_row.id = p_draft_id
    AND draft_row.actor_user_id = p_actor_id
  FOR UPDATE;
  IF v_draft.id IS NULL OR v_draft.context_type <> 'one_off'
     OR v_draft.group_id IS NOT NULL OR v_draft.expense_id IS NOT NULL THEN
    RAISE EXCEPTION 'expense_draft_event_not_found';
  END IF;
  IF v_draft.version <> p_expected_draft_version
     OR v_draft.version = 9007199254740991 THEN
    RAISE EXCEPTION 'expense_draft_event_conflict';
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, v_draft.context_type, v_draft.group_id, v_draft.expense_id
  );
  v_old_tuple := public.expense_sql162_event_relation_tuple(v_draft.payload);
  IF (v_old_tuple->>'link_to_event')::boolean
       IS DISTINCT FROM (p_expected_event_id IS NOT NULL)
     OR (v_old_tuple->>'event_id')::uuid IS DISTINCT FROM p_expected_event_id
     OR (v_old_tuple->>'event_roster_revision')::bigint
       IS DISTINCT FROM p_expected_event_roster_revision THEN
    RAISE EXCEPTION 'expense_draft_event_conflict';
  END IF;

  SELECT publication_row.* INTO v_publication
  FROM public.expense_unconfirmed_publications AS publication_row
  WHERE publication_row.draft_id = p_draft_id
  FOR UPDATE;
  IF v_publication.draft_id IS NULL THEN
    IF p_expected_publication_version IS NOT NULL THEN
      RAISE EXCEPTION 'expense_draft_event_publication_conflict';
    END IF;
  ELSIF v_publication.actor_user_id IS DISTINCT FROM p_actor_id
     OR p_expected_publication_version IS NULL
     OR v_publication.publication_version
       <> p_expected_publication_version
     OR v_publication.is_live IS DISTINCT FROM p_expected_publication_is_live
     OR v_publication.publication_version = 9007199254740991 THEN
    RAISE EXCEPTION 'expense_draft_event_publication_conflict';
  END IF;
  PERFORM 1 FROM public.expense_unconfirmed_publication_parties AS party
    WHERE party.draft_id = p_draft_id ORDER BY party.ordinal FOR UPDATE;
  PERFORM 1 FROM public.expense_unconfirmed_publication_audience AS audience
    WHERE audience.draft_id = p_draft_id ORDER BY audience.user_id FOR UPDATE;

  -- Deterministic Event row locks prevent a roster revision from changing
  -- between context validation and commit. Removal does not require current
  -- authority over the old Event, only exact ownership/version of the draft.
  PERFORM 1 FROM public.teskeid_events AS event_row
  WHERE event_row.id IN (p_expected_event_id, p_new_event_id)
  ORDER BY event_row.id FOR UPDATE;

  IF p_new_event_id IS NOT NULL THEN
    v_new_source := public.expense_sql162_assert_event_context(
      p_actor_id, p_new_event_id, p_new_event_roster_revision
    );
  END IF;
  IF p_expected_event_id IS DISTINCT FROM p_new_event_id
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(v_draft.payload->'members') AS member(value)
       WHERE member.value->'input'->>'type' = 'event_guest'
         AND (
           p_new_event_id IS NULL
           OR NOT EXISTS (
             SELECT 1
             FROM pg_catalog.jsonb_array_elements(v_new_source->'people') AS person(value)
             WHERE person.value->>'legacy_person_ref'
               = member.value->'input'->>'event_guest_id'
               AND COALESCE(
                 (person.value->'shared'->>'selectable')::boolean, false
               )
           )
         )
     ) THEN
    RAISE EXCEPTION 'expense_draft_event_identity_conflict';
  END IF;

  IF p_expected_event_id IS NOT DISTINCT FROM p_new_event_id
     AND p_expected_event_roster_revision
       IS NOT DISTINCT FROM p_new_event_roster_revision THEN
    v_new_draft_version := v_draft.version;
    v_new_publication_version := v_publication.publication_version;
    v_visibility := CASE WHEN v_publication.is_live
      THEN v_publication.visibility
      ELSE COALESCE(v_draft.payload->>'eventVisibility', 'participants_only')
    END;
  ELSE
    IF v_publication.is_live AND v_publication.source_draft_version
         IS DISTINCT FROM v_draft.version THEN
      RAISE EXCEPTION 'expense_draft_event_unshared_changes';
    END IF;
    v_new_payload := pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          v_draft.payload,
          ARRAY['eventId']::text[],
          CASE WHEN p_new_event_id IS NULL THEN 'null'::jsonb
            ELSE pg_catalog.to_jsonb(p_new_event_id) END,
          true
        ),
        ARRAY['eventRosterRevision']::text[],
        CASE WHEN p_new_event_roster_revision IS NULL THEN 'null'::jsonb
          ELSE pg_catalog.to_jsonb(p_new_event_roster_revision) END,
        true
      ),
      ARRAY['linkToEvent']::text[],
      pg_catalog.to_jsonb(p_new_event_id IS NOT NULL),
      true
    );
    v_privacy_fail_closed := COALESCE(
      v_publication.is_live
        AND v_publication.visibility = 'all_event'
        AND p_new_event_id IS NULL,
      false
    );
    IF v_privacy_fail_closed THEN
      v_new_payload := pg_catalog.jsonb_set(
        v_new_payload,
        ARRAY['eventVisibility']::text[],
        pg_catalog.to_jsonb('participants_only'::text),
        true
      );
    END IF;
    v_new_draft_version := v_draft.version + 1;
    UPDATE public.expense_private_drafts AS draft_row
    SET payload = v_new_payload,
        version = v_new_draft_version,
        updated_at = pg_catalog.now()
    WHERE draft_row.id = p_draft_id
      AND draft_row.actor_user_id = p_actor_id
      AND draft_row.version = p_expected_draft_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'expense_draft_event_conflict'; END IF;

    IF v_publication.is_live THEN
      v_new_normalized := public.expense_sql159_normalize_private_draft(
        p_actor_id, p_draft_id, false
      );
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'ordinal', party.ordinal,
        'party_key_hash', party.party_key_hash,
        'identity_token_hash', party.identity_token_hash,
        'display_name', party.display_name,
        'is_author', party.is_author,
        'is_payer', party.is_payer,
        'is_participant', party.is_participant,
        'paid_minor', party.paid_minor,
        'share_minor', party.share_minor
      ) ORDER BY party.ordinal), '[]'::jsonb)
      INTO v_existing_parties
      FROM public.expense_unconfirmed_publication_parties AS party
      WHERE party.draft_id = p_draft_id;
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', audience.user_id,
        'audience_kind', audience.audience_kind,
        'identity_token_hash', audience.identity_token_hash,
        'binding_id', audience.binding_id,
        'binding_generation', audience.binding_generation
      ) ORDER BY audience.user_id), '[]'::jsonb)
      INTO v_existing_audience
      FROM public.expense_unconfirmed_publication_audience AS audience
      WHERE audience.draft_id = p_draft_id;
      IF v_new_normalized->'parties' IS DISTINCT FROM v_existing_parties
         OR v_new_normalized->'audience' IS DISTINCT FROM v_existing_audience THEN
        RAISE EXCEPTION 'expense_draft_event_identity_conflict';
      END IF;
      v_visibility := CASE WHEN v_privacy_fail_closed
        THEN 'participants_only' ELSE v_publication.visibility END;
      IF v_new_normalized->>'visibility' IS DISTINCT FROM v_visibility THEN
        RAISE EXCEPTION 'expense_draft_event_visibility_conflict';
      END IF;
      v_new_publication_version := v_publication.publication_version + 1;
      UPDATE public.expense_unconfirmed_publications AS publication_row
      SET publication_version = v_new_publication_version,
          source_draft_version = v_new_draft_version,
          shareable_fingerprint = v_new_normalized->>'shareable_fingerprint',
          authority_fingerprint = v_new_normalized->>'authority_fingerprint',
          event_id = (v_new_normalized->>'event_id')::uuid,
          event_roster_revision =
            (v_new_normalized->>'event_roster_revision')::bigint,
          link_to_event = (v_new_normalized->>'link_to_event')::boolean,
          visibility = v_visibility,
          updated_at = pg_catalog.now()
      WHERE publication_row.draft_id = p_draft_id
        AND publication_row.publication_version
          = p_expected_publication_version;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'expense_draft_event_publication_conflict';
      END IF;
    ELSE
      v_new_publication_version := v_publication.publication_version;
      v_visibility := COALESCE(
        v_new_payload->>'eventVisibility', 'participants_only'
      );
    END IF;
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'state', 'event_relation_set',
    'draft_id', p_draft_id,
    'previous_draft_version', p_expected_draft_version,
    'draft_version', v_new_draft_version,
    'publication_id', v_publication.publication_id,
    'previous_publication_version', p_expected_publication_version,
    'publication_version', v_new_publication_version,
    'previous_event_id', p_expected_event_id,
    'previous_event_roster_revision', p_expected_event_roster_revision,
    'event_id', p_new_event_id,
    'event_roster_revision', p_new_event_roster_revision,
    'visibility', v_visibility,
    'privacy_fail_closed', v_privacy_fail_closed
  );
  IF v_event_request_id IS NOT NULL THEN
    PERFORM public.teskeid_event_finish_request(
      p_actor_id, v_event_request_id, v_result
    );
  END IF;
  v_receipt := v_result || pg_catalog.jsonb_build_object(
    'receipt_publication_is_live', CASE
      WHEN v_publication.draft_id IS NULL THEN NULL
      ELSE v_publication.is_live
    END,
    'receipt_publication_event_id', CASE
      WHEN v_publication.draft_id IS NULL THEN NULL
      WHEN v_publication.is_live THEN p_new_event_id
      ELSE v_publication.event_id
    END,
    'receipt_publication_event_roster_revision', CASE
      WHEN v_publication.draft_id IS NULL THEN NULL
      WHEN v_publication.is_live THEN p_new_event_roster_revision
      ELSE v_publication.event_roster_revision
    END,
    'receipt_publication_visibility', CASE
      WHEN v_publication.draft_id IS NULL THEN NULL
      WHEN v_publication.is_live THEN v_visibility
      ELSE v_publication.visibility
    END
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_receipt);
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.expense_sql162_event_relation_tuple(jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_source_v3(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_sql162_assert_event_context(uuid,uuid,bigint)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_expense_contexts_v1(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_expense_link_management_v2(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_attach_expense_v2(
  uuid,uuid,uuid,uuid,bigint,bigint,text
) OWNER TO postgres;
ALTER FUNCTION public.expense_set_private_draft_event_relation_v1(
  uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint
) OWNER TO postgres;
ALTER FUNCTION public.expense_save_private_draft(
  uuid,uuid,text,uuid,uuid,text,jsonb,bigint
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.expense_sql162_event_relation_tuple(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_source_v3(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_sql162_assert_event_context(uuid,uuid,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_list_expense_contexts_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_get_expense_link_management_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_source_v3(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_list_expense_contexts_v1(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_expense_link_management_v2(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)
  TO service_role;

COMMENT ON FUNCTION public.teskeid_event_list_attachable_expenses_v1(uuid,uuid,bigint)
  IS 'SQL162 bounded discovery only; SQL157 V2 remains attach authority.';
COMMENT ON FUNCTION public.teskeid_event_list_expense_contexts_v1(uuid)
  IS 'SQL162 bounded owner/current-accepted-attendee Event context discovery.';
COMMENT ON FUNCTION public.teskeid_event_get_expense_source_v3(uuid,uuid)
  IS 'SQL162 exact current-attendance Event source for the Expense form.';
COMMENT ON FUNCTION public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)
  IS 'SQL149 wire compatibility delegated to SQL162 current-attendance source.';
COMMENT ON FUNCTION public.teskeid_event_get_expense_link_management_v2(uuid,uuid)
  IS 'SQL157 V2 shape with SQL153 current Event-context authority; Expense authority unchanged.';
COMMENT ON FUNCTION public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)
  IS 'SQL157 V2 attach with SQL153 current Event-context authority; Expense authority unchanged.';
COMMENT ON FUNCTION public.expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)
  IS 'SQL162 atomic Event relation transition without financial or lifecycle authority.';

COMMIT;

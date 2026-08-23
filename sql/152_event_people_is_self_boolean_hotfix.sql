-- SQL152_EVENT_PEOPLE_IS_SELF_BOOLEAN_HOTFIX
--
-- SQL149 passed nullable SQL equality into the strict `is_self` JSON field.
-- For an unbound participant `recipient_user_id = p_actor_id` is NULL, not
-- false. Replace the exact people projection and preserve every identity,
-- access, RSVP and destination boundary.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Serialize against SQL149 recovery and the SQL150/SQL151 successor lineage.
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'teskeid:sql149:event-participant-identity-display', 14901
  )
);
SELECT pg_catalog.pg_advisory_xact_lock(15001);

DO $sql152_preflight$
DECLARE
  v_function_oid oid;
  v_source_md5 text;
  v_dependency record;
  v_dependency_oid oid;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'sql152_server_version_mismatch';
  END IF;
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sql152_executor_mismatch';
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_private_people_projection_v2(uuid,uuid,text)'
  );
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'sql152_predecessor_missing';
  END IF;
  SELECT pg_catalog.md5(pg_catalog.replace(
    procedure_row.prosrc, E'\r\n', E'\n'
  )) INTO v_source_md5
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = v_function_oid;
  IF v_source_md5 NOT IN (
    '2eb6db6c327de83f1bf241f9368c3a0c',
    '7a41340baed779873454dff86889ea9b'
  ) THEN
    RAISE EXCEPTION 'sql152_predecessor_body_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = v_function_oid
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = 'plpgsql'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 's'
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        'p_actor_id uuid, p_event_id uuid, p_viewer_role text'
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname =
            'teskeid_event_private_people_projection_v2'
      ) = 1
  ) THEN
    RAISE EXCEPTION 'sql152_predecessor_shape_mismatch';
  END IF;
  IF pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         procedure_row.proacl,
         pg_catalog.acldefault('f', procedure_row.proowner)
       )) AS privilege
       WHERE procedure_row.oid = v_function_oid
         AND (
           privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.grantee <> procedure_row.proowner
           OR privilege.is_grantable
         )
     ) THEN
    RAISE EXCEPTION 'sql152_predecessor_acl_mismatch';
  END IF;

  FOR v_dependency IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_get_actor_view_v2(uuid,uuid)',
        'teskeid_event_get_actor_view_v2',
        'df539138c44252719575a9d0d090968b', 'v',
        'p_actor_id uuid, p_event_id uuid', true),
      ('public.teskeid_event_get_person_source_roster_v2(uuid,uuid)',
        'teskeid_event_get_person_source_roster_v2',
        '3c689e2f05035a67d58fbb8ca39dcd40', 'v',
        'p_actor_id uuid, p_event_id uuid', true),
      ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)',
        'teskeid_event_private_person_projection_v2',
        'dd6d4f6b57c109fb46d6992ce66462e8', 's',
        'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_position integer, p_is_self boolean', false),
      ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)',
        'teskeid_event_private_organizer_projection_v2',
        'd42c11caf87eaac45646535539029977', 's',
        'p_actor_id uuid, p_event_id uuid, p_position integer', false),
      ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)',
        'teskeid_event_private_viewer_relationship_v2',
        'cfb3afa33af8fd230e6c26930424387f', 's',
        'p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text', false)
    ) AS expected(
      signature, function_name, source_md5, volatility,
      arguments, service_execute
    )
  LOOP
    v_dependency_oid := pg_catalog.to_regprocedure(v_dependency.signature);
    IF v_dependency_oid IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = procedure_row.proowner
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE procedure_row.oid = v_dependency_oid
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = v_dependency.source_md5
        AND owner_role.rolname = 'postgres'
        AND language_row.lanname = 'plpgsql'
        AND procedure_row.prokind = 'f'
        AND procedure_row.prosecdef
        AND NOT procedure_row.proisstrict
        AND NOT procedure_row.proleakproof
        AND NOT procedure_row.proretset
        AND procedure_row.pronargdefaults = 0
        AND procedure_row.provolatile = v_dependency.volatility
        AND procedure_row.proparallel = 'u'
        AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
        AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
          v_dependency.arguments
        AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
        AND (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.pg_proc AS overload
          WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
            AND overload.proname = v_dependency.function_name
        ) = 1
        AND pg_catalog.has_function_privilege(
          'service_role', procedure_row.oid, 'EXECUTE'
        ) = v_dependency.service_execute
        AND NOT pg_catalog.has_function_privilege(
          'anon', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', procedure_row.oid, 'EXECUTE'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = privilege.grantee
          WHERE privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.is_grantable
             OR (
               privilege.grantee <> procedure_row.proowner
               AND (
                 NOT v_dependency.service_execute
                 OR grantee.rolname IS DISTINCT FROM 'service_role'
               )
             )
        )
    ) THEN
      RAISE EXCEPTION 'sql152_dependency_mismatch:%',
        v_dependency.signature;
    END IF;
  END LOOP;

  IF COALESCE(NULL::boolean, false) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'sql152_coalesce_expression_unavailable';
  END IF;
END;
$sql152_preflight$;

CREATE OR REPLACE FUNCTION public.teskeid_event_private_people_projection_v2(
  p_actor_id uuid,
  p_event_id uuid,
  p_viewer_role text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_people jsonb;
BEGIN
  IF p_viewer_role NOT IN ('owner', 'attendee') THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  WITH guest_positions AS (
    SELECT
      guest.id AS event_guest_id,
      participation.recipient_user_id,
      (pg_catalog.row_number() OVER (
        ORDER BY guest.position, guest.id
      ))::integer AS position
    FROM public.teskeid_event_guests AS guest
    JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = guest.event_id
     AND participation.event_guest_id = guest.id
    WHERE guest.event_id = p_event_id
      AND guest.status = 'active'
      AND (p_viewer_role = 'owner' OR participation.access_state = 'active')
  ), projected AS (
    SELECT 0 AS position,
      public.teskeid_event_private_organizer_projection_v2(
        p_actor_id, p_event_id, 0
      ) AS person
    UNION ALL
    SELECT guest_position.position,
      public.teskeid_event_private_person_projection_v2(
        p_actor_id, p_event_id, guest_position.event_guest_id,
        guest_position.position,
        COALESCE(guest_position.recipient_user_id = p_actor_id, false)
      ) AS person
    FROM guest_positions AS guest_position
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    projected.person ORDER BY projected.position
  ), '[]'::jsonb)
  INTO v_people
  FROM projected;
  IF pg_catalog.jsonb_array_length(v_people) < 1
     OR pg_catalog.jsonb_array_length(v_people) > 50 THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_people;
END;
$function$;

ALTER FUNCTION public.teskeid_event_private_people_projection_v2(
  uuid,uuid,text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION
  public.teskeid_event_private_people_projection_v2(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;

DO $sql152_postflight$
DECLARE
  v_function_oid oid;
  v_dependency record;
  v_dependency_oid oid;
BEGIN
  v_function_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_private_people_projection_v2(uuid,uuid,text)'
  );
  IF v_function_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = v_function_oid
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = '7a41340baed779873454dff86889ea9b'
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = 'plpgsql'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 's'
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        'p_actor_id uuid, p_event_id uuid, p_viewer_role text'
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname =
            'teskeid_event_private_people_projection_v2'
      ) = 1
  ) THEN
    RAISE EXCEPTION 'sql152_postflight_shape_mismatch';
  END IF;
  IF pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         procedure_row.proacl,
         pg_catalog.acldefault('f', procedure_row.proowner)
       )) AS privilege
       WHERE procedure_row.oid = v_function_oid
         AND (
           privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.grantee <> procedure_row.proowner
           OR privilege.is_grantable
         )
     ) THEN
    RAISE EXCEPTION 'sql152_postflight_acl_mismatch';
  END IF;

  FOR v_dependency IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_get_actor_view_v2(uuid,uuid)',
        'teskeid_event_get_actor_view_v2',
        'df539138c44252719575a9d0d090968b', 'v',
        'p_actor_id uuid, p_event_id uuid', true),
      ('public.teskeid_event_get_person_source_roster_v2(uuid,uuid)',
        'teskeid_event_get_person_source_roster_v2',
        '3c689e2f05035a67d58fbb8ca39dcd40', 'v',
        'p_actor_id uuid, p_event_id uuid', true),
      ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)',
        'teskeid_event_private_person_projection_v2',
        'dd6d4f6b57c109fb46d6992ce66462e8', 's',
        'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_position integer, p_is_self boolean', false),
      ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)',
        'teskeid_event_private_organizer_projection_v2',
        'd42c11caf87eaac45646535539029977', 's',
        'p_actor_id uuid, p_event_id uuid, p_position integer', false),
      ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)',
        'teskeid_event_private_viewer_relationship_v2',
        'cfb3afa33af8fd230e6c26930424387f', 's',
        'p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text', false)
    ) AS expected(
      signature, function_name, source_md5, volatility,
      arguments, service_execute
    )
  LOOP
    v_dependency_oid := pg_catalog.to_regprocedure(v_dependency.signature);
    IF v_dependency_oid IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = procedure_row.proowner
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE procedure_row.oid = v_dependency_oid
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = v_dependency.source_md5
        AND owner_role.rolname = 'postgres'
        AND language_row.lanname = 'plpgsql'
        AND procedure_row.prokind = 'f'
        AND procedure_row.prosecdef
        AND NOT procedure_row.proisstrict
        AND NOT procedure_row.proleakproof
        AND NOT procedure_row.proretset
        AND procedure_row.pronargdefaults = 0
        AND procedure_row.provolatile = v_dependency.volatility
        AND procedure_row.proparallel = 'u'
        AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
        AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
          v_dependency.arguments
        AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
        AND (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.pg_proc AS overload
          WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
            AND overload.proname = v_dependency.function_name
        ) = 1
        AND pg_catalog.has_function_privilege(
          'service_role', procedure_row.oid, 'EXECUTE'
        ) = v_dependency.service_execute
        AND NOT pg_catalog.has_function_privilege(
          'anon', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', procedure_row.oid, 'EXECUTE'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = privilege.grantee
          WHERE privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.is_grantable
             OR (
               privilege.grantee <> procedure_row.proowner
               AND (
                 NOT v_dependency.service_execute
                 OR grantee.rolname IS DISTINCT FROM 'service_role'
               )
             )
        )
    ) THEN
      RAISE EXCEPTION 'sql152_postflight_dependency_mismatch:%',
        v_dependency.signature;
    END IF;
  END LOOP;

  IF COALESCE(NULL::boolean, false) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'sql152_postflight_coalesce_mismatch';
  END IF;
END;
$sql152_postflight$;

COMMIT;

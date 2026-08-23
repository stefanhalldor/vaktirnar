-- SQL150_EVENT_ACTOR_VIEW_TIME_FORMAT_HOTFIX
--
-- Additive hotfix for the SQL149 Event actor-view projection. PostgreSQL has
-- no to_char(time without time zone, text) overload. The SQL149 PL/pgSQL body
-- was therefore accepted at CREATE FUNCTION time but failed when the detail
-- query was first planned at runtime. Convert the time to a fixed-date
-- timestamp before formatting it.
--
-- This migration changes one function body only. It does not touch Event
-- data, RLS, tables, indexes, triggers, auth rows or Expense state.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_catalog.pg_advisory_xact_lock(15001);

DO $sql150_preflight$
DECLARE
  v_function_oid oid;
  v_source_md5 text;
  v_dependency record;
  v_dependency_oid oid;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'sql150_server_version_mismatch';
  END IF;
  IF current_user <> 'postgres'
     OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sql150_executor_mismatch';
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_get_actor_view_v2(uuid,uuid)'
  );
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'sql150_predecessor_missing';
  END IF;

  SELECT pg_catalog.md5(pg_catalog.replace(
    procedure_row.prosrc, E'\r\n', E'\n'
  ))
  INTO v_source_md5
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = v_function_oid;

  -- Accept the exact SQL149 predecessor or an exact replay of SQL150 only.
  IF v_source_md5 NOT IN (
    'eb2da9a9c2c0463f76636ded02a6747a',
    'df539138c44252719575a9d0d090968b'
  ) THEN
    RAISE EXCEPTION 'sql150_predecessor_body_mismatch';
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
      AND procedure_row.provolatile = 'v'
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        'p_actor_id uuid, p_event_id uuid'
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace =
          pg_catalog.to_regnamespace('public')
          AND overload.proname = 'teskeid_event_get_actor_view_v2'
      ) = 1
  ) THEN
    RAISE EXCEPTION 'sql150_predecessor_shape_mismatch';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon', v_function_oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         procedure_row.proacl,
         pg_catalog.acldefault('f', procedure_row.proowner)
       )) AS privilege
       JOIN pg_catalog.pg_roles AS grantee
         ON grantee.oid = privilege.grantee
       WHERE procedure_row.oid = v_function_oid
         AND grantee.rolname = 'service_role'
         AND privilege.privilege_type = 'EXECUTE'
         AND NOT privilege.is_grantable
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         procedure_row.proacl,
         pg_catalog.acldefault('f', procedure_row.proowner)
       )) AS privilege
       LEFT JOIN pg_catalog.pg_roles AS grantee
         ON grantee.oid = privilege.grantee
       WHERE procedure_row.oid = v_function_oid
         AND (
           privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
         )
     ) THEN
    RAISE EXCEPTION 'sql150_predecessor_acl_mismatch';
  END IF;

  FOR v_dependency IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_private_normalize_shared_name_v2(text)',
        'd118ab08bc0346cdf31519344a2f65a7'),
      ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)',
        '7017190619681901af3813e1fc3b305c'),
      ('public.teskeid_event_private_claim_participations_v2(uuid)',
        'b57bf9fa43754dfcd05cb7e063829bc6'),
      ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)',
        '211fbfb65b4edaa4b0307c2fb5878a60'),
      ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',
        '2eb6db6c327de83f1bf241f9368c3a0c')
    ) AS expected(signature, source_md5)
  LOOP
    v_dependency_oid := pg_catalog.to_regprocedure(v_dependency.signature);
    IF v_dependency_oid IS NULL OR (
      SELECT pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      ))
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = v_dependency_oid
    ) IS DISTINCT FROM v_dependency.source_md5 THEN
      RAISE EXCEPTION 'sql150_dependency_mismatch:%',
        v_dependency.signature;
    END IF;
  END LOOP;

  IF pg_catalog.to_char(
    date '2000-01-01' + time '04:05:06', 'HH24:MI:SS'
  ) IS DISTINCT FROM '04:05:06' THEN
    RAISE EXCEPTION 'sql150_time_formatter_unavailable';
  END IF;
END;
$sql150_preflight$;

CREATE OR REPLACE FUNCTION public.teskeid_event_get_actor_view_v2(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_private_claim_participations_v2(p_actor_id);
  v_role := public.teskeid_event_private_assert_viewer_v2(
    p_actor_id, p_event_id
  );
  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', public.teskeid_event_private_normalize_shared_name_v2(
      event_row.name
    ),
    'roster_revision', event_row.roster_revision::text,
    'viewer_role', v_role,
    'created_at', public.teskeid_event_private_format_utc_timestamp_v2(
      event_row.created_at
    ),
    'updated_at', public.teskeid_event_private_format_utc_timestamp_v2(
      event_row.updated_at
    ),
    'event_date', details.event_date,
    'event_time', CASE WHEN details.event_time IS NULL THEN NULL
      ELSE pg_catalog.to_char(
        date '2000-01-01' + details.event_time, 'HH24:MI:SS'
      ) END,
    'description', NULLIF(
      public.teskeid_event_private_normalize_shared_name_v2(
        pg_catalog.replace(pg_catalog.replace(
          details.description, E'\r\n', E'\n'
        ), E'\r', E'\n')
      ), ''
    ),
    'agenda', NULLIF(
      public.teskeid_event_private_normalize_shared_name_v2(
        pg_catalog.replace(pg_catalog.replace(
          details.agenda, E'\r\n', E'\n'
        ), E'\r', E'\n')
      ), ''
    ),
    'people', public.teskeid_event_private_people_projection_v2(
      p_actor_id, event_row.id, v_role
    )
  ) INTO v_result
  FROM public.teskeid_events AS event_row
  LEFT JOIN public.teskeid_event_details AS details
    ON details.event_id = event_row.id
  WHERE event_row.id = p_event_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.teskeid_event_get_actor_view_v2(uuid,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION
  public.teskeid_event_get_actor_view_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_get_actor_view_v2(uuid,uuid)
  TO service_role;

DO $sql150_postflight$
DECLARE
  v_function_oid oid;
  v_dependency record;
  v_dependency_oid oid;
BEGIN
  v_function_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_get_actor_view_v2(uuid,uuid)'
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
      )) =
        'df539138c44252719575a9d0d090968b'
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = 'plpgsql'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 'v'
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        'p_actor_id uuid, p_event_id uuid'
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace =
          pg_catalog.to_regnamespace('public')
          AND overload.proname = 'teskeid_event_get_actor_view_v2'
      ) = 1
  ) THEN
    RAISE EXCEPTION 'sql150_postflight_shape_mismatch';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon', v_function_oid, 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         procedure_row.proacl,
         pg_catalog.acldefault('f', procedure_row.proowner)
       )) AS privilege
       JOIN pg_catalog.pg_roles AS grantee
         ON grantee.oid = privilege.grantee
       WHERE procedure_row.oid = v_function_oid
         AND grantee.rolname = 'service_role'
         AND privilege.privilege_type = 'EXECUTE'
         AND NOT privilege.is_grantable
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         procedure_row.proacl,
         pg_catalog.acldefault('f', procedure_row.proowner)
       )) AS privilege
       LEFT JOIN pg_catalog.pg_roles AS grantee
         ON grantee.oid = privilege.grantee
       WHERE procedure_row.oid = v_function_oid
         AND (
           privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
         )
     ) THEN
    RAISE EXCEPTION 'sql150_postflight_acl_mismatch';
  END IF;
  FOR v_dependency IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_private_normalize_shared_name_v2(text)',
        'd118ab08bc0346cdf31519344a2f65a7'),
      ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)',
        '7017190619681901af3813e1fc3b305c'),
      ('public.teskeid_event_private_claim_participations_v2(uuid)',
        'b57bf9fa43754dfcd05cb7e063829bc6'),
      ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)',
        '211fbfb65b4edaa4b0307c2fb5878a60'),
      ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',
        '2eb6db6c327de83f1bf241f9368c3a0c')
    ) AS expected(signature, source_md5)
  LOOP
    v_dependency_oid := pg_catalog.to_regprocedure(v_dependency.signature);
    IF v_dependency_oid IS NULL OR (
      SELECT pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      ))
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = v_dependency_oid
    ) IS DISTINCT FROM v_dependency.source_md5 THEN
      RAISE EXCEPTION 'sql150_postflight_dependency_mismatch:%',
        v_dependency.signature;
    END IF;
  END LOOP;
  IF pg_catalog.to_char(
    date '2000-01-01' + time '04:05:06', 'HH24:MI:SS'
  ) IS DISTINCT FROM '04:05:06' THEN
    RAISE EXCEPTION 'sql150_postflight_formatter_mismatch';
  END IF;
END;
$sql150_postflight$;

COMMIT;

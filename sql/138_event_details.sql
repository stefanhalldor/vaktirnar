-- SQL138: optional Event date/time, description and agenda.
-- Additive only. Write this migration here; Stebbi runs it separately.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF pg_catalog.to_regclass('public.teskeid_events') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_create_with_attendance_invitations(uuid,uuid,text,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure('public.teskeid_event_assert_actor(uuid)') IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_details_prerequisite_missing';
  END IF;
  IF pg_catalog.to_regclass('public.teskeid_event_details') IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_details(uuid,uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_save_details(uuid,uuid,uuid,date,time without time zone,text,text)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_details_target_exists';
  END IF;
END;
$preflight$;

CREATE TABLE public.teskeid_event_details (
  event_id          uuid PRIMARY KEY,
  event_date        date,
  event_time        time(0) without time zone,
  description       text,
  agenda            text,
  last_request_id   uuid        NOT NULL,
  last_fingerprint  text        NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT teskeid_event_details_event_fk
    FOREIGN KEY (event_id) REFERENCES public.teskeid_events(id) ON DELETE CASCADE,
  CONSTRAINT teskeid_event_details_date_time_pair_check CHECK (
    (event_date IS NULL) = (event_time IS NULL)
  ),
  CONSTRAINT teskeid_event_details_description_check CHECK (
    description IS NULL OR (
      pg_catalog.char_length(description) BETWEEN 1 AND 2000
      AND pg_catalog.regexp_replace(description, E'\n', '', 'g') !~ '[[:cntrl:]]'
      AND description !~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
    )
  ),
  CONSTRAINT teskeid_event_details_agenda_check CHECK (
    agenda IS NULL OR (
      pg_catalog.char_length(agenda) BETWEEN 1 AND 4000
      AND pg_catalog.regexp_replace(agenda, E'\n', '', 'g') !~ '[[:cntrl:]]'
      AND agenda !~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
    )
  ),
  CONSTRAINT teskeid_event_details_fingerprint_check CHECK (
    last_fingerprint ~ '^[0-9a-f]{32}$'
  )
);

ALTER TABLE public.teskeid_event_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_details FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_details OWNER TO postgres;
REVOKE ALL ON TABLE public.teskeid_event_details
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.teskeid_event_get_details(
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
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'event_date', details.event_date,
    'event_time', details.event_time,
    'description', details.description,
    'agenda', details.agenda
  ) INTO v_result
  FROM public.teskeid_events AS event_row
  LEFT JOIN public.teskeid_event_details AS details
    ON details.event_id = event_row.id
  WHERE event_row.id = p_event_id
    AND (
      event_row.owner_user_id = p_actor_id
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
    );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_save_details(
  p_actor_id uuid,
  p_event_id uuid,
  p_request_id uuid,
  p_event_date date,
  p_event_time time without time zone,
  p_description text,
  p_agenda text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing public.teskeid_event_details%ROWTYPE;
  v_description text := NULLIF(pg_catalog.normalize(pg_catalog.btrim(
    pg_catalog.replace(pg_catalog.replace(
      COALESCE(p_description, ''), E'\r\n', E'\n'
    ), E'\r', E'\n')
  )), '');
  v_agenda text := NULLIF(pg_catalog.normalize(pg_catalog.btrim(
    pg_catalog.replace(pg_catalog.replace(
      COALESCE(p_agenda, ''), E'\r\n', E'\n'
    ), E'\r', E'\n')
  )), '');
  v_fingerprint text;
BEGIN
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL OR p_request_id IS NULL
     OR (p_event_date IS NULL) <> (p_event_time IS NULL)
     OR v_description IS NOT NULL AND (
       pg_catalog.char_length(v_description) > 2000
       OR pg_catalog.regexp_replace(v_description, E'\n', '', 'g') ~ '[[:cntrl:]]'
       OR v_description ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
     )
     OR v_agenda IS NOT NULL AND (
       pg_catalog.char_length(v_agenda) > 4000
       OR pg_catalog.regexp_replace(v_agenda, E'\n', '', 'g') ~ '[[:cntrl:]]'
       OR v_agenda ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;

  PERFORM event_row.id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'event_date', p_event_date,
    'event_time', p_event_time,
    'description', v_description,
    'agenda', v_agenda
  )::text);

  SELECT details.* INTO v_existing
  FROM public.teskeid_event_details AS details
  WHERE details.event_id = p_event_id
  FOR UPDATE;
  IF v_existing.event_id IS NOT NULL
     AND v_existing.last_request_id = p_request_id THEN
    IF v_existing.last_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'teskeid_event_request_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object('event_id', p_event_id);
  END IF;

  INSERT INTO public.teskeid_event_details (
    event_id, event_date, event_time, description, agenda,
    last_request_id, last_fingerprint
  ) VALUES (
    p_event_id, p_event_date, p_event_time, v_description, v_agenda,
    p_request_id, v_fingerprint
  )
  ON CONFLICT (event_id) DO UPDATE SET
    event_date = EXCLUDED.event_date,
    event_time = EXCLUDED.event_time,
    description = EXCLUDED.description,
    agenda = EXCLUDED.agenda,
    last_request_id = EXCLUDED.last_request_id,
    last_fingerprint = EXCLUDED.last_fingerprint,
    updated_at = CASE WHEN
      public.teskeid_event_details.event_date IS DISTINCT FROM EXCLUDED.event_date
      OR public.teskeid_event_details.event_time IS DISTINCT FROM EXCLUDED.event_time
      OR public.teskeid_event_details.description IS DISTINCT FROM EXCLUDED.description
      OR public.teskeid_event_details.agenda IS DISTINCT FROM EXCLUDED.agenda
    THEN pg_catalog.now() ELSE public.teskeid_event_details.updated_at END;

  UPDATE public.teskeid_events AS event_row
  SET updated_at = pg_catalog.now()
  WHERE event_row.id = p_event_id
    AND (
      v_existing.event_id IS NULL
      OR v_existing.event_date IS DISTINCT FROM p_event_date
      OR v_existing.event_time IS DISTINCT FROM p_event_time
      OR v_existing.description IS DISTINCT FROM v_description
      OR v_existing.agenda IS DISTINCT FROM v_agenda
    );
  RETURN pg_catalog.jsonb_build_object('event_id', p_event_id);
END;
$function$;

CREATE FUNCTION public.teskeid_event_create_with_details_and_attendance_invitations(
  p_actor_id uuid,
  p_request_id uuid,
  p_name text,
  p_guests jsonb,
  p_event_date date,
  p_event_time time without time zone,
  p_description text,
  p_agenda text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
  v_event_id uuid;
BEGIN
  v_result := public.teskeid_event_create_with_attendance_invitations(
    p_actor_id, p_request_id, p_name, p_guests
  );
  v_event_id := (v_result->>'event_id')::uuid;
  PERFORM public.teskeid_event_save_details(
    p_actor_id, v_event_id, p_request_id, p_event_date, p_event_time,
    p_description, p_agenda
  );
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.teskeid_event_get_details(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_save_details(
  uuid,uuid,uuid,date,time without time zone,text,text
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_with_details_and_attendance_invitations(
  uuid,uuid,text,jsonb,date,time without time zone,text,text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.teskeid_event_get_details(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_event_save_details(
  uuid,uuid,uuid,date,time without time zone,text,text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_event_create_with_details_and_attendance_invitations(
  uuid,uuid,text,jsonb,date,time without time zone,text,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_event_get_details(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_save_details(
  uuid,uuid,uuid,date,time without time zone,text,text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_create_with_details_and_attendance_invitations(
  uuid,uuid,text,jsonb,date,time without time zone,text,text
) TO service_role;

DO $postflight$
DECLARE
  v_table_oid oid := pg_catalog.to_regclass('public.teskeid_event_details');
BEGIN
  IF v_table_oid IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class AS relation
       JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = relation.relowner
       WHERE relation.oid = v_table_oid
         AND owner_role.rolname = 'postgres'
         AND relation.relrowsecurity
         AND relation.relforcerowsecurity
         AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_policy AS policy
           WHERE policy.polrelid = relation.oid
         )
         AND NOT EXISTS (
           SELECT 1
           FROM pg_catalog.aclexplode(COALESCE(
             relation.relacl,
             pg_catalog.acldefault('r', relation.relowner)
           )) AS privilege_row
           LEFT JOIN pg_catalog.pg_roles AS grantee_role
             ON grantee_role.oid = privilege_row.grantee
           WHERE privilege_row.grantee = 0
              OR grantee_role.rolname IN ('anon', 'authenticated', 'service_role')
         )
     )
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_details(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_save_details(uuid,uuid,uuid,date,time without time zone,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)'
     ) IS NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc AS function_row
       WHERE function_row.oid IN (
         pg_catalog.to_regprocedure('public.teskeid_event_get_details(uuid,uuid)'),
         pg_catalog.to_regprocedure(
           'public.teskeid_event_save_details(uuid,uuid,uuid,date,time without time zone,text,text)'
         ),
         pg_catalog.to_regprocedure(
           'public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)'
         )
       ) AND (
         function_row.proowner <> (
           SELECT role_row.oid FROM pg_catalog.pg_roles AS role_row
           WHERE role_row.rolname = 'postgres'
         )
         OR NOT function_row.prosecdef
         OR function_row.proretset
         OR function_row.prorettype <> 'jsonb'::pg_catalog.regtype
         OR function_row.prolang <> (
           SELECT language_row.oid FROM pg_catalog.pg_language AS language_row
           WHERE language_row.lanname = 'plpgsql'
         )
         OR function_row.provolatile <> CASE
           WHEN function_row.proname = 'teskeid_event_get_details' THEN 's'::"char"
           ELSE 'v'::"char" END
         OR function_row.proisstrict
         OR function_row.proleakproof
         OR pg_catalog.cardinality(COALESCE(function_row.proconfig, ARRAY[]::text[])) <> 1
         OR function_row.proconfig[1] NOT IN ('search_path=', 'search_path=""')
         OR NOT pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
         OR pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
         OR pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
       )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_details_attestation_failed';
  END IF;
END;
$postflight$;

COMMIT;

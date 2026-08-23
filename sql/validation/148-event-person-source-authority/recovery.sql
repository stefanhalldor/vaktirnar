-- Guarded SQL148 recovery. Drops only the exact reviewed SQL148 functions.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('teskeid:sql148:event-person-source-authority', 148)
);

DO $sql148_recovery_guard$
DECLARE
  v_list_oid oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)'
  );
  v_roster_oid oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_get_person_source_roster_v1(uuid,uuid)'
  );
  v_exact boolean;
BEGIN
  IF v_list_oid IS NULL AND v_roster_oid IS NULL THEN
    RETURN;
  END IF;
  IF v_list_oid IS NULL OR v_roster_oid IS NULL THEN
    RAISE EXCEPTION 'sql148_recovery_drift:partial_install';
  END IF;

  SELECT pg_catalog.bool_and(
    pg_catalog.md5(pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'))
      = expected.expected_md5
    AND procedure_row.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype
    AND procedure_row.provolatile = 's'
    AND procedure_row.prosecdef
    AND pg_catalog.cardinality(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) = 1
    AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
    AND owner_role.rolname = 'postgres'
    AND pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        procedure_row.proacl,
        pg_catalog.acldefault('f', procedure_row.proowner)
      )) AS privilege
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantee NOT IN (procedure_row.proowner, service_role.oid)
    )
  )
  INTO v_exact
  FROM (VALUES
    (v_list_oid, 'a31fc1caa0cf009e4daad9c3e3ed1875'),
    (v_roster_oid, 'ae418825a7d7f8ebe056272dde9448fd')
  ) AS expected(function_oid, expected_md5)
  JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = expected.function_oid
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
  JOIN pg_catalog.pg_roles AS service_role
    ON service_role.rolname = 'service_role';

  IF v_exact IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'sql148_recovery_drift:function_shape';
  END IF;
END;
$sql148_recovery_guard$;

DROP FUNCTION IF EXISTS public.teskeid_event_list_person_source_events_v1(
  uuid, timestamptz, uuid, integer
);
DROP FUNCTION IF EXISTS public.teskeid_event_get_person_source_roster_v1(uuid, uuid);

COMMIT;

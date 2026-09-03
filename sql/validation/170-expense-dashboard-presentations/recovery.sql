-- SQL170 RECOVERY: disable and remove only the exact SQL170 dashboard read capability.

BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(104170);
DO $pre_mutation_guard$
DECLARE
  v_target oid := pg_catalog.to_regprocedure(
    'public.expense_list_dashboard_presentations_v1(uuid)'
  );
BEGIN
  IF v_target IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
    JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
    WHERE routine.oid = v_target
      AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
        = 'dbf8086df87d9574e29a914c7201257b'
      AND routine.provolatile = 'v'::"char"
      AND routine.prosecdef
      AND routine.prokind = 'f'
      AND routine.pronargs = 1
      AND routine.proargnames = ARRAY['p_actor_id']::text[]
      AND routine.proargmodes IS NULL
      AND pg_catalog.pg_get_function_arguments(routine.oid) = 'p_actor_id uuid'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND NOT routine.proisstrict
      AND NOT routine.proleakproof
      AND routine.proparallel = 'u'::"char"
      AND routine.pronargdefaults = 0
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = 'plpgsql'
      AND (
        SELECT pg_catalog.count(*) = 2
          AND pg_catalog.array_agg(
            COALESCE(grantee_role.rolname::text, 'PUBLIC')
            ORDER BY COALESCE(grantee_role.rolname::text, 'PUBLIC')
              COLLATE pg_catalog."C"
          ) = ARRAY['postgres','service_role']::text[]
          AND pg_catalog.bool_and(
            grantor_role.rolname = 'postgres'
            AND acl.privilege_type = 'EXECUTE'
            AND NOT acl.is_grantable
          )
        FROM pg_catalog.aclexplode(COALESCE(
          routine.proacl, pg_catalog.acldefault('f', routine.proowner)
        )) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
        JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
      )
  ) THEN
    RAISE EXCEPTION 'expense_sql170_recovery_pre_mutation_target_drift';
  END IF;
END;
$pre_mutation_guard$;
REVOKE EXECUTE ON FUNCTION public.expense_list_dashboard_presentations_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;

BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(104170);
DO $guard$
DECLARE
  v_target oid := pg_catalog.to_regprocedure(
    'public.expense_list_dashboard_presentations_v1(uuid)'
  );
BEGIN
  IF v_target IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
    JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
    WHERE routine.oid = v_target
      AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
        = 'dbf8086df87d9574e29a914c7201257b'
      AND routine.provolatile = 'v'::"char"
      AND routine.prosecdef
      AND routine.prokind = 'f'
      AND routine.pronargs = 1
      AND routine.proargnames = ARRAY['p_actor_id']::text[]
      AND routine.proargmodes IS NULL
      AND pg_catalog.pg_get_function_arguments(routine.oid) = 'p_actor_id uuid'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND NOT routine.proisstrict
      AND NOT routine.proleakproof
      AND routine.proparallel = 'u'::"char"
      AND routine.pronargdefaults = 0
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = 'plpgsql'
      AND (
        SELECT pg_catalog.count(*) = 1
          AND pg_catalog.bool_and(
            COALESCE(grantee_role.rolname, 'PUBLIC') = 'postgres'
            AND grantor_role.rolname = 'postgres'
            AND acl.privilege_type = 'EXECUTE'
            AND NOT acl.is_grantable
          )
        FROM pg_catalog.aclexplode(COALESCE(
          routine.proacl, pg_catalog.acldefault('f', routine.proowner)
        )) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
        JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
      )
  ) THEN
    RAISE EXCEPTION 'expense_sql170_recovery_target_drift';
  END IF;
END;
$guard$;
DROP FUNCTION public.expense_list_dashboard_presentations_v1(uuid);
COMMIT;

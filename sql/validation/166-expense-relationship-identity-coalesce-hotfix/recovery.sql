BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(104166);

-- Emergency-only capability disable. After separate approval, operator must uncomment:
-- SET LOCAL teskeid.sql166_capability_disable_confirmed = 'yes';

DO $recovery_guard$
DECLARE
  v_discovery_oid oid;
  v_mutation_oid oid;
  v_discovery_body text;
  v_mutation_body text;
  v_discovery_contract_exact boolean;
  v_mutation_contract_exact boolean;
  v_acl_exact boolean;
  v_dependencies_exact boolean;
  v_target_hash constant text := 'd97158cb09a138b962382747c6badbca';
  v_predecessor_hash constant text := '3ac32ce091028d0c73476c88c7fa208f';
  v_mutation_hash constant text := '257e4ad0dc53277b984272baadd8a3bf';
  v_helper_hash constant text := 'b25f994a64dde4a3f94ec8bad8535b17';
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres'
    OR pg_catalog.current_setting(
      'teskeid.sql166_capability_disable_confirmed', true
    ) IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'expense_sql166_recovery_not_authorized';
  END IF;

  v_discovery_oid := pg_catalog.to_regprocedure(
    'public.expense_get_relationship_identity_management_v1(uuid,uuid)'
  );
  v_mutation_oid := pg_catalog.to_regprocedure(
    'public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)'
  );

  SELECT routine.prosrc,
    routine.prokind = 'f' AND routine.pronargs = 2
      AND routine.proargnames = ARRAY['p_actor_id','p_expense_id']::text[]
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset AND routine.provolatile = 's'
      AND routine.prosecdef AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'
      AND routine.pronargdefaults = 0 AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
      AND pg_catalog.pg_get_function_arguments(routine.oid) =
        'p_actor_id uuid, p_expense_id uuid'
  INTO v_discovery_body, v_discovery_contract_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  WHERE routine.oid = v_discovery_oid;

  SELECT routine.prosrc,
    routine.prokind = 'f' AND routine.pronargs = 6
      AND routine.proargnames = ARRAY[
        'p_actor_id','p_request_id','p_expense_id','p_member_id',
        'p_relationship_id','p_expected_financial_version'
      ]::text[]
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset AND routine.provolatile = 'v'
      AND routine.prosecdef AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'
      AND routine.pronargdefaults = 0 AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
      AND pg_catalog.pg_get_function_arguments(routine.oid) =
        'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_relationship_id uuid, p_expected_financial_version bigint'
  INTO v_mutation_body, v_mutation_contract_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  WHERE routine.oid = v_mutation_oid;

  WITH role_oids AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), expected_functions(function_oid) AS MATERIALIZED (
    VALUES (v_discovery_oid), (v_mutation_oid)
  ), expected_acl(function_oid, grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT function_row.function_oid, roles.postgres_oid, roles.postgres_oid,
      'EXECUTE'::text, false
    FROM expected_functions AS function_row CROSS JOIN role_oids AS roles
    UNION ALL
    SELECT function_row.function_oid, roles.service_role_oid, roles.postgres_oid,
      'EXECUTE'::text, false
    FROM expected_functions AS function_row CROSS JOIN role_oids AS roles
  ), actual_acl AS MATERIALIZED (
    SELECT routine.oid AS function_oid, privilege_row.grantee,
      privilege_row.grantor, privilege_row.privilege_type,
      privilege_row.is_grantable
    FROM pg_catalog.pg_proc AS routine
    JOIN expected_functions AS expected ON expected.function_oid = routine.oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS privilege_row
  ), effective_acl AS MATERIALIZED (
    SELECT expected.function_oid,
      pg_catalog.has_function_privilege(
        roles.service_role_oid, expected.function_oid, 'EXECUTE'
      ) AS service_execute,
      NOT pg_catalog.has_function_privilege(
        roles.anon_oid, expected.function_oid, 'EXECUTE'
      ) AS anon_denied,
      NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, expected.function_oid, 'EXECUTE'
      ) AS authenticated_denied
    FROM expected_functions AS expected CROSS JOIN role_oids AS roles
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM expected_acl) = 4
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 4
      AND (SELECT pg_catalog.count(*) = 2
        AND pg_catalog.bool_and(
          service_execute AND anon_denied AND authenticated_denied
        ) FROM effective_acl)
      AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
      AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
        EXCEPT ALL SELECT actual.* FROM actual_acl AS actual)
      AND NOT EXISTS (SELECT 1 FROM actual_acl WHERE grantee = 0::oid), false)
  INTO v_acl_exact
  FROM role_oids AS roles;

  WITH expected_relation(signature, require_rls, require_force_rls) AS (
    VALUES
      ('public.expenses', true, false),
      ('public.expense_groups', true, false),
      ('public.expense_group_members', true, false),
      ('public.relationships', true, false),
      ('public.profiles', true, false),
      ('public.teskeid_event_expense_participant_sources', true, true),
      ('auth.users', false, false)
  ), relation_check AS (
    SELECT expected.*, class_row.oid, class_row.relkind,
      class_row.relrowsecurity, class_row.relforcerowsecurity
    FROM expected_relation AS expected
    LEFT JOIN pg_catalog.pg_class AS class_row
      ON class_row.oid = pg_catalog.to_regclass(expected.signature)
  ), helper_check AS (
    SELECT routine.oid IS NOT NULL AND routine.prokind = 'f'
      AND routine.pronargs = 2
      AND routine.proargnames = ARRAY['p_actor_id','p_group_id']::text[]
      AND routine.prorettype = 'text'::pg_catalog.regtype
      AND routine.provolatile = 's' AND routine.prosecdef
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'sql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
      AND pg_catalog.pg_get_function_arguments(routine.oid) =
        'p_actor_id uuid, p_group_id uuid'
      AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) =
        v_helper_hash AS exact
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
    WHERE routine.oid = pg_catalog.to_regprocedure(
      'public.expense_active_member_role(uuid,uuid)'
    )
  )
  SELECT COALESCE(
    (SELECT pg_catalog.count(oid) = 7
      AND pg_catalog.bool_and(relkind = 'r')
      AND pg_catalog.bool_and(NOT require_rls OR relrowsecurity)
      AND pg_catalog.bool_and(NOT require_force_rls OR relforcerowsecurity)
     FROM relation_check)
    AND COALESCE((SELECT exact FROM helper_check), false), false)
  INTO v_dependencies_exact;

  IF NOT COALESCE(v_discovery_contract_exact, false)
    OR NOT COALESCE(v_mutation_contract_exact, false)
    OR NOT COALESCE(v_acl_exact, false)
    OR NOT COALESCE(v_dependencies_exact, false)
    OR pg_catalog.md5(pg_catalog.replace(v_discovery_body, E'\r\n', E'\n')) <>
      v_target_hash
    OR pg_catalog.strpos(v_discovery_body, 'pg_catalog.coalesce(') <> 0
    OR pg_catalog.strpos(v_discovery_body, 'COALESCE(') = 0
    OR pg_catalog.md5(pg_catalog.replace(v_mutation_body, E'\r\n', E'\n')) <>
      v_mutation_hash
    OR v_predecessor_hash = v_target_hash
  THEN
    RAISE EXCEPTION 'expense_sql166_recovery_target_mismatch';
  END IF;
END;
$recovery_guard$;

REVOKE EXECUTE ON FUNCTION public.expense_get_relationship_identity_management_v1(uuid,uuid)
  FROM service_role;

DO $recovery_verify$
DECLARE
  v_discovery_oid oid := pg_catalog.to_regprocedure(
    'public.expense_get_relationship_identity_management_v1(uuid,uuid)'
  );
  v_mutation_oid oid := pg_catalog.to_regprocedure(
    'public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)'
  );
  v_discovery_acl_disabled boolean;
  v_mutation_acl_exact boolean;
BEGIN
  WITH role_oids AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), actual_acl AS MATERIALIZED (
    SELECT privilege_row.grantee, privilege_row.grantor,
      privilege_row.privilege_type, privilege_row.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS privilege_row
    WHERE routine.oid = v_discovery_oid
  )
  SELECT COALESCE(
    (SELECT pg_catalog.count(*) FROM actual_acl) = 1
      AND EXISTS (SELECT 1 FROM actual_acl
        WHERE grantee = roles.postgres_oid AND grantor = roles.postgres_oid
          AND privilege_type = 'EXECUTE' AND NOT is_grantable)
      AND NOT EXISTS (SELECT 1 FROM actual_acl WHERE grantee = 0::oid)
      AND NOT pg_catalog.has_function_privilege(
        roles.service_role_oid, v_discovery_oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        roles.anon_oid, v_discovery_oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, v_discovery_oid, 'EXECUTE'), false)
  INTO v_discovery_acl_disabled
  FROM role_oids AS roles;

  WITH role_oids AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), actual_acl AS MATERIALIZED (
    SELECT privilege_row.grantee, privilege_row.grantor,
      privilege_row.privilege_type, privilege_row.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS privilege_row
    WHERE routine.oid = v_mutation_oid
  )
  SELECT COALESCE(
    (SELECT pg_catalog.count(*) FROM actual_acl) = 2
      AND EXISTS (SELECT 1 FROM actual_acl
        WHERE grantee = roles.postgres_oid AND grantor = roles.postgres_oid
          AND privilege_type = 'EXECUTE' AND NOT is_grantable)
      AND EXISTS (SELECT 1 FROM actual_acl
        WHERE grantee = roles.service_role_oid AND grantor = roles.postgres_oid
          AND privilege_type = 'EXECUTE' AND NOT is_grantable)
      AND NOT EXISTS (SELECT 1 FROM actual_acl WHERE grantee = 0::oid)
      AND pg_catalog.has_function_privilege(
        roles.service_role_oid, v_mutation_oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        roles.anon_oid, v_mutation_oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, v_mutation_oid, 'EXECUTE'), false)
  INTO v_mutation_acl_exact
  FROM role_oids AS roles;

  IF NOT COALESCE(v_discovery_acl_disabled, false)
    OR NOT COALESCE(v_mutation_acl_exact, false)
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = v_discovery_oid
        AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) =
          'd97158cb09a138b962382747c6badbca'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = v_mutation_oid
        AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) =
          '257e4ad0dc53277b984272baadd8a3bf'
    )
  THEN
    RAISE EXCEPTION 'expense_sql166_recovery_disable_failed';
  END IF;
END;
$recovery_verify$;

COMMIT;

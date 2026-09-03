-- SQL171 MIGRATION: parenthesize one SQL170 dashboard JSON text extraction.
-- Function-only hotfix. Run this one DO statement standalone under normal autocommit.
-- No application row, relation, RLS, auth, ownership or ACL state is changed.

DO $sql171_hotfix$
DECLARE
  v_oid oid := pg_catalog.to_regprocedure(
    'public.expense_list_dashboard_presentations_v1(uuid)'
  );
  v_post_oid oid;
  v_source text;
  v_target_source text;
  v_post_source text;
  v_source_hash text;
  v_post_source_hash text;
  v_metadata_exact boolean := false;
  v_acl_exact boolean := false;
  v_dependencies_exact boolean := false;
  v_post_metadata_exact boolean := false;
  v_post_acl_exact boolean := false;
  v_post_dependencies_exact boolean := false;
  v_invalid_count integer := 0;
  v_corrected_count integer := 0;
  v_post_invalid_count integer := 0;
  v_post_corrected_count integer := 0;
  v_sql170_lock_acquired boolean := false;
  v_sql171_lock_acquired boolean := false;
  v_state text := 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT';
  v_predecessor_hash constant text := 'dbf8086df87d9574e29a914c7201257b';
  v_target_hash constant text := 'aad418eeda9d6b1dfe073c4109723d88';
  v_invalid_token constant text := '|| ''|'' || party.value->>''party_key_hash''';
  v_corrected_token constant text := '|| ''|'' || (party.value->>''party_key_hash'')';
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  PERFORM pg_catalog.set_config('search_path', '', true);

  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql171_executor_not_postgres';
  END IF;

  -- Coordinate with the installed SQL170 target and this forward hotfix.
  v_sql170_lock_acquired := pg_catalog.pg_try_advisory_xact_lock(104170);
  IF NOT v_sql170_lock_acquired THEN
    RAISE EXCEPTION 'expense_sql171_sql170_lock_unavailable';
  END IF;
  v_sql171_lock_acquired := pg_catalog.pg_try_advisory_xact_lock(104171);
  IF NOT v_sql171_lock_acquired THEN
    RAISE EXCEPTION 'expense_sql171_lock_unavailable';
  END IF;

  SELECT routine.prosrc,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
    routine.prokind = 'f'
      AND routine.pronargs = 1
      AND routine.proargnames = ARRAY['p_actor_id']::text[]
      AND routine.proargmodes IS NULL
      AND pg_catalog.pg_get_function_arguments(routine.oid) = 'p_actor_id uuid'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset
      AND routine.provolatile = 'v'::"char"
      AND routine.prosecdef
      AND NOT routine.proisstrict
      AND NOT routine.proleakproof
      AND routine.proparallel = 'u'::"char"
      AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL
      AND routine.provariadic = 0::oid
      AND routine.procost = 100
      AND routine.prorows = 0
      AND routine.prosupport = 0::oid
      AND routine.protrftypes IS NULL
      AND routine.probin IS NULL
      AND routine.prosqlbody IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND owner_role.rolname = 'postgres'
  INTO v_source, v_source_hash, v_metadata_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
  WHERE routine.oid = v_oid;

  WITH roles AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), expected_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT postgres_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
    UNION ALL
    SELECT service_role_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
  ), actual_acl AS MATERIALIZED (
    SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl
    WHERE routine.oid = v_oid
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
      AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL
      AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM expected_acl) = 2
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 2
      AND NOT EXISTS (
        SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL
        SELECT expected.* FROM expected_acl AS expected
      )
      AND NOT EXISTS (
        SELECT expected.* FROM expected_acl AS expected
        EXCEPT ALL
        SELECT actual.* FROM actual_acl AS actual
      )
      AND NOT EXISTS (SELECT 1 FROM actual_acl WHERE grantee = 0::oid)
      AND pg_catalog.has_function_privilege(roles.postgres_oid, v_oid, 'EXECUTE')
      AND pg_catalog.has_function_privilege(roles.service_role_oid, v_oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(roles.anon_oid, v_oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, v_oid, 'EXECUTE'
      ), false
  ) INTO v_acl_exact
  FROM roles;

  WITH expected_dependencies(
    classid, objid, objsubid, refclassid, refobjid, refobjsubid, deptype
  ) AS MATERIALIZED (
    SELECT 'pg_catalog.pg_proc'::pg_catalog.regclass::oid, v_oid, 0,
      'pg_catalog.pg_namespace'::pg_catalog.regclass::oid,
      pg_catalog.to_regnamespace('public')::oid, 0, 'n'::"char"
    UNION ALL
    SELECT 'pg_catalog.pg_proc'::pg_catalog.regclass::oid, v_oid, 0,
      'pg_catalog.pg_language'::pg_catalog.regclass::oid,
      language_row.oid, 0, 'n'::"char"
    FROM pg_catalog.pg_language AS language_row
    WHERE language_row.lanname = 'plpgsql'
  ), actual_dependencies AS MATERIALIZED (
    SELECT dependency.classid, dependency.objid, dependency.objsubid,
      dependency.refclassid, dependency.refobjid, dependency.refobjsubid,
      dependency.deptype
    FROM pg_catalog.pg_depend AS dependency
    WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      AND dependency.objid = v_oid
  )
  SELECT COALESCE(
    (SELECT pg_catalog.count(*) FROM expected_dependencies) = 2
      AND (SELECT pg_catalog.count(*) FROM actual_dependencies) = 2
      AND NOT EXISTS (
        SELECT actual.* FROM actual_dependencies AS actual
        EXCEPT ALL
        SELECT expected.* FROM expected_dependencies AS expected
      )
      AND NOT EXISTS (
        SELECT expected.* FROM expected_dependencies AS expected
        EXCEPT ALL
        SELECT actual.* FROM actual_dependencies AS actual
      ), false
  ) INTO v_dependencies_exact;

  IF v_source IS NOT NULL THEN
    v_invalid_count := (
      pg_catalog.char_length(v_source)
        - pg_catalog.char_length(pg_catalog.replace(v_source, v_invalid_token, ''))
    ) / pg_catalog.char_length(v_invalid_token);
    v_corrected_count := (
      pg_catalog.char_length(v_source)
        - pg_catalog.char_length(pg_catalog.replace(v_source, v_corrected_token, ''))
    ) / pg_catalog.char_length(v_corrected_token);
  END IF;

  IF COALESCE(v_metadata_exact, false)
     AND COALESCE(v_acl_exact, false)
     AND COALESCE(v_dependencies_exact, false)
     AND v_source_hash = v_predecessor_hash
     AND v_invalid_count = 1
     AND v_corrected_count = 0 THEN
    v_state := 'PREDECESSOR_READY';
  ELSIF COALESCE(v_metadata_exact, false)
     AND COALESCE(v_acl_exact, false)
     AND COALESCE(v_dependencies_exact, false)
     AND v_source_hash = v_target_hash
     AND v_invalid_count = 0
     AND v_corrected_count = 1 THEN
    v_state := 'EXACT_INSTALLED';
  END IF;

  IF v_state = 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT' THEN
    RAISE EXCEPTION 'expense_sql171_partial_or_predecessor_drift';
  END IF;

  IF v_state = 'PREDECESSOR_READY' THEN
    v_target_source := pg_catalog.replace(
      v_source, v_invalid_token, v_corrected_token
    );

    IF pg_catalog.md5(pg_catalog.replace(v_target_source, E'\r\n', E'\n'))
         <> v_target_hash
       OR pg_catalog.replace(v_target_source, v_corrected_token, v_invalid_token)
         IS DISTINCT FROM v_source THEN
      RAISE EXCEPTION 'expense_sql171_target_derivation_failed';
    END IF;

    EXECUTE pg_catalog.format(
      'CREATE OR REPLACE FUNCTION public.expense_list_dashboard_presentations_v1(p_actor_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY DEFINER NOT LEAKPROOF PARALLEL UNSAFE COST 100 SET search_path = %L AS %L',
      '',
      v_target_source
    );
  ELSE
    v_target_source := v_source;
  END IF;

  v_post_oid := pg_catalog.to_regprocedure(
    'public.expense_list_dashboard_presentations_v1(uuid)'
  );

  SELECT routine.prosrc,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
    routine.prokind = 'f'
      AND routine.pronargs = 1
      AND routine.proargnames = ARRAY['p_actor_id']::text[]
      AND routine.proargmodes IS NULL
      AND pg_catalog.pg_get_function_arguments(routine.oid) = 'p_actor_id uuid'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset
      AND routine.provolatile = 'v'::"char"
      AND routine.prosecdef
      AND NOT routine.proisstrict
      AND NOT routine.proleakproof
      AND routine.proparallel = 'u'::"char"
      AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL
      AND routine.provariadic = 0::oid
      AND routine.procost = 100
      AND routine.prorows = 0
      AND routine.prosupport = 0::oid
      AND routine.protrftypes IS NULL
      AND routine.probin IS NULL
      AND routine.prosqlbody IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND owner_role.rolname = 'postgres'
  INTO v_post_source, v_post_source_hash, v_post_metadata_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
  WHERE routine.oid = v_post_oid;

  WITH roles AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), expected_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT postgres_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
    UNION ALL
    SELECT service_role_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
  ), actual_acl AS MATERIALIZED (
    SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl
    WHERE routine.oid = v_post_oid
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
      AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL
      AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM expected_acl) = 2
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 2
      AND NOT EXISTS (
        SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL
        SELECT expected.* FROM expected_acl AS expected
      )
      AND NOT EXISTS (
        SELECT expected.* FROM expected_acl AS expected
        EXCEPT ALL
        SELECT actual.* FROM actual_acl AS actual
      )
      AND NOT EXISTS (SELECT 1 FROM actual_acl WHERE grantee = 0::oid)
      AND pg_catalog.has_function_privilege(
        roles.postgres_oid, v_post_oid, 'EXECUTE'
      )
      AND pg_catalog.has_function_privilege(
        roles.service_role_oid, v_post_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.anon_oid, v_post_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, v_post_oid, 'EXECUTE'
      ), false
  ) INTO v_post_acl_exact
  FROM roles;

  WITH expected_dependencies(
    classid, objid, objsubid, refclassid, refobjid, refobjsubid, deptype
  ) AS MATERIALIZED (
    SELECT 'pg_catalog.pg_proc'::pg_catalog.regclass::oid, v_post_oid, 0,
      'pg_catalog.pg_namespace'::pg_catalog.regclass::oid,
      pg_catalog.to_regnamespace('public')::oid, 0, 'n'::"char"
    UNION ALL
    SELECT 'pg_catalog.pg_proc'::pg_catalog.regclass::oid, v_post_oid, 0,
      'pg_catalog.pg_language'::pg_catalog.regclass::oid,
      language_row.oid, 0, 'n'::"char"
    FROM pg_catalog.pg_language AS language_row
    WHERE language_row.lanname = 'plpgsql'
  ), actual_dependencies AS MATERIALIZED (
    SELECT dependency.classid, dependency.objid, dependency.objsubid,
      dependency.refclassid, dependency.refobjid, dependency.refobjsubid,
      dependency.deptype
    FROM pg_catalog.pg_depend AS dependency
    WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      AND dependency.objid = v_post_oid
  )
  SELECT COALESCE(
    (SELECT pg_catalog.count(*) FROM expected_dependencies) = 2
      AND (SELECT pg_catalog.count(*) FROM actual_dependencies) = 2
      AND NOT EXISTS (
        SELECT actual.* FROM actual_dependencies AS actual
        EXCEPT ALL
        SELECT expected.* FROM expected_dependencies AS expected
      )
      AND NOT EXISTS (
        SELECT expected.* FROM expected_dependencies AS expected
        EXCEPT ALL
        SELECT actual.* FROM actual_dependencies AS actual
      ), false
  ) INTO v_post_dependencies_exact;

  IF v_post_source IS NOT NULL THEN
    v_post_invalid_count := (
      pg_catalog.char_length(v_post_source)
        - pg_catalog.char_length(pg_catalog.replace(
          v_post_source, v_invalid_token, ''
        ))
    ) / pg_catalog.char_length(v_invalid_token);
    v_post_corrected_count := (
      pg_catalog.char_length(v_post_source)
        - pg_catalog.char_length(pg_catalog.replace(
          v_post_source, v_corrected_token, ''
        ))
    ) / pg_catalog.char_length(v_corrected_token);
  END IF;

  IF v_post_oid IS DISTINCT FROM v_oid
     OR NOT COALESCE(v_post_metadata_exact, false)
     OR NOT COALESCE(v_post_acl_exact, false)
     OR NOT COALESCE(v_post_dependencies_exact, false)
     OR v_post_source_hash IS DISTINCT FROM v_target_hash
     OR v_post_invalid_count <> 0
     OR v_post_corrected_count <> 1
     OR v_post_source IS DISTINCT FROM v_target_source THEN
    RAISE EXCEPTION 'expense_sql171_postcondition_failed';
  END IF;
END;
$sql171_hotfix$;

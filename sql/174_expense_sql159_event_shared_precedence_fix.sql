-- SQL174 MIGRATION: finish the SQL160 JSONB subtraction precedence repair.
--
-- This function-only forward fix parenthesizes the two Event-source `shared`
-- JSONB values that SQL160 did not match. It changes no application row,
-- table, RLS policy, grant, auth state, secret or financial state.

DO $sql174_event_shared_precedence_fix$
DECLARE
  v_function_oid oid;
  v_original_oid oid;
  v_original_owner oid;
  v_original_acl pg_catalog.aclitem[];
  v_original_comment text;
  v_source text;
  v_fixed_source text;
  v_source_hash text;
  v_old_count integer := 0;
  v_new_count integer := 0;
  v_overload_count integer := 0;
  v_contract_exact boolean := false;
  v_acl_exact boolean := false;
  v_dependencies_exact boolean := false;
  v_consumers_exact boolean := false;
  v_post_exact boolean := false;
  v_post_consumers_exact boolean := false;
  v_consumer_snapshot jsonb;
  v_post_consumer_snapshot jsonb;
  v_state text := 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT';
  v_old_token constant text := 'candidate.value->''shared'' - ARRAY';
  v_new_token constant text := '(candidate.value->''shared'') - ARRAY';
  v_predecessor_hash constant text := '18a6e628bdb1d3c175b515541ab56787';
  v_installed_hash constant text := '9d703deec837fbffed4add9cf8b97b56';
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  PERFORM pg_catalog.set_config('search_path', '', true);

  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql174_executor_mismatch';
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock(159159) THEN
    RAISE EXCEPTION 'expense_sql174_sql159_lock_unavailable';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(159160) THEN
    RAISE EXCEPTION 'expense_sql174_sql160_lock_unavailable';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(104170) THEN
    RAISE EXCEPTION 'expense_sql174_sql170_lock_unavailable';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(104171) THEN
    RAISE EXCEPTION 'expense_sql174_sql171_lock_unavailable';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(104172) THEN
    RAISE EXCEPTION 'expense_sql174_sql172_lock_unavailable';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(104174) THEN
    RAISE EXCEPTION 'expense_sql174_lock_unavailable';
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'
  );

  SELECT pg_catalog.count(*)::integer
  INTO v_overload_count
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
    AND routine.proname = 'expense_sql159_normalize_private_draft';

  IF v_function_oid IS NOT NULL THEN
    SELECT routine.prosrc,
      pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
      routine.oid,
      routine.proowner,
      routine.proacl,
      pg_catalog.obj_description(routine.oid, 'pg_proc'),
      routine.prokind = 'f'
        AND routine.pronargs = 3
        AND routine.proargnames = ARRAY[
          'p_actor_id','p_draft_id','p_require_balanced'
        ]::text[]
        AND routine.proargmodes IS NULL
        AND pg_catalog.pg_get_function_arguments(routine.oid)
          = 'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean'
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
    INTO v_source, v_source_hash, v_original_oid, v_original_owner,
      v_original_acl, v_original_comment, v_contract_exact
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = routine.prolang
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = routine.proowner
    WHERE routine.oid = v_function_oid;

    SELECT pg_catalog.count(*) = 1
        AND COALESCE(pg_catalog.bool_and(
          privilege_row.grantee = pg_catalog.to_regrole('postgres')::oid
            AND privilege_row.grantor = pg_catalog.to_regrole('postgres')::oid
            AND privilege_row.privilege_type = 'EXECUTE'
            AND NOT privilege_row.is_grantable
        ), false)
        AND NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('anon')::oid, v_function_oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('authenticated')::oid,
          v_function_oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('service_role')::oid,
          v_function_oid, 'EXECUTE'
        )
    INTO v_acl_exact
    FROM pg_catalog.aclexplode(COALESCE(
      v_original_acl, pg_catalog.acldefault('f', v_original_owner)
    )) AS privilege_row;

    SELECT pg_catalog.count(*) = 2
        AND pg_catalog.count(*) FILTER (
          WHERE dependency.refclassid =
              'pg_catalog.pg_namespace'::pg_catalog.regclass
            AND dependency.refobjid = pg_catalog.to_regnamespace('public')
        ) = 1
        AND pg_catalog.count(*) FILTER (
          WHERE dependency.refclassid =
              'pg_catalog.pg_language'::pg_catalog.regclass
            AND dependency.refobjid = (
              SELECT language_row.oid
              FROM pg_catalog.pg_language AS language_row
              WHERE language_row.lanname = 'plpgsql'
            )
        ) = 1
        AND COALESCE(pg_catalog.bool_and(
          dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency.objid = v_function_oid
            AND dependency.objsubid = 0
            AND dependency.refobjsubid = 0
            AND dependency.deptype = 'n'::"char"
        ), false)
    INTO v_dependencies_exact
    FROM pg_catalog.pg_depend AS dependency
    WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      AND dependency.objid = v_function_oid;

    v_old_count := (
      pg_catalog.char_length(v_source)
        - pg_catalog.char_length(pg_catalog.replace(v_source, v_old_token, ''))
    ) / pg_catalog.char_length(v_old_token);
    v_new_count := (
      pg_catalog.char_length(v_source)
        - pg_catalog.char_length(pg_catalog.replace(v_source, v_new_token, ''))
    ) / pg_catalog.char_length(v_new_token);
  END IF;

  WITH expected(
    signature, argument_names, exact_arguments, source_hash,
    security_definer, service_execute
  ) AS MATERIALIZED (
    VALUES
      ('public.expense_list_dashboard_presentations_v1(uuid)',
        ARRAY['p_actor_id']::text[], 'p_actor_id uuid',
        'c27e4db0344e21ff660387dab9b3b36c', true, true),
      ('public.expense_sql172_project_private_draft(uuid,uuid)',
        ARRAY['p_actor_id','p_draft_id']::text[],
        'p_actor_id uuid, p_draft_id uuid',
        'f6f261b2f4405afa09c033b7a7b651be', false, false)
  ), observed AS MATERIALIZED (
    SELECT expected.*, routine.*, language_row.lanname,
      owner_role.rolname AS owner_name,
      pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
        AS actual_source_hash
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = routine.prolang
    LEFT JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = routine.proowner
  )
  SELECT pg_catalog.count(observed.oid) = 2
      AND COALESCE(pg_catalog.bool_and(
        observed.actual_source_hash = observed.source_hash
          AND observed.prokind = 'f'
          AND observed.proargnames = observed.argument_names
          AND observed.proargmodes IS NULL
          AND pg_catalog.pg_get_function_arguments(observed.oid)
            = observed.exact_arguments
          AND pg_catalog.pg_get_function_result(observed.oid) = 'jsonb'
          AND observed.prorettype = 'jsonb'::pg_catalog.regtype
          AND NOT observed.proretset
          AND observed.provolatile = 'v'::"char"
          AND observed.prosecdef = observed.security_definer
          AND NOT observed.proisstrict
          AND NOT observed.proleakproof
          AND observed.proparallel = 'u'::"char"
          AND observed.pronargdefaults = 0
          AND observed.proargdefaults IS NULL
          AND observed.proallargtypes IS NULL
          AND observed.provariadic = 0::oid
          AND observed.procost = 100
          AND observed.prorows = 0
          AND observed.prosupport = 0::oid
          AND observed.protrftypes IS NULL
          AND observed.probin IS NULL
          AND observed.prosqlbody IS NULL
          AND observed.proconfig = ARRAY['search_path=""']::text[]
          AND observed.lanname = 'plpgsql'
          AND observed.owner_name = 'postgres'
          AND (
            SELECT pg_catalog.count(*) = CASE
                WHEN observed.service_execute THEN 2 ELSE 1 END
              AND COALESCE(pg_catalog.bool_and(
                privilege_row.grantor = pg_catalog.to_regrole('postgres')::oid
                  AND privilege_row.privilege_type = 'EXECUTE'
                  AND NOT privilege_row.is_grantable
                  AND (
                    privilege_row.grantee =
                      pg_catalog.to_regrole('postgres')::oid
                    OR (
                      observed.service_execute
                      AND privilege_row.grantee =
                        pg_catalog.to_regrole('service_role')::oid
                    )
                  )
              ), false)
            FROM pg_catalog.aclexplode(COALESCE(
              observed.proacl,
              pg_catalog.acldefault('f', observed.proowner)
            )) AS privilege_row
          )
          AND NOT pg_catalog.has_function_privilege(
            pg_catalog.to_regrole('anon')::oid, observed.oid, 'EXECUTE'
          )
          AND NOT pg_catalog.has_function_privilege(
            pg_catalog.to_regrole('authenticated')::oid,
            observed.oid, 'EXECUTE'
          )
          AND pg_catalog.has_function_privilege(
            pg_catalog.to_regrole('service_role')::oid,
            observed.oid, 'EXECUTE'
          ) = observed.service_execute
          AND (
            SELECT pg_catalog.count(*) = 2
              AND pg_catalog.count(*) FILTER (
                WHERE dependency.refclassid =
                    'pg_catalog.pg_namespace'::pg_catalog.regclass
                  AND dependency.refobjid =
                    pg_catalog.to_regnamespace('public')
              ) = 1
              AND pg_catalog.count(*) FILTER (
                WHERE dependency.refclassid =
                    'pg_catalog.pg_language'::pg_catalog.regclass
                  AND dependency.refobjid = observed.prolang
              ) = 1
              AND COALESCE(pg_catalog.bool_and(
                dependency.objsubid = 0
                  AND dependency.refobjsubid = 0
                  AND dependency.deptype = 'n'::"char"
                  AND (
                    (
                      dependency.refclassid =
                        'pg_catalog.pg_namespace'::pg_catalog.regclass
                      AND dependency.refobjid =
                        pg_catalog.to_regnamespace('public')
                    ) OR (
                      dependency.refclassid =
                        'pg_catalog.pg_language'::pg_catalog.regclass
                      AND dependency.refobjid = observed.prolang
                    )
                  )
              ), false)
            FROM pg_catalog.pg_depend AS dependency
            WHERE dependency.classid =
                'pg_catalog.pg_proc'::pg_catalog.regclass
              AND dependency.objid = observed.oid
          )
      ), false)
      AND (
        SELECT pg_catalog.count(*) FILTER (
            WHERE routine.proname = 'expense_list_dashboard_presentations_v1'
          ) = 1
          AND pg_catalog.count(*) FILTER (
            WHERE routine.proname = 'expense_sql172_project_private_draft'
          ) = 1
        FROM pg_catalog.pg_proc AS routine
        WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
          AND routine.proname IN (
            'expense_list_dashboard_presentations_v1',
            'expense_sql172_project_private_draft'
          )
      )
  INTO v_consumers_exact
  FROM observed;

  SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'catalog', pg_catalog.to_jsonb(routine),
        'language', language_row.lanname,
        'owner', owner_role.rolname,
        'comment', pg_catalog.obj_description(routine.oid, 'pg_proc'),
        'dependencies', (
          SELECT COALESCE(pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(dependency)
            ORDER BY dependency.classid, dependency.objid,
              dependency.objsubid, dependency.refclassid,
              dependency.refobjid, dependency.refobjsubid,
              dependency.deptype
          ), '[]'::jsonb)
          FROM pg_catalog.pg_depend AS dependency
          WHERE dependency.classid =
              'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency.objid = routine.oid
        )
      ) ORDER BY routine.proname COLLATE pg_catalog."C"
    )
  INTO v_consumer_snapshot
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = routine.proowner
  WHERE routine.oid IN (
    pg_catalog.to_regprocedure(
      'public.expense_list_dashboard_presentations_v1(uuid)'
    ),
    pg_catalog.to_regprocedure(
      'public.expense_sql172_project_private_draft(uuid,uuid)'
    )
  );

  IF COALESCE(v_contract_exact, false)
     AND COALESCE(v_acl_exact, false)
     AND COALESCE(v_dependencies_exact, false)
     AND COALESCE(v_consumers_exact, false)
     AND v_overload_count = 1
     AND v_source_hash = v_predecessor_hash
     AND v_old_count = 2 AND v_new_count = 0 THEN
    v_state := 'PREDECESSOR_READY';
  ELSIF COALESCE(v_contract_exact, false)
     AND COALESCE(v_acl_exact, false)
     AND COALESCE(v_dependencies_exact, false)
     AND COALESCE(v_consumers_exact, false)
     AND v_overload_count = 1
     AND v_source_hash = v_installed_hash
     AND v_old_count = 0 AND v_new_count = 2 THEN
    v_state := 'EXACT_INSTALLED';
  END IF;

  IF v_state = 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT' THEN
    RAISE EXCEPTION 'expense_sql174_partial_or_predecessor_drift';
  END IF;

  IF v_state = 'PREDECESSOR_READY' THEN
    v_fixed_source := pg_catalog.replace(v_source, v_old_token, v_new_token);
    IF pg_catalog.md5(pg_catalog.replace(
         v_fixed_source, E'\r\n', E'\n'
       )) <> v_installed_hash
       OR pg_catalog.replace(v_fixed_source, v_new_token, v_old_token)
         IS DISTINCT FROM v_source THEN
      RAISE EXCEPTION 'expense_sql174_derivation_failed';
    END IF;

    EXECUTE pg_catalog.format(
      'CREATE OR REPLACE FUNCTION public.expense_sql159_normalize_private_draft(p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean) RETURNS jsonb LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY DEFINER NOT LEAKPROOF PARALLEL UNSAFE COST 100 SET search_path = %L AS %L',
      '', v_fixed_source
    );
  END IF;

  SELECT routine.oid = v_original_oid
      AND routine.proowner = v_original_owner
      AND routine.proacl IS NOT DISTINCT FROM v_original_acl
      AND pg_catalog.obj_description(routine.oid, 'pg_proc')
        IS NOT DISTINCT FROM v_original_comment
      AND pg_catalog.md5(pg_catalog.replace(
        routine.prosrc, E'\r\n', E'\n'
      )) = v_installed_hash
      AND (
        pg_catalog.char_length(routine.prosrc)
          - pg_catalog.char_length(pg_catalog.replace(
            routine.prosrc, v_old_token, ''
          ))
      ) / pg_catalog.char_length(v_old_token) = 0
      AND (
        pg_catalog.char_length(routine.prosrc)
          - pg_catalog.char_length(pg_catalog.replace(
            routine.prosrc, v_new_token, ''
          ))
      ) / pg_catalog.char_length(v_new_token) = 2
      AND routine.prokind = 'f'
      AND routine.pronargs = 3
      AND routine.proargnames = ARRAY[
        'p_actor_id','p_draft_id','p_require_balanced'
      ]::text[]
      AND routine.proargmodes IS NULL
      AND pg_catalog.pg_get_function_arguments(routine.oid)
        = 'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean'
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
      AND (
        SELECT pg_catalog.count(*) = 1
          AND COALESCE(pg_catalog.bool_and(
            privilege_row.grantee = pg_catalog.to_regrole('postgres')::oid
              AND privilege_row.grantor = pg_catalog.to_regrole('postgres')::oid
              AND privilege_row.privilege_type = 'EXECUTE'
              AND NOT privilege_row.is_grantable
          ), false)
        FROM pg_catalog.aclexplode(COALESCE(
          routine.proacl, pg_catalog.acldefault('f', routine.proowner)
        )) AS privilege_row
      )
      AND (
        SELECT pg_catalog.count(*) = 2
          AND pg_catalog.count(*) FILTER (
            WHERE dependency.refclassid =
                'pg_catalog.pg_namespace'::pg_catalog.regclass
              AND dependency.refobjid = pg_catalog.to_regnamespace('public')
          ) = 1
          AND pg_catalog.count(*) FILTER (
            WHERE dependency.refclassid =
                'pg_catalog.pg_language'::pg_catalog.regclass
              AND dependency.refobjid = routine.prolang
          ) = 1
          AND COALESCE(pg_catalog.bool_and(
            dependency.objsubid = 0
              AND dependency.refobjsubid = 0
              AND dependency.deptype = 'n'::"char"
              AND (
                (
                  dependency.refclassid =
                    'pg_catalog.pg_namespace'::pg_catalog.regclass
                  AND dependency.refobjid =
                    pg_catalog.to_regnamespace('public')
                ) OR (
                  dependency.refclassid =
                    'pg_catalog.pg_language'::pg_catalog.regclass
                  AND dependency.refobjid = routine.prolang
                )
              )
          ), false)
        FROM pg_catalog.pg_depend AS dependency
        WHERE dependency.classid =
            'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = routine.oid
      )
  INTO v_post_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = routine.proowner
  WHERE routine.oid = v_function_oid;

  SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'catalog', pg_catalog.to_jsonb(routine),
        'language', language_row.lanname,
        'owner', owner_role.rolname,
        'comment', pg_catalog.obj_description(routine.oid, 'pg_proc'),
        'dependencies', (
          SELECT COALESCE(pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(dependency)
            ORDER BY dependency.classid, dependency.objid,
              dependency.objsubid, dependency.refclassid,
              dependency.refobjid, dependency.refobjsubid,
              dependency.deptype
          ), '[]'::jsonb)
          FROM pg_catalog.pg_depend AS dependency
          WHERE dependency.classid =
              'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency.objid = routine.oid
        )
      ) ORDER BY routine.proname COLLATE pg_catalog."C"
    )
  INTO v_post_consumer_snapshot
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = routine.proowner
  WHERE routine.oid IN (
    pg_catalog.to_regprocedure(
      'public.expense_list_dashboard_presentations_v1(uuid)'
    ),
    pg_catalog.to_regprocedure(
      'public.expense_sql172_project_private_draft(uuid,uuid)'
    )
  );
  v_post_consumers_exact := COALESCE(v_consumers_exact, false)
    AND v_post_consumer_snapshot IS NOT DISTINCT FROM v_consumer_snapshot;

  IF NOT COALESCE(v_post_exact, false)
     OR NOT COALESCE(v_post_consumers_exact, false) THEN
    RAISE EXCEPTION 'expense_sql174_postcondition_failed';
  END IF;
END;
$sql174_event_shared_precedence_fix$;

-- SQL174 postflight: 100% read-only catalog validation.
-- It neither reads nor mutates any application row.
WITH roles AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
    pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
    pg_catalog.to_regrole('anon')::oid AS anon_oid,
    pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
), normalizer AS MATERIALIZED (
  SELECT routine.*, language_row.lanname,
    owner_role.rolname AS owner_name,
    pg_catalog.md5(pg_catalog.replace(
      routine.prosrc, E'\r\n', E'\n'
    )) AS source_hash,
    (
      pg_catalog.char_length(routine.prosrc)
        - pg_catalog.char_length(pg_catalog.replace(
          routine.prosrc, 'candidate.value->''shared'' - ARRAY', ''
        ))
    ) / pg_catalog.char_length('candidate.value->''shared'' - ARRAY')
      AS old_token_count,
    (
      pg_catalog.char_length(routine.prosrc)
        - pg_catalog.char_length(pg_catalog.replace(
          routine.prosrc, '(candidate.value->''shared'') - ARRAY', ''
        ))
    ) / pg_catalog.char_length('(candidate.value->''shared'') - ARRAY')
      AS new_token_count
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = routine.proowner
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'
  )
), normalizer_state AS MATERIALIZED (
  SELECT
    (
      SELECT pg_catalog.count(*) = 1
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
        AND routine.proname = 'expense_sql159_normalize_private_draft'
    ) AS overload_exact,
    EXISTS (SELECT 1 FROM normalizer) AS function_exists,
    COALESCE((
      SELECT routine.source_hash = '9d703deec837fbffed4add9cf8b97b56'
          AND routine.old_token_count = 0
          AND routine.new_token_count = 2
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
          AND routine.lanname = 'plpgsql'
          AND routine.owner_name = 'postgres'
      FROM normalizer AS routine
    ), false) AS contract_and_source_exact,
    COALESCE((
      SELECT pg_catalog.count(*) = 1
          AND COALESCE(pg_catalog.bool_and(
            privilege_row.grantee = roles.postgres_oid
              AND privilege_row.grantor = roles.postgres_oid
              AND privilege_row.privilege_type = 'EXECUTE'
              AND NOT privilege_row.is_grantable
          ), false)
          AND pg_catalog.has_function_privilege(
            roles.postgres_oid, routine.oid, 'EXECUTE'
          )
          AND NOT pg_catalog.has_function_privilege(
            roles.service_role_oid, routine.oid, 'EXECUTE'
          )
          AND NOT pg_catalog.has_function_privilege(
            roles.anon_oid, routine.oid, 'EXECUTE'
          )
          AND NOT pg_catalog.has_function_privilege(
            roles.authenticated_oid, routine.oid, 'EXECUTE'
          )
      FROM normalizer AS routine
      CROSS JOIN roles
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS privilege_row
      GROUP BY routine.oid, roles.postgres_oid, roles.service_role_oid,
        roles.anon_oid, roles.authenticated_oid
    ), false) AS acl_exact,
    COALESCE((
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
          ), false)
      FROM normalizer AS routine
      JOIN pg_catalog.pg_depend AS dependency
        ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
       AND dependency.objid = routine.oid
      GROUP BY routine.oid, routine.prolang
    ), false) AS dependencies_exact
), expected_consumer(
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
), observed_consumer AS MATERIALIZED (
  SELECT expected.*, routine.*, language_row.lanname,
    owner_role.rolname AS owner_name,
    pg_catalog.md5(pg_catalog.replace(
      routine.prosrc, E'\r\n', E'\n'
    )) AS actual_source_hash
  FROM expected_consumer AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = routine.proowner
), consumer_state AS MATERIALIZED (
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
                privilege_row.grantor = roles.postgres_oid
                  AND privilege_row.privilege_type = 'EXECUTE'
                  AND NOT privilege_row.is_grantable
                  AND (
                    privilege_row.grantee = roles.postgres_oid
                    OR (
                      observed.service_execute
                      AND privilege_row.grantee = roles.service_role_oid
                    )
                  )
              ), false)
            FROM roles
            CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
              observed.proacl,
              pg_catalog.acldefault('f', observed.proowner)
            )) AS privilege_row
          )
          AND NOT pg_catalog.has_function_privilege(
            roles.anon_oid, observed.oid, 'EXECUTE'
          )
          AND NOT pg_catalog.has_function_privilege(
            roles.authenticated_oid, observed.oid, 'EXECUTE'
          )
          AND pg_catalog.has_function_privilege(
            roles.service_role_oid, observed.oid, 'EXECUTE'
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
      ) AS consumers_exact
  FROM observed_consumer AS observed CROSS JOIN roles
), catalog_state AS MATERIALIZED (
  SELECT current_user = 'postgres' AND session_user = 'postgres'
      AND normalizer_state.function_exists
      AND normalizer_state.overload_exact
      AND normalizer_state.contract_and_source_exact
      AND normalizer_state.acl_exact
      AND normalizer_state.dependencies_exact
      AND consumer_state.consumers_exact AS catalog_exact
  FROM normalizer_state
  CROSS JOIN consumer_state
)
SELECT current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
  normalizer_state.function_exists,
  normalizer_state.overload_exact,
  normalizer_state.contract_and_source_exact,
  normalizer_state.acl_exact,
  normalizer_state.dependencies_exact,
  consumer_state.consumers_exact,
  catalog_state.catalog_exact AS postconditions_ok
FROM normalizer_state
CROSS JOIN consumer_state
CROSS JOIN catalog_state;

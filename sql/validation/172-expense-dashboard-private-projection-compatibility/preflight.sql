-- SQL172 PREFLIGHT: read-only exact predecessor/target compatibility classification.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = '';

WITH
constants AS MATERIALIZED (
  SELECT
    'public.expense_list_dashboard_presentations_v1(uuid)'::text
      AS target_signature,
    'public.expense_sql172_project_private_draft(uuid,uuid)'::text
      AS adapter_signature,
    'aad418eeda9d6b1dfe073c4109723d88'::text AS predecessor_hash,
    'c27e4db0344e21ff660387dab9b3b36c'::text AS target_hash,
    'f6f261b2f4405afa09c033b7a7b651be'::text AS adapter_hash
), roles AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
    pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
    pg_catalog.to_regrole('anon')::oid AS anon_oid,
    pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
), target AS MATERIALIZED (
  SELECT routine.*, language_row.lanname AS language_name,
    pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
    pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      AS source_hash,
    (
      SELECT pg_catalog.count(*)::integer
      FROM pg_catalog.pg_proc AS overload
      WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
        AND overload.proname = 'expense_list_dashboard_presentations_v1'
    ) AS overload_count
  FROM constants
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(constants.target_signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
), target_contract AS MATERIALIZED (
  SELECT target.oid IS NOT NULL
      AND target.overload_count = 1
      AND target.prokind = 'f'
      AND target.pronargs = 1
      AND target.proargnames = ARRAY['p_actor_id']::text[]
      AND target.proargmodes IS NULL
      AND target.actual_arguments = 'p_actor_id uuid'
      AND target.actual_result = 'jsonb'
      AND target.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT target.proretset
      AND target.provolatile = 'v'::"char"
      AND target.prosecdef
      AND NOT target.proisstrict
      AND NOT target.proleakproof
      AND target.proparallel = 'u'::"char"
      AND target.pronargdefaults = 0
      AND target.proargdefaults IS NULL
      AND target.proallargtypes IS NULL
      AND target.provariadic = 0::oid
      AND target.procost = 100
      AND target.prorows = 0
      AND target.prosupport = 0::oid
      AND target.protrftypes IS NULL
      AND target.probin IS NULL
      AND target.prosqlbody IS NULL
      AND target.proconfig = ARRAY['search_path=""']::text[]
      AND target.language_name = 'plpgsql'
      AND target.proowner = roles.postgres_oid AS contract_exact,
    COALESCE(target.source_hash = constants.predecessor_hash, false)
      AS predecessor_source_exact,
    COALESCE(target.source_hash = constants.target_hash, false)
      AS target_source_exact
  FROM target CROSS JOIN roles CROSS JOIN constants
), expected_target_acl(
  grantee, grantor, privilege_type, is_grantable
) AS MATERIALIZED (
  SELECT postgres_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
  UNION ALL
  SELECT service_role_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
), actual_target_acl AS MATERIALIZED (
  SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
  FROM target
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    target.proacl, pg_catalog.acldefault('f', target.proowner)
  )) AS acl
  WHERE target.oid IS NOT NULL
), target_acl AS MATERIALIZED (
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
      AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL
      AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM actual_target_acl) = 2
      AND NOT EXISTS (
        SELECT actual.* FROM actual_target_acl AS actual
        EXCEPT ALL
        SELECT expected.* FROM expected_target_acl AS expected
      )
      AND NOT EXISTS (
        SELECT expected.* FROM expected_target_acl AS expected
        EXCEPT ALL
        SELECT actual.* FROM actual_target_acl AS actual
      )
      AND NOT EXISTS (
        SELECT 1 FROM actual_target_acl WHERE grantee = 0::oid
      )
      AND pg_catalog.has_function_privilege(
        roles.postgres_oid, target.oid, 'EXECUTE'
      )
      AND pg_catalog.has_function_privilege(
        roles.service_role_oid, target.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.anon_oid, target.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, target.oid, 'EXECUTE'
      ), false
  ) AS exact
  FROM roles CROSS JOIN target
), target_dependencies AS MATERIALIZED (
  SELECT COALESCE(
    target.oid IS NOT NULL
      AND (
        SELECT pg_catalog.count(*) = 2
          AND COALESCE(pg_catalog.bool_and(
            dependency.objsubid = 0
              AND dependency.refobjsubid = 0
              AND dependency.deptype = 'n'::"char"
              AND (
                (dependency.refclassid =
                    'pg_catalog.pg_namespace'::pg_catalog.regclass
                  AND dependency.refobjid =
                    pg_catalog.to_regnamespace('public'))
                OR
                (dependency.refclassid =
                    'pg_catalog.pg_language'::pg_catalog.regclass
                  AND dependency.refobjid = (
                    SELECT language_row.oid
                    FROM pg_catalog.pg_language AS language_row
                    WHERE language_row.lanname = 'plpgsql'
                  ))
              )
          ), false)
        FROM pg_catalog.pg_depend AS dependency
        WHERE dependency.classid =
            'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = target.oid
      ), false
  ) AS exact
  FROM target
), adapter AS MATERIALIZED (
  SELECT routine.*, language_row.lanname AS language_name,
    pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
    pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      AS source_hash,
    (
      SELECT pg_catalog.count(*)::integer
      FROM pg_catalog.pg_proc AS overload
      WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
        AND overload.proname = 'expense_sql172_project_private_draft'
    ) AS overload_count
  FROM constants
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(constants.adapter_signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
), adapter_contract AS MATERIALIZED (
  SELECT adapter.oid IS NOT NULL
      AND adapter.overload_count = 1
      AND adapter.prokind = 'f'
      AND adapter.pronargs = 2
      AND adapter.proargnames = ARRAY['p_actor_id','p_draft_id']::text[]
      AND adapter.proargmodes IS NULL
      AND adapter.actual_arguments = 'p_actor_id uuid, p_draft_id uuid'
      AND adapter.actual_result = 'jsonb'
      AND adapter.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT adapter.proretset
      AND adapter.provolatile = 'v'::"char"
      AND NOT adapter.prosecdef
      AND NOT adapter.proisstrict
      AND NOT adapter.proleakproof
      AND adapter.proparallel = 'u'::"char"
      AND adapter.pronargdefaults = 0
      AND adapter.proargdefaults IS NULL
      AND adapter.proallargtypes IS NULL
      AND adapter.provariadic = 0::oid
      AND adapter.procost = 100
      AND adapter.prorows = 0
      AND adapter.prosupport = 0::oid
      AND adapter.protrftypes IS NULL
      AND adapter.probin IS NULL
      AND adapter.prosqlbody IS NULL
      AND adapter.proconfig = ARRAY['search_path=""']::text[]
      AND adapter.language_name = 'plpgsql'
      AND adapter.proowner = roles.postgres_oid AS contract_exact,
    COALESCE(adapter.source_hash = constants.adapter_hash, false)
      AS source_exact
  FROM adapter CROSS JOIN roles CROSS JOIN constants
), expected_adapter_acl(
  grantee, grantor, privilege_type, is_grantable
) AS MATERIALIZED (
  SELECT postgres_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
), actual_adapter_acl AS MATERIALIZED (
  SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
  FROM adapter
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    adapter.proacl, pg_catalog.acldefault('f', adapter.proowner)
  )) AS acl
  WHERE adapter.oid IS NOT NULL
), adapter_acl AS MATERIALIZED (
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
      AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL
      AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM actual_adapter_acl) = 1
      AND NOT EXISTS (
        SELECT actual.* FROM actual_adapter_acl AS actual
        EXCEPT ALL
        SELECT expected.* FROM expected_adapter_acl AS expected
      )
      AND NOT EXISTS (
        SELECT expected.* FROM expected_adapter_acl AS expected
        EXCEPT ALL
        SELECT actual.* FROM actual_adapter_acl AS actual
      )
      AND NOT EXISTS (
        SELECT 1 FROM actual_adapter_acl WHERE grantee = 0::oid
      )
      AND pg_catalog.has_function_privilege(
        roles.postgres_oid, adapter.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.service_role_oid, adapter.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.anon_oid, adapter.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, adapter.oid, 'EXECUTE'
      ), false
  ) AS exact
  FROM roles CROSS JOIN adapter
), adapter_dependencies AS MATERIALIZED (
  SELECT COALESCE(
    adapter.oid IS NOT NULL
      AND (
        SELECT pg_catalog.count(*) = 2
          AND COALESCE(pg_catalog.bool_and(
            dependency.objsubid = 0
              AND dependency.refobjsubid = 0
              AND dependency.deptype = 'n'::"char"
              AND (
                (dependency.refclassid =
                    'pg_catalog.pg_namespace'::pg_catalog.regclass
                  AND dependency.refobjid =
                    pg_catalog.to_regnamespace('public'))
                OR
                (dependency.refclassid =
                    'pg_catalog.pg_language'::pg_catalog.regclass
                  AND dependency.refobjid = (
                    SELECT language_row.oid
                    FROM pg_catalog.pg_language AS language_row
                    WHERE language_row.lanname = 'plpgsql'
                  ))
              )
          ), false)
        FROM pg_catalog.pg_depend AS dependency
        WHERE dependency.classid =
            'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = adapter.oid
      ), false
  ) AS exact
  FROM adapter
), lineage(
  helper_sources_exact, helper_metadata_dependencies_exact,
  helper_acls_exact, helper_lineage_exact, relation_lineage_exact
) AS MATERIALIZED (
  WITH roles AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), expected_functions(
    lineage_group, signature, exact_arguments, result_type, source_hash,
    language_name, volatility, security_definer, is_strict,
    parallel_safety, returns_set, default_count, argument_modes,
    service_execute
  ) AS MATERIALIZED (
    -- BEGIN EXACT SQL171 FUNCTION LINEAGE MANIFEST
    VALUES
      ('private','public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)',
        'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean',
        'jsonb','18a6e628bdb1d3c175b515541ab56787',
        'plpgsql','v',true,false,'u',false,0,NULL::text[],false),
      ('private','public.expense_sql159_amount_minor(text,text,boolean)',
        'p_raw text, p_currency text, p_allow_zero boolean','bigint',
        '5a4124296ff7e6f19d42342815be8109','plpgsql','i',false,false,'u',false,0,NULL::text[],false),
      ('private','public.expense_sql159_percentage_basis_points(text)',
        'p_raw text','bigint','ad0deb049185b7f6519bc0c3154201ac',
        'plpgsql','i',false,false,'u',false,0,NULL::text[],false),
      ('private','public.expense_sql159_weight(text)',
        'p_raw text','bigint','c29cee4a8de2c95e138aad00af3fd4fe',
        'plpgsql','i',false,false,'u',false,0,NULL::text[],false),
      ('private','public.expense_sql159_allocate_weighted(bigint,jsonb,bigint)',
        'p_total_minor bigint, p_weights jsonb, p_expected_weight_total bigint',
        'jsonb','7d38f3ac0f65a2b16aac5a53c9a09e8f',
        'plpgsql','i',false,false,'u',false,0,NULL::text[],false),
      ('private','public.normalize_email_canonical(text)',
        'p_email text','text','3083103976aa8cb3780937b9da1be236',
        'sql','i',false,true,'s',false,0,NULL::text[],true),
      ('private','public.teskeid_event_uuid_from_text(text)',
        'p_value text','uuid','27229cbc71c621e5a8592265b07f874d',
        'sql','i',true,false,'u',false,0,NULL::text[],false),
      ('private','public.expense_active_member_role(uuid,uuid)',
        'p_actor_id uuid, p_group_id uuid','text',
        'b25f994a64dde4a3f94ec8bad8535b17','sql','s',true,false,'u',false,0,NULL::text[],false),
      ('live','public.expense_sql159_audience_allows(uuid,uuid)',
        'p_actor_id uuid, p_draft_id uuid','boolean',
        '9c4af07a07906c4dac6f06da94b42b37','sql','s',true,false,'u',false,0,NULL::text[],false),
      ('live','public.expense_sql159_snapshot_is_valid(uuid)',
        'p_draft_id uuid','boolean','af4b9f8a5f0b422956fc1d664021baff',
        'sql','s',true,false,'u',false,0,NULL::text[],false),
      ('live','public.expense_has_beta_access(uuid)',
        'p_user_id uuid','boolean','ebe4628dbda84e79b395c9da0ae39899',
        'sql','s',true,false,'u',false,0,NULL::text[],false),
      ('settlement','public.expense_settlement_eligible_balances_v1(uuid,boolean)',
        'p_group_id uuid, p_include_reported boolean DEFAULT false',
        'TABLE(member_id uuid, currency text, amount_minor bigint)',
        'b58245a47cc0c8e306a8769afa508687',
        'plpgsql','s',true,false,'u',true,1,
        ARRAY['i','i','t','t','t']::text[],false),
      ('event','public.teskeid_event_assert_session_actor(uuid)',
        'p_actor_id uuid','void','30238c0def94d573fd8265fd94da0757',
        'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
      ('event','public.expense_assert_beta_actor(uuid)',
        'p_actor_id uuid','void','ea6c329f5c13bd7d0bfbd9df41e5931d',
        'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
      ('event','public.expense_sql159_event_scope_read_only(uuid,uuid)',
        'p_actor_id uuid, p_event_id uuid','jsonb',
        '4ba9308ba12eef6405ed24916bc0bb74','plpgsql','s',true,false,'u',false,0,NULL::text[],false),
      ('event','public.expense_sql159_event_scope_allows(uuid,uuid)',
        'p_actor_id uuid, p_event_id uuid','boolean',
        '0be29be5cda2d34bf41dc2f67e0afa2e','plpgsql','s',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)',
        'p_actor_id uuid, p_event_id uuid','jsonb',
        'e6dc71178a96bb4f398d61b44b39c57a','plpgsql','s',true,false,'u',false,0,NULL::text[],true),
      ('event','public.teskeid_event_get_expense_source_v3(uuid,uuid)',
        'p_actor_id uuid, p_event_id uuid','jsonb',
        '9fdcb060bd933599b8f04fe42da27874','plpgsql','s',true,false,'u',false,0,NULL::text[],true),
      ('event','public.teskeid_event_assert_actor(uuid)',
        'p_actor_id uuid','void','9dd7c34f6cc6c78131e7ebbb9a718ea4',
        'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_assert_financial_actor(uuid)',
        'p_actor_id uuid','void','7f6ced4f5e7472aff27d9a6d5c624355',
        'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)',
        'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_participant_kind text, p_position integer',
        'jsonb','25394edc6b084676921c3a65b1f19a8a',
        'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_private_normalize_shared_name_v2(text)',
        'p_value text','text','d118ab08bc0346cdf31519344a2f65a7',
        'sql','i',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_private_valid_shared_name_v2(text)',
        'p_value text','boolean','7a3223263c138e04713dbc87e7dc6576',
        'sql','i',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_private_safe_profile_name_v2(uuid)',
        'p_user_id uuid','text','53f29b4c6872d3e76d6c9cbc17a767e0',
        'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_private_valid_canonical_email_v2(text)',
        'p_value text','boolean','3e64bc04485bc06cc544f59f46a2fb0e',
        'sql','i',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)',
        'p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text',
        'jsonb','cfb3afa33af8fd230e6c26930424387f',
        'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_normalize_text(text)',
        'p_value text','text','ced5cfb2427fe7331f4416497614f7d1',
        'sql','i',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_valid_text(text,integer,integer)',
        'p_value text, p_minimum integer, p_maximum integer','boolean',
        '28c80b083a90683f15fd04f4d7d547d1','sql','i',true,false,'u',false,0,NULL::text[],false),
      ('event','public.teskeid_event_has_access(uuid)',
        'p_user_id uuid','boolean','7b69311a107381a1891da01c32780f5f',
        'sql','s',true,false,'u',false,0,NULL::text[],false)
    -- END EXACT SQL171 FUNCTION LINEAGE MANIFEST
  ), observed_functions AS MATERIALIZED (
    SELECT expected.*, routine.oid, routine.proowner, routine.proacl,
      routine.prokind, routine.provolatile, routine.prosecdef,
      routine.proisstrict, routine.proleakproof, routine.proparallel,
      routine.proretset, routine.pronargdefaults, routine.proargdefaults,
      routine.proargmodes::text[] AS actual_argument_modes,
      routine.proconfig, routine.provariadic, routine.prosupport,
      routine.probin, routine.prosqlbody, language_row.lanname,
      pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
      pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
      pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
        AS actual_source_hash,
      (
        SELECT pg_catalog.count(*)::integer
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname = pg_catalog.split_part(
            pg_catalog.split_part(expected.signature, '(', 1), '.', 2
          )
      ) AS actual_overload_count
    FROM expected_functions AS expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = routine.prolang
  ), function_checks AS MATERIALIZED (
    SELECT observed.*,
      COALESCE(observed.actual_source_hash = observed.source_hash, false)
        AS source_exact,
      COALESCE(
        observed.oid IS NOT NULL
          AND observed.prokind = 'f'
          AND observed.actual_overload_count = 1
          AND observed.actual_arguments = observed.exact_arguments
          AND observed.actual_result = observed.result_type
          AND observed.lanname = observed.language_name
          AND observed.provolatile::text = observed.volatility
          AND observed.prosecdef = observed.security_definer
          AND observed.proisstrict = observed.is_strict
          AND NOT observed.proleakproof
          AND observed.proparallel::text = observed.parallel_safety
          AND observed.proretset = observed.returns_set
          AND observed.pronargdefaults = observed.default_count
          AND ((observed.default_count = 0 AND observed.proargdefaults IS NULL)
            OR (observed.default_count > 0 AND observed.proargdefaults IS NOT NULL))
          AND observed.actual_argument_modes
            IS NOT DISTINCT FROM observed.argument_modes
          AND observed.proconfig = ARRAY['search_path=""']::text[]
          AND observed.proowner = roles.postgres_oid
          AND observed.provariadic = 0::oid
          AND observed.prosupport = 0::oid
          AND observed.probin IS NULL
          AND observed.prosqlbody IS NULL
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_depend AS dependency
            WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
              AND dependency.objid = observed.oid
              AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
              AND dependency.refobjid = pg_catalog.to_regnamespace('public')
          )
          AND (observed.language_name = 'sql' OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_depend AS dependency
            JOIN pg_catalog.pg_language AS dependency_language
              ON dependency_language.oid = dependency.refobjid
            WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
              AND dependency.objid = observed.oid
              AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
              AND dependency_language.lanname = observed.language_name
          ))
          AND NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_depend AS dependency
            WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
              AND dependency.objid = observed.oid
              AND dependency.deptype = 'e'
          )
          AND (
            SELECT pg_catalog.count(*) = CASE
                WHEN observed.language_name = 'plpgsql' THEN 2 ELSE 1
              END
              AND COALESCE(pg_catalog.bool_and(
                dependency.objsubid = 0
                  AND dependency.refobjsubid = 0
                  AND dependency.deptype = 'n'
                  AND (
                    (
                      dependency.refclassid =
                        'pg_catalog.pg_namespace'::pg_catalog.regclass
                      AND dependency.refobjid =
                        pg_catalog.to_regnamespace('public')
                    )
                    OR (
                      observed.language_name = 'plpgsql'
                      AND dependency.refclassid =
                        'pg_catalog.pg_language'::pg_catalog.regclass
                      AND dependency.refobjid = (
                        SELECT language_row.oid
                        FROM pg_catalog.pg_language AS language_row
                        WHERE language_row.lanname = 'plpgsql'
                      )
                    )
                  )
              ), false)
            FROM pg_catalog.pg_depend AS dependency
            WHERE dependency.classid =
                'pg_catalog.pg_proc'::pg_catalog.regclass
              AND dependency.objid = observed.oid
          ), false
      ) AS metadata_exact,
      CASE WHEN observed.oid IS NULL
        OR roles.postgres_oid IS NULL OR roles.service_role_oid IS NULL
        OR roles.anon_oid IS NULL OR roles.authenticated_oid IS NULL
        THEN false
        ELSE (
          SELECT pg_catalog.count(*) = CASE
                WHEN observed.service_execute THEN 2 ELSE 1 END
            AND pg_catalog.count(*) FILTER (
              WHERE acl.grantee = roles.postgres_oid
            ) = 1
            AND pg_catalog.count(*) FILTER (
              WHERE acl.grantee = roles.service_role_oid
            ) = CASE WHEN observed.service_execute THEN 1 ELSE 0 END
            AND COALESCE(pg_catalog.bool_and(
              acl.privilege_type = 'EXECUTE'
                AND acl.grantor = roles.postgres_oid
                AND NOT acl.is_grantable
                AND (acl.grantee = roles.postgres_oid OR (
                  observed.service_execute
                  AND acl.grantee = roles.service_role_oid
                ))
            ), false)
          FROM pg_catalog.aclexplode(COALESCE(
            observed.proacl,
            pg_catalog.acldefault('f', observed.proowner)
          )) AS acl
        )
      END AS acl_exact
    FROM observed_functions AS observed CROSS JOIN roles
  ), relation_manifest(name, force_rls, expected_nonowner_acl)
  AS MATERIALIZED (
    VALUES
      ('expense_private_drafts', true, ARRAY[]::text[]),
      ('expense_unconfirmed_publications', true, ARRAY[]::text[]),
      ('expense_unconfirmed_publication_parties', true, ARRAY[]::text[]),
      ('expense_unconfirmed_publication_audience', true, ARRAY[]::text[]),
      ('expense_edit_revision_bindings', true, ARRAY[]::text[]),
      ('expense_groups', false, ARRAY['service_role:SELECT']::text[]),
      ('expense_group_members', false, ARRAY['service_role:SELECT']::text[]),
      ('expenses', false, ARRAY['service_role:SELECT']::text[]),
      ('expense_payments', false, ARRAY['service_role:SELECT']::text[]),
      ('expense_shares', false, ARRAY['service_role:SELECT']::text[]),
      ('expense_repayments', false, ARRAY['service_role:SELECT']::text[]),
      ('expense_member_identity_bindings', true, ARRAY[]::text[]),
      ('relationships', false, ARRAY[
        'service_role:DELETE','service_role:INSERT',
        'service_role:SELECT','service_role:UPDATE']::text[]),
      ('profiles', false, ARRAY[
        'authenticated:INSERT','authenticated:SELECT',
        'authenticated:UPDATE','service_role:INSERT',
        'service_role:SELECT']::text[]),
      ('relationship_circles', true, ARRAY['service_role:SELECT']::text[]),
      ('relationship_circle_members', true, ARRAY['service_role:SELECT']::text[]),
      ('relationship_circle_expense_contexts', true,
        ARRAY['service_role:SELECT']::text[])
  ), relation_checks AS MATERIALIZED (
    SELECT pg_catalog.count(class_row.oid) = 17
      AND COALESCE(pg_catalog.bool_and(
        class_row.oid IS NOT NULL
          AND class_row.relkind = 'r'
          AND class_row.relpersistence = 'p'
          AND class_row.relrowsecurity
          AND class_row.relforcerowsecurity = manifest.force_rls
          AND owner_role.rolname = 'postgres'
          AND COALESCE((
            SELECT pg_catalog.array_agg(
              COALESCE(grantee_role.rolname::text, 'PUBLIC')
                || ':' || acl.privilege_type
              ORDER BY (COALESCE(grantee_role.rolname::text, 'PUBLIC')
                || ':' || acl.privilege_type) COLLATE pg_catalog."C"
            )::text[]
            FROM pg_catalog.aclexplode(COALESCE(
              class_row.relacl,
              pg_catalog.acldefault('r', class_row.relowner)
            )) AS acl
            LEFT JOIN pg_catalog.pg_roles AS grantee_role
              ON grantee_role.oid = acl.grantee
            WHERE acl.grantee <> class_row.relowner
          ), ARRAY[]::text[]) = manifest.expected_nonowner_acl
          AND NOT EXISTS (
            SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
              class_row.relacl,
              pg_catalog.acldefault('r', class_row.relowner)
            )) AS acl
            WHERE acl.grantor <> class_row.relowner OR acl.is_grantable
          )
          AND NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_attribute AS attribute
            WHERE attribute.attrelid = class_row.oid
              AND attribute.attnum > 0 AND NOT attribute.attisdropped
              AND attribute.attacl IS NOT NULL
          )
      ), false) AS relations_exact
    FROM relation_manifest AS manifest
    LEFT JOIN pg_catalog.pg_class AS class_row
      ON class_row.oid = pg_catalog.to_regclass('public.' || manifest.name)
    LEFT JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = class_row.relowner
  ), required_columns(relation_name, column_name, type_name)
  AS MATERIALIZED (
    VALUES
      ('expense_private_drafts','id','uuid'),
      ('expense_private_drafts','actor_user_id','uuid'),
      ('expense_private_drafts','context_type','text'),
      ('expense_private_drafts','group_id','uuid'),
      ('expense_private_drafts','expense_id','uuid'),
      ('expense_private_drafts','current_step','text'),
      ('expense_private_drafts','payload','jsonb'),
      ('expense_private_drafts','version','bigint'),
      ('expense_unconfirmed_publications','draft_id','uuid'),
      ('expense_unconfirmed_publications','actor_user_id','uuid'),
      ('expense_unconfirmed_publications','context_type','text'),
      ('expense_unconfirmed_publications','group_id','uuid'),
      ('expense_unconfirmed_publications','is_live','boolean'),
      ('expense_unconfirmed_publications','source_draft_version','bigint'),
      ('expense_edit_revision_bindings','draft_id','uuid'),
      ('expense_edit_revision_bindings','expense_id','uuid'),
      ('expense_edit_revision_bindings','group_id','uuid'),
      ('expense_edit_revision_bindings','actor_user_id','uuid'),
      ('expense_edit_revision_bindings','mode','text'),
      ('expense_groups','id','uuid'),
      ('expense_groups','status','text'),
      ('expense_group_members','id','uuid'),
      ('expense_group_members','group_id','uuid'),
      ('expense_group_members','user_id','uuid'),
      ('expense_group_members','status','text'),
      ('expenses','id','uuid'),
      ('expenses','group_id','uuid'),
      ('expenses','status','text'),
      ('expense_member_identity_bindings','group_id','uuid'),
      ('expense_member_identity_bindings','member_id','uuid'),
      ('expense_member_identity_bindings','target_user_id','uuid')
  ), column_checks AS MATERIALIZED (
    SELECT pg_catalog.count(attribute.attnum) = 31
      AND COALESCE(pg_catalog.bool_and(
        attribute.attnum > 0 AND NOT attribute.attisdropped
          AND pg_catalog.format_type(
            attribute.atttypid, attribute.atttypmod
          ) = required.type_name
      ), false) AS columns_exact
    FROM required_columns AS required
    LEFT JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = pg_catalog.to_regclass(
        'public.' || required.relation_name
      )
     AND attribute.attname = required.column_name
  )
  SELECT pg_catalog.count(check_row.oid) = 29
      AND COALESCE(pg_catalog.bool_and(check_row.source_exact), false),
    pg_catalog.count(check_row.oid) = 29
      AND COALESCE(pg_catalog.bool_and(check_row.metadata_exact), false),
    pg_catalog.count(check_row.oid) = 29
      AND COALESCE(pg_catalog.bool_and(check_row.acl_exact), false),
    pg_catalog.count(check_row.oid) = 29
      AND COALESCE(pg_catalog.bool_and(
        check_row.source_exact AND check_row.metadata_exact
          AND check_row.acl_exact
      ), false),
    pg_catalog.bool_and(
      relation_checks.relations_exact AND column_checks.columns_exact
    )
  FROM function_checks AS check_row
  CROSS JOIN relation_checks CROSS JOIN column_checks
), evidence AS MATERIALIZED (
  SELECT current_user = 'postgres' AND session_user = 'postgres'
      AS executor_ok,
    target_contract.contract_exact AS target_contract_exact,
    target_acl.exact AS target_acl_exact,
    target_dependencies.exact AS target_dependencies_exact,
    target_contract.predecessor_source_exact,
    target_contract.target_source_exact,
    adapter.oid IS NULL AND adapter.overload_count = 0 AS adapter_absent,
    adapter_contract.contract_exact AS adapter_contract_exact,
    adapter_contract.source_exact AS adapter_source_exact,
    adapter_acl.exact AS adapter_acl_exact,
    adapter_dependencies.exact AS adapter_dependencies_exact,
    lineage.helper_sources_exact,
    lineage.helper_metadata_dependencies_exact,
    lineage.helper_acls_exact,
    lineage.helper_lineage_exact,
    lineage.relation_lineage_exact
  FROM target_contract CROSS JOIN target_acl CROSS JOIN target_dependencies
  CROSS JOIN adapter CROSS JOIN adapter_contract CROSS JOIN adapter_acl
  CROSS JOIN adapter_dependencies CROSS JOIN lineage
)
SELECT evidence.*,
  CASE
    WHEN executor_ok AND target_contract_exact AND target_acl_exact
      AND target_dependencies_exact AND target_source_exact
      AND adapter_contract_exact AND adapter_source_exact
      AND adapter_acl_exact AND adapter_dependencies_exact
      AND helper_lineage_exact AND relation_lineage_exact
      THEN 'EXACT_INSTALLED'
    WHEN executor_ok AND target_contract_exact AND target_acl_exact
      AND target_dependencies_exact AND predecessor_source_exact
      AND adapter_absent AND helper_lineage_exact AND relation_lineage_exact
      THEN 'PREDECESSOR_READY'
    ELSE 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT'
  END AS installation_state
FROM evidence;

ROLLBACK;

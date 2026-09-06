-- SQL174 DASHBOARD RUNTIME DIAGNOSTIC: read-only unavailable-branch classification.
-- Replace the single typed actor placeholder privately before a separately
-- authorized manual run. This is a diagnostic artifact, not a migration.
--
-- The SQL172 target, adapter, 29-helper, 17-relation and 31-column catalog
-- closure is verified before any application-row read or helper invocation.
-- The diagnostic never calls the installed dashboard RPC, never performs
-- application DML and never creates temporary or persistent objects.
--
-- Every probed domain is capped at 101 rows. The controlled P1741 result emits
-- only fixed classifications, booleans, capped counts, a five-character
-- SQLSTATE/category and an allowlisted P0001 token. It never emits actor,
-- Expense, draft, group or presentation identifiers; titles, labels, payloads,
-- amounts, timestamps, raw error text, details, hints or context.
--
-- It relies on the Supabase SQL Editor/platform execution timeout. QUERY_CANCELED
-- and ASSERT_FAILURE are intentionally not caught, so an external cancellation
-- can end without a diagnostic result.
DO $sql174_dashboard_runtime_diagnostic$
DECLARE
  p_actor_id uuid;
  v_actor_account_exists boolean;
  v_actor_beta_access boolean;
  v_identity_binding_conflict boolean;
  v_invalid_visible_bindings_count integer;
  v_invalid_visible_publications_count integer;
  v_invalid_visible_private_edits_count integer;
  v_candidate_count integer;
  v_distinct_candidate_count integer;
  v_discarded_rows jsonb;
  v_private_creation_draft_ids uuid[];
  v_live_publication_actor_ids uuid[];
  v_live_publication_draft_ids uuid[];
  v_settlement_group_ids uuid[];
  v_probe_actor_id uuid;
  v_probe_draft_id uuid;
  v_probe_group_id uuid;
  v_probe_index integer := 0;
  v_private_creation_probe_count integer;
  v_private_creation_completed_count integer := 0;
  v_private_adapter_contained_count integer := 0;
  v_live_publication_probe_count integer;
  v_live_publication_completed_count integer := 0;
  v_settlement_probe_count integer;
  v_settlement_completed_count integer := 0;
  v_classification text;
  v_failing_helper_substage text;
  v_stage text := 'actor_input';
  v_sqlstate text;
  v_error_category text;
  v_sql172_lineage_exact boolean := false;
  v_probe_projection jsonb;
  v_message text;
  v_p0001_token text;
  v_js_whitespace constant text :=
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680' ||
    U&'\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A' ||
    U&'\2028\2029\202F\205F\3000\FEFF';
  v_email_shaped_pattern constant text :=
    U&'(^|[\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF])' ||
    U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF@]+@' ||
    U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF@]+[.]' ||
    U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF@]+' ||
    U&'($|[\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF])';
BEGIN
  BEGIN
    p_actor_id := '__STEBBI_PRIVATE_ACTOR_UUID__'::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_classification := 'actor_admission';
    v_sqlstate := SQLSTATE;
  END;

  IF v_classification IS NULL THEN
    v_stage := 'sql172_catalog';
    BEGIN
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
      SELECT COALESCE((
        executor_ok
          AND target_contract_exact
          AND target_acl_exact
          AND target_dependencies_exact
          AND target_source_exact
          AND NOT predecessor_source_exact
          AND NOT adapter_absent
          AND adapter_contract_exact
          AND adapter_source_exact
          AND adapter_acl_exact
          AND adapter_dependencies_exact
          AND helper_lineage_exact
          AND relation_lineage_exact
        ), false)
      INTO v_sql172_lineage_exact
      FROM evidence;
      IF NOT v_sql172_lineage_exact THEN
        v_classification := 'catalog_drift';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_classification := 'catalog_drift';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'actor_admission';
    BEGIN
      SELECT EXISTS (
        SELECT 1
        FROM auth.users AS account
        WHERE account.id = p_actor_id
      )
      INTO v_actor_account_exists;

      IF NOT v_actor_account_exists THEN
        v_classification := 'actor_admission';
      ELSE
        SELECT public.expense_has_beta_access(p_actor_id)
        INTO v_actor_beta_access;

        IF NOT v_actor_beta_access THEN
          v_classification := 'actor_admission';
        ELSE
          -- Exercise the same two admission helpers used by SQL172 after the
          -- separately reported safe booleans establish the expected branch.
          PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
          PERFORM public.expense_assert_beta_actor(p_actor_id);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_classification := 'actor_admission';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'identity_binding';
    BEGIN
      v_identity_binding_conflict := EXISTS (
-- BEGIN EXACT SQL172 IDENTITY-CONFLICT PREDICATE
    SELECT 1
    FROM public.expense_group_members AS member
    JOIN public.expense_member_identity_bindings AS identity_binding
      ON identity_binding.group_id = member.group_id
     AND identity_binding.member_id = member.id
    JOIN public.expenses AS expense ON expense.group_id = member.group_id
    JOIN public.expense_group_members AS actor_member
      ON actor_member.group_id = expense.group_id
     AND actor_member.user_id = p_actor_id
     AND actor_member.status = 'active'
    WHERE member.user_id IS NOT NULL
      AND identity_binding.target_user_id IS NOT NULL
      AND member.user_id IS DISTINCT FROM identity_binding.target_user_id
    -- END EXACT SQL172 IDENTITY-CONFLICT PREDICATE
      );

      IF v_identity_binding_conflict THEN
        v_classification := 'identity_binding_conflict';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_classification := 'identity_binding_conflict';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'private_creation_domain';
    BEGIN
      -- BEGIN EXACT SQL174 PRIVATE-CREATION NORMALIZER DOMAIN
      WITH private_creation_probe_domain AS MATERIALIZED (
        SELECT draft.id AS draft_id
        FROM public.expense_private_drafts AS draft
        LEFT JOIN LATERAL (
          SELECT CASE
            WHEN pg_catalog.jsonb_typeof(draft.payload->'total') = 'string'
              THEN pg_catalog.regexp_replace(
                pg_catalog.btrim(draft.payload->>'total'), '[[:space:]]+', '', 'g'
              )
            ELSE NULL
          END AS raw_total
        ) AS raw ON true
        LEFT JOIN LATERAL (
          SELECT CASE
            WHEN raw.raw_total ~ '^[0-9]+([.,][0-9]+)?$'
              AND NOT (
                pg_catalog.strpos(raw.raw_total, '.') > 0
                AND pg_catalog.strpos(raw.raw_total, ',') > 0
              )
              THEN pg_catalog.replace(raw.raw_total, ',', '.')::numeric
            ELSE NULL
          END AS major_amount
        ) AS parsed ON true
        LEFT JOIN LATERAL (
          SELECT CASE
            WHEN draft.payload->>'currency' = 'ISK'
              AND parsed.major_amount > 0
              AND pg_catalog.scale(parsed.major_amount) = 0
              AND parsed.major_amount <= 9007199254740991
              THEN parsed.major_amount::bigint
            WHEN draft.payload->>'currency' IN ('EUR','USD','GBP','DKK','NOK','SEK')
              AND parsed.major_amount > 0
              AND pg_catalog.scale(parsed.major_amount) <= 2
              AND parsed.major_amount * 100 <= 9007199254740991
              THEN (parsed.major_amount * 100)::bigint
            ELSE NULL
          END AS total_minor
        ) AS summary ON true
        WHERE draft.actor_user_id = p_actor_id
          AND draft.context_type IN ('one_off', 'group')
          AND (
            draft.context_type = 'one_off'
            OR (
              draft.context_type = 'group'
              AND EXISTS (
                SELECT 1
                FROM public.expense_groups AS expense_group
                WHERE expense_group.id = draft.group_id
                  AND expense_group.status = 'active'
                  AND public.expense_active_member_role(
                    p_actor_id, expense_group.id
                  ) IS NOT NULL
              )
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.expense_unconfirmed_publications AS publication
            WHERE publication.draft_id = draft.id
              AND publication.is_live
          )
          AND draft.current_step = 'split'
          AND summary.total_minor IS NOT NULL
        ORDER BY draft.id
        LIMIT 101
      )
      SELECT COALESCE(
        pg_catalog.array_agg(domain.draft_id ORDER BY domain.draft_id),
        ARRAY[]::uuid[]
      )
      INTO v_private_creation_draft_ids
      FROM private_creation_probe_domain AS domain;
      -- END EXACT SQL174 PRIVATE-CREATION NORMALIZER DOMAIN

      v_private_creation_probe_count :=
        pg_catalog.cardinality(v_private_creation_draft_ids);
      v_stage := 'private_adapter';
      FOREACH v_probe_draft_id IN ARRAY v_private_creation_draft_ids LOOP
        v_probe_projection := public.expense_sql172_project_private_draft(
          p_actor_id, v_probe_draft_id
        );
        IF v_probe_projection IS NULL THEN
          v_private_adapter_contained_count :=
            v_private_adapter_contained_count + 1;
        END IF;
        v_private_creation_completed_count :=
          v_private_creation_completed_count + 1;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
      v_failing_helper_substage := v_stage;
      IF v_sqlstate = 'P0001' THEN
        GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
        v_p0001_token := CASE
          WHEN v_message IN (
            'expense_unconfirmed_invalid_draft',
            'expense_unconfirmed_not_found',
            'expense_unconfirmed_event_unavailable',
            'expense_unconfirmed_source_changed',
            'expense_unconfirmed_duplicate_identity',
            'expense_unconfirmed_author_required',
            'teskeid_event_not_found',
            'teskeid_event_unavailable'
          ) THEN v_message
          ELSE 'unrecognized_p0001'
        END;
      END IF;
      v_classification := CASE
        WHEN v_stage = 'private_adapter' THEN 'private_adapter_exception'
        ELSE 'projection_residual_exception'
      END;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'live_publication_domain';
    BEGIN
      -- BEGIN EXACT SQL174 LIVE-PUBLICATION NORMALIZER DOMAIN
      WITH live_publication_probe_domain AS MATERIALIZED (
        SELECT publication.actor_user_id, publication.draft_id
        FROM public.expense_unconfirmed_publications AS publication
        JOIN public.expense_private_drafts AS draft
          ON draft.id = publication.draft_id
         AND draft.actor_user_id = publication.actor_user_id
        WHERE publication.is_live
          AND (
            publication.actor_user_id = p_actor_id
            OR public.expense_sql159_audience_allows(
              p_actor_id, publication.draft_id
            )
          )
          AND publication.source_draft_version = draft.version
          AND NOT EXISTS (
            SELECT 1
            FROM public.expense_edit_revision_bindings AS binding
            JOIN public.expense_private_drafts AS binding_draft
              ON binding_draft.id = binding.draft_id
             AND binding_draft.context_type = 'edit'
             AND binding_draft.expense_id = binding.expense_id
             AND binding_draft.group_id = binding.group_id
             AND binding_draft.actor_user_id = binding.actor_user_id
            JOIN public.expenses AS expense
              ON expense.id = binding.expense_id
             AND expense.group_id = binding.group_id
             AND expense.status = 'active'
            LEFT JOIN public.expense_unconfirmed_publications
              AS binding_publication
              ON binding_publication.draft_id = binding.draft_id
            WHERE binding.draft_id = publication.draft_id
              AND (
                (binding.mode = 'private'
                  AND binding_publication.is_live IS NOT DISTINCT FROM false)
                OR (binding.mode = 'private'
                  AND binding_publication.draft_id IS NULL)
                OR (binding.mode = 'shared'
                  AND binding_publication.is_live IS TRUE
                  AND binding_publication.actor_user_id = binding.actor_user_id
                  AND binding_publication.context_type = 'group'
                  AND binding_publication.group_id = binding.group_id)
              )
          )
        ORDER BY publication.draft_id
        LIMIT 101
      )
      SELECT COALESCE(
          pg_catalog.array_agg(
            domain.actor_user_id ORDER BY domain.draft_id
          ),
          ARRAY[]::uuid[]
        ),
        COALESCE(
          pg_catalog.array_agg(domain.draft_id ORDER BY domain.draft_id),
          ARRAY[]::uuid[]
        )
      INTO v_live_publication_actor_ids, v_live_publication_draft_ids
      FROM live_publication_probe_domain AS domain;
      -- END EXACT SQL174 LIVE-PUBLICATION NORMALIZER DOMAIN

      v_live_publication_probe_count :=
        pg_catalog.cardinality(v_live_publication_draft_ids);
      v_probe_index := 0;
      v_stage := 'live_publication_normalizer';
      FOREACH v_probe_draft_id IN ARRAY v_live_publication_draft_ids LOOP
        v_probe_index := v_probe_index + 1;
        v_probe_actor_id := v_live_publication_actor_ids[v_probe_index];
        PERFORM public.expense_sql159_normalize_private_draft(
          v_probe_actor_id, v_probe_draft_id, false
        );
        v_live_publication_completed_count :=
          v_live_publication_completed_count + 1;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
      v_failing_helper_substage := v_stage;
      IF v_sqlstate = 'P0001' THEN
        GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
        v_p0001_token := CASE
          WHEN v_message IN (
            'expense_unconfirmed_invalid_draft',
            'expense_unconfirmed_not_found',
            'expense_unconfirmed_event_unavailable',
            'expense_unconfirmed_source_changed',
            'expense_unconfirmed_duplicate_identity',
            'expense_unconfirmed_author_required',
            'teskeid_event_not_found',
            'teskeid_event_unavailable'
          ) THEN v_message
          ELSE 'unrecognized_p0001'
        END;
      END IF;
      v_classification := CASE
        WHEN v_stage = 'live_publication_normalizer'
          THEN 'live_publication_normalizer_exception'
        ELSE 'projection_residual_exception'
      END;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'settlement_domain';
    BEGIN
      -- BEGIN EXACT SQL174 SETTLEMENT-CONSISTENCY DOMAIN
      WITH actor_groups AS MATERIALIZED (
        SELECT DISTINCT member.group_id
        FROM public.expense_group_members AS member
        WHERE member.user_id = p_actor_id
          AND member.status = 'active'
      ),
      settlement_probe_domain AS MATERIALIZED (
        SELECT expense.id AS expense_id, expense.group_id
        FROM public.expenses AS expense
        JOIN actor_groups AS actor_group
          ON actor_group.group_id = expense.group_id
        JOIN public.expense_groups AS group_row
          ON group_row.id = expense.group_id
        WHERE group_row.status IN ('active', 'settling', 'settled', 'closed')
          AND NOT EXISTS (
            SELECT 1
            FROM public.expense_edit_revision_bindings AS binding
            WHERE binding.expense_id = expense.id
          )
          AND (
            CASE WHEN expense.status = 'cancelled' THEN false ELSE true END
          )
        ORDER BY expense.id
        LIMIT 101
      )
      SELECT COALESCE(
        pg_catalog.array_agg(domain.group_id ORDER BY domain.expense_id),
        ARRAY[]::uuid[]
      )
      INTO v_settlement_group_ids
      FROM settlement_probe_domain AS domain;
      -- END EXACT SQL174 SETTLEMENT-CONSISTENCY DOMAIN

      v_settlement_probe_count := pg_catalog.cardinality(v_settlement_group_ids);
      v_stage := 'settlement_helper';
      FOREACH v_probe_group_id IN ARRAY v_settlement_group_ids LOOP
        PERFORM 1
        FROM public.expense_settlement_eligible_balances_v1(
          v_probe_group_id, false
        );
        v_settlement_completed_count := v_settlement_completed_count + 1;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
      v_failing_helper_substage := v_stage;
      IF v_sqlstate = 'P0001' THEN
        GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
        v_p0001_token := CASE
          WHEN v_message IN (
            'expense_unconfirmed_invalid_draft',
            'expense_unconfirmed_not_found',
            'expense_unconfirmed_event_unavailable',
            'expense_unconfirmed_source_changed',
            'expense_unconfirmed_duplicate_identity',
            'expense_unconfirmed_author_required',
            'teskeid_event_not_found',
            'teskeid_event_unavailable'
          ) THEN v_message
          ELSE 'unrecognized_p0001'
        END;
      END IF;
      v_classification := CASE
        WHEN v_stage = 'settlement_helper' THEN 'settlement_helper_exception'
        ELSE 'projection_residual_exception'
      END;
    END;
  END IF;

  IF v_classification IS NULL THEN
    v_stage := 'projection_query';
    BEGIN
    -- BEGIN EXACT SQL174 PROJECTION CTES
WITH actor_groups AS (
    SELECT DISTINCT member.group_id
    FROM public.expense_group_members AS member
    WHERE member.user_id = p_actor_id AND member.status = 'active'
  ),
  exact_bindings AS (
    SELECT binding.*, draft.version AS draft_version,
      draft.payload, draft.created_at AS draft_created_at,
      draft.updated_at AS draft_updated_at,
      publication.publication_id, publication.publication_version,
      publication.is_live, publication.title AS publication_title,
      publication.total_minor AS publication_total_minor,
      publication.currency AS publication_currency,
      publication.updated_at AS publication_updated_at,
      publication.published_at, publication.source_draft_version,
      expense.title AS expense_title,
      expense.total_minor AS expense_total_minor,
      expense.currency AS expense_currency
    FROM public.expense_edit_revision_bindings AS binding
    JOIN public.expense_private_drafts AS draft
      ON draft.id = binding.draft_id
     AND draft.context_type = 'edit'
     AND draft.expense_id = binding.expense_id
     AND draft.group_id = binding.group_id
     AND draft.actor_user_id = binding.actor_user_id
    JOIN public.expenses AS expense
      ON expense.id = binding.expense_id
     AND expense.group_id = binding.group_id
     AND expense.status = 'active'
    LEFT JOIN public.expense_unconfirmed_publications AS publication
      ON publication.draft_id = binding.draft_id
    WHERE (binding.mode = 'private' AND publication.is_live IS NOT DISTINCT FROM false)
       OR (binding.mode = 'private' AND publication.draft_id IS NULL)
       OR (binding.mode = 'shared' AND publication.is_live IS TRUE
         AND publication.actor_user_id = binding.actor_user_id
         AND publication.context_type = 'group'
         AND publication.group_id = binding.group_id)
  ),
  invalid_visible_bindings AS (
    SELECT binding.draft_id
    FROM public.expense_edit_revision_bindings AS binding
    JOIN public.expenses AS expense
      ON expense.id = binding.expense_id
     AND expense.group_id = binding.group_id
    JOIN actor_groups AS actor_group
      ON actor_group.group_id = expense.group_id
    WHERE (
        binding.actor_user_id = p_actor_id
        OR public.expense_sql159_audience_allows(p_actor_id, binding.draft_id)
      )
      AND NOT EXISTS (
      SELECT 1
      FROM exact_bindings AS exact_binding
      WHERE exact_binding.draft_id = binding.draft_id
        AND exact_binding.expense_id = binding.expense_id
        AND exact_binding.group_id = binding.group_id
        AND exact_binding.actor_user_id = binding.actor_user_id
    )
  ),
  actor_relevant_live_publications AS (
    SELECT publication.*
    FROM public.expense_unconfirmed_publications AS publication
    WHERE publication.is_live
      AND (
        publication.actor_user_id = p_actor_id
        OR public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
      )
  ),
  visible_live_publications AS (
    SELECT publication.*
    FROM actor_relevant_live_publications AS publication
    WHERE public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
  ),
  live_publication_sources AS (
    SELECT publication.draft_id, publication.context_type,
      draft.version AS current_draft_version, source.normalized,
      source.normalized IS NOT NULL
        AND (source.normalized->>'draft_version')::bigint
          = publication.source_draft_version
        AND source.normalized->>'shareable_fingerprint'
          = publication.shareable_fingerprint
        AND source.normalized->>'authority_fingerprint'
          = publication.authority_fingerprint
        AND source.normalized->>'context_type' = publication.context_type
        AND (source.normalized->>'group_id')::uuid
          IS NOT DISTINCT FROM publication.group_id
        AND (source.normalized->>'event_id')::uuid
          IS NOT DISTINCT FROM publication.event_id
        AND (source.normalized->>'event_roster_revision')::bigint
          IS NOT DISTINCT FROM publication.event_roster_revision
        AND (source.normalized->>'link_to_event')::boolean
          IS NOT DISTINCT FROM publication.link_to_event
        AND source.normalized->>'visibility' = publication.visibility
        AND source.normalized->>'title' = publication.title
        AND (source.normalized->>'total_minor')::bigint = publication.total_minor
        AND source.normalized->>'currency' = publication.currency
        AND (source.normalized->>'incurred_on')::date = publication.incurred_on
        AND source.normalized->>'allocation_state' = publication.allocation_state
        AND source.normalized->'parties' = (
          SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'ordinal', party.ordinal,
            'party_key_hash', party.party_key_hash,
            'identity_token_hash', party.identity_token_hash,
            'display_name', party.display_name,
            'is_author', party.is_author,
            'is_payer', party.is_payer,
            'is_participant', party.is_participant,
            'paid_minor', party.paid_minor,
            'share_minor', party.share_minor
          ) ORDER BY party.ordinal), '[]'::jsonb)
          FROM public.expense_unconfirmed_publication_parties AS party
          WHERE party.draft_id = publication.draft_id
        )
        AND (
          SELECT COALESCE(pg_catalog.jsonb_agg(normalized_audience.value
            ORDER BY normalized_audience.value->>'user_id' COLLATE pg_catalog."C"),
            '[]'::jsonb)
          FROM pg_catalog.jsonb_array_elements(
            source.normalized->'audience'
          ) AS normalized_audience(value)
        ) = (
          SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'user_id', audience.user_id,
            'audience_kind', audience.audience_kind,
            'identity_token_hash', audience.identity_token_hash,
            'binding_id', audience.binding_id,
            'binding_generation', audience.binding_generation
          ) ORDER BY audience.user_id::text COLLATE pg_catalog."C"), '[]'::jsonb)
          FROM public.expense_unconfirmed_publication_audience AS audience
          WHERE audience.draft_id = publication.draft_id
        ) AS source_exact
    FROM actor_relevant_live_publications AS publication
    JOIN public.expense_private_drafts AS draft
      ON draft.id = publication.draft_id
     AND draft.actor_user_id = publication.actor_user_id
    LEFT JOIN exact_bindings AS binding
      ON binding.draft_id = publication.draft_id
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN publication.source_draft_version = draft.version
          THEN public.expense_sql159_normalize_private_draft(
            publication.actor_user_id, publication.draft_id, false
          )
        ELSE NULL::jsonb
      END AS normalized
    ) AS source ON true
    WHERE binding.draft_id IS NULL
  ),
  shared_one_off_sources AS (
    SELECT source.draft_id, (source.normalized->>'circle_id')::uuid AS circle_id
    FROM live_publication_sources AS source
    WHERE source.context_type = 'one_off'
      AND source.normalized IS NOT NULL
      AND source.source_exact IS TRUE
  ),
  invalid_visible_publications AS (
    SELECT publication.draft_id
    FROM actor_relevant_live_publications AS publication
    LEFT JOIN exact_bindings AS binding
      ON binding.draft_id = publication.draft_id
    LEFT JOIN live_publication_sources AS source
      ON source.draft_id = publication.draft_id
    WHERE publication.title IS NULL
       OR pg_catalog.char_length(pg_catalog.btrim(publication.title)) NOT BETWEEN 1 AND 200
       OR publication.total_minor IS NULL
       OR publication.total_minor NOT BETWEEN 1 AND 9007199254740991
       OR publication.currency IS NULL
       OR publication.currency NOT IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK')
       OR publication.updated_at IS NULL
       OR publication.published_at IS NULL
       OR NOT public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
       OR (
         source.normalized IS NOT NULL
         AND source.source_exact IS NOT TRUE
       )
       OR NOT (
         (binding.draft_id IS NOT NULL AND binding.mode = 'shared')
         OR (binding.draft_id IS NULL
           AND publication.context_type IN ('one_off', 'group')
           AND public.expense_sql159_snapshot_is_valid(publication.draft_id))
       )
  ),
  invalid_visible_private_edits AS (
    SELECT binding.draft_id
    FROM exact_bindings AS binding
    WHERE binding.mode = 'private'
      AND binding.actor_user_id = p_actor_id
      AND (
        pg_catalog.jsonb_typeof(binding.payload->'included') <> 'object'
        OR pg_catalog.jsonb_typeof(binding.payload->'payerKeys') <> 'array'
      )
  ),
  invalid_visible_states AS (
    SELECT draft_id FROM invalid_visible_bindings
    UNION ALL
    SELECT draft_id FROM invalid_visible_publications
    UNION ALL
    SELECT draft_id FROM invalid_visible_private_edits
  ),
  publication_person_facets AS (
    SELECT publication.draft_id,
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', CASE WHEN resolved.target_user_id IS NOT NULL
          THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
            || p_actor_id::text || '|' || resolved.target_user_id::text)
          ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
            || p_actor_id::text || '|shared|' || publication.draft_id::text
            || '|' || party.party_key_hash)
        END,
        'label', CASE
          WHEN resolved.private_name IS NOT NULL
            AND pg_catalog.strpos(resolved.private_name, '@') = 0
            AND resolved.private_name !~ '[[:cntrl:]]'
            AND pg_catalog.translate(resolved.private_name,
              U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = resolved.private_name
            THEN resolved.private_name
          WHEN resolved.profile_name IS NOT NULL
            AND pg_catalog.strpos(resolved.profile_name, '@') = 0
            AND resolved.profile_name !~ '[[:cntrl:]]'
            AND pg_catalog.translate(resolved.profile_name,
              U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = resolved.profile_name
            THEN resolved.profile_name
          WHEN pg_catalog.strpos(party.display_name, '@') = 0
            AND party.display_name !~ '[[:cntrl:]]'
            AND pg_catalog.translate(party.display_name,
              U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = party.display_name
            THEN pg_catalog.btrim(party.display_name)
          WHEN resolved.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
          ELSE 'Gestur'
        END,
        'kind', CASE WHEN resolved.target_user_id IS NULL
          THEN 'manual' ELSE 'durable' END
      ) ORDER BY party.ordinal), '[]'::jsonb) AS facets
    FROM visible_live_publications AS publication
    JOIN public.expense_unconfirmed_publication_parties AS party
      ON party.draft_id = publication.draft_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN party.is_author THEN publication.actor_user_id
        ELSE audience.user_id END AS target_user_id,
        NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
        NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
      FROM (SELECT 1) AS singleton
      LEFT JOIN public.expense_unconfirmed_publication_audience AS audience
        ON audience.draft_id = party.draft_id
       AND audience.identity_token_hash = party.identity_token_hash
       AND NOT party.is_author
      LEFT JOIN public.relationships AS relationship
        ON relationship.owner_id = p_actor_id
       AND relationship.counterpart_user_id = CASE WHEN party.is_author
         THEN publication.actor_user_id ELSE audience.user_id END
      LEFT JOIN public.profiles AS profile
        ON profile.id = CASE WHEN party.is_author
          THEN publication.actor_user_id ELSE audience.user_id END
      LIMIT 1
    ) AS resolved ON true
    WHERE (party.is_payer OR party.is_participant)
      AND resolved.target_user_id IS DISTINCT FROM p_actor_id
    GROUP BY publication.draft_id
  ),
  private_creation AS (
    SELECT pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|draft|' || draft.id::text) AS presentation_key,
      'private_draft'::text AS presentation_state,

      safe_title.title AS title,
      (
        safe_title.title IS NULL
        OR summary.total_minor IS NULL
        OR source.normalized IS NULL
      ) AS needs_attention,
      summary.total_minor AS total_minor,
      CASE WHEN summary.total_minor IS NULL
        THEN NULL ELSE draft.payload->>'currency' END AS currency,
      CASE draft.context_type
        WHEN 'one_off' THEN '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=' || draft.id::text
        ELSE '/auth-mvp/utlagt-og-endurgreitt/hopar/' || draft.group_id::text
          || '/nytt-utgjald?draft=' || draft.id::text
      END AS href,
      'visible_updated_at'::text AS order_basis,
      pg_catalog.to_char(draft.updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_primary,
      pg_catalog.to_char(draft.created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', CASE WHEN identity.target_user_id IS NOT NULL
            THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
              || p_actor_id::text || '|' || identity.target_user_id::text)
            ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
              || p_actor_id::text || '|private|' || draft.id::text
              || '|' || (party.value->>'party_key_hash'))
          END,
          'label', CASE
            WHEN identity.private_name IS NOT NULL
              AND pg_catalog.strpos(identity.private_name, '@') = 0
              AND identity.private_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.private_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.private_name
              THEN identity.private_name
            WHEN identity.profile_name IS NOT NULL
              AND pg_catalog.strpos(identity.profile_name, '@') = 0
              AND identity.profile_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.profile_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.profile_name
              THEN identity.profile_name
            WHEN pg_catalog.strpos(party.value->>'display_name', '@') = 0
              AND (party.value->>'display_name') !~ '[[:cntrl:]]'
              AND pg_catalog.translate(party.value->>'display_name',
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '')
                  = party.value->>'display_name'
              THEN party.value->>'display_name'
            WHEN identity.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
            ELSE 'Gestur'
          END,
          'kind', CASE WHEN identity.target_user_id IS NULL
            THEN 'manual' ELSE 'durable' END
        ) ORDER BY (party.value->>'ordinal')::integer)
        FROM pg_catalog.jsonb_array_elements(source.normalized->'parties') AS party(value)
        LEFT JOIN LATERAL (
          SELECT CASE WHEN (party.value->>'is_author')::boolean THEN p_actor_id
            ELSE (audience.value->>'user_id')::uuid END AS target_user_id,
            NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
            NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
          FROM (SELECT 1) AS singleton
          LEFT JOIN LATERAL (
            SELECT candidate.value
            FROM pg_catalog.jsonb_array_elements(source.normalized->'audience') AS candidate(value)
            WHERE candidate.value->>'identity_token_hash'
              = party.value->>'identity_token_hash'
            LIMIT 1
          ) AS audience ON NOT (party.value->>'is_author')::boolean
          LEFT JOIN public.relationships AS relationship
            ON relationship.owner_id = p_actor_id
           AND relationship.counterpart_user_id = CASE
             WHEN (party.value->>'is_author')::boolean THEN p_actor_id
             ELSE (audience.value->>'user_id')::uuid END
          LEFT JOIN public.profiles AS profile
            ON profile.id = CASE WHEN (party.value->>'is_author')::boolean
              THEN p_actor_id ELSE (audience.value->>'user_id')::uuid END
          LIMIT 1
        ) AS identity ON true
        WHERE identity.target_user_id IS DISTINCT FROM p_actor_id
      ), '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || circle.id::text),
          'label', pg_catalog.btrim(circle.name)
        ))
        FROM public.relationship_circles AS circle
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE circle.id = (source.normalized->>'circle_id')::uuid
          AND circle.status = 'active'
          AND pg_catalog.strpos(circle.name, '@') = 0
          AND circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM public.expense_private_drafts AS draft
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN pg_catalog.jsonb_typeof(draft.payload->'title') = 'string'
          AND (
            2 * pg_catalog.char_length(pg_catalog.btrim(
              draft.payload->>'title', v_js_whitespace
            ))
            - pg_catalog.char_length(pg_catalog.regexp_replace(
              pg_catalog.btrim(draft.payload->>'title', v_js_whitespace),
              U&'[\+010000-\+10FFFF]', '', 'g'
            ))
          ) BETWEEN 1 AND 200
          AND pg_catalog.btrim(draft.payload->>'title', v_js_whitespace)
            !~ U&'[\0001-\001F\007F-\009F\202A-\202E\2066-\2069]'
          AND pg_catalog.btrim(draft.payload->>'title', v_js_whitespace)
            !~ v_email_shaped_pattern
          THEN pg_catalog.btrim(draft.payload->>'title', v_js_whitespace)
        ELSE NULL::text
      END AS title
    ) AS safe_title ON true
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN pg_catalog.jsonb_typeof(draft.payload->'total') = 'string'
          THEN pg_catalog.regexp_replace(
            pg_catalog.btrim(draft.payload->>'total'), '[[:space:]]+', '', 'g'
          )
        ELSE NULL
      END AS raw_total
    ) AS raw ON true
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN raw.raw_total ~ '^[0-9]+([.,][0-9]+)?$'
          AND NOT (
            pg_catalog.strpos(raw.raw_total, '.') > 0
            AND pg_catalog.strpos(raw.raw_total, ',') > 0
          )
          THEN pg_catalog.replace(raw.raw_total, ',', '.')::numeric
        ELSE NULL
      END AS major_amount
    ) AS parsed ON true
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN draft.payload->>'currency' = 'ISK'
          AND parsed.major_amount > 0
          AND pg_catalog.scale(parsed.major_amount) = 0
          AND parsed.major_amount <= 9007199254740991
          THEN parsed.major_amount::bigint
        WHEN draft.payload->>'currency' IN ('EUR','USD','GBP','DKK','NOK','SEK')
          AND parsed.major_amount > 0
          AND pg_catalog.scale(parsed.major_amount) <= 2
          AND parsed.major_amount * 100 <= 9007199254740991
          THEN (parsed.major_amount * 100)::bigint
        ELSE NULL
      END AS total_minor
    ) AS summary ON true
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN draft.current_step = 'split' AND summary.total_minor IS NOT NULL
          THEN public.expense_sql172_project_private_draft(
            p_actor_id, draft.id
          )
        ELSE NULL::jsonb
      END AS normalized
    ) AS source ON true
    WHERE draft.actor_user_id = p_actor_id
      AND draft.context_type IN ('one_off', 'group')
      AND (
        draft.context_type = 'one_off'
        OR (
          draft.context_type = 'group'
          AND EXISTS (
            SELECT 1
            FROM public.expense_groups AS expense_group
            WHERE expense_group.id = draft.group_id
              AND expense_group.status = 'active'
              AND public.expense_active_member_role(
                p_actor_id, expense_group.id
              ) IS NOT NULL
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.expense_unconfirmed_publications AS publication
        WHERE publication.draft_id = draft.id AND publication.is_live
      )
  ),
  private_edit AS (
    SELECT pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|expense|' || binding.expense_id::text) AS presentation_key,
      'private_draft'::text AS presentation_state,
      CASE
        WHEN pg_catalog.jsonb_typeof(binding.payload->'title') = 'string'
          AND pg_catalog.char_length(pg_catalog.btrim(binding.payload->>'title'))
            BETWEEN 1 AND 200
          AND (binding.payload->>'title') !~ '[[:cntrl:]]'
          AND pg_catalog.translate(binding.payload->>'title',
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '')
              = binding.payload->>'title'
          THEN pg_catalog.btrim(binding.payload->>'title')
        ELSE binding.expense_title
      END AS title,

      false AS needs_attention,
      binding.expense_total_minor AS total_minor,
      binding.expense_currency AS currency,
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || binding.expense_id::text
        || '/breyta?step=split&draft=' || binding.draft_id::text AS href,
      'visible_updated_at'::text AS order_basis,
      pg_catalog.to_char(binding.draft_updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_primary,
      pg_catalog.to_char(binding.draft_created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', CASE WHEN identity.target_user_id IS NOT NULL
            THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
              || p_actor_id::text || '|' || identity.target_user_id::text)
            ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
              || p_actor_id::text || '|edit|' || binding.group_id::text
              || '|' || member.id::text)
          END,
          'label', CASE
            WHEN identity.private_name IS NOT NULL
              AND pg_catalog.strpos(identity.private_name, '@') = 0
              AND identity.private_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.private_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.private_name
              THEN identity.private_name
            WHEN identity.profile_name IS NOT NULL
              AND pg_catalog.strpos(identity.profile_name, '@') = 0
              AND identity.profile_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.profile_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.profile_name
              THEN identity.profile_name
            WHEN pg_catalog.strpos(member.display_name, '@') = 0
              AND member.display_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(member.display_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = member.display_name
              THEN pg_catalog.btrim(member.display_name)
            WHEN identity.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
            ELSE 'Gestur'
          END,
          'kind', CASE WHEN identity.target_user_id IS NULL
            THEN 'manual' ELSE 'durable' END
        ) ORDER BY member.id)
        FROM public.expense_group_members AS member
        LEFT JOIN public.expense_member_identity_bindings AS identity_binding
          ON identity_binding.group_id = member.group_id
         AND identity_binding.member_id = member.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(member.user_id, identity_binding.target_user_id) AS target_user_id,
            NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
            NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
          FROM (SELECT 1) AS singleton
          LEFT JOIN public.relationships AS relationship
            ON relationship.owner_id = p_actor_id
           AND relationship.counterpart_user_id
             = COALESCE(member.user_id, identity_binding.target_user_id)
          LEFT JOIN public.profiles AS profile
            ON profile.id = COALESCE(member.user_id, identity_binding.target_user_id)
        ) AS identity ON true
        WHERE member.group_id = binding.group_id
          AND member.status = 'active'
          AND identity.target_user_id IS DISTINCT FROM p_actor_id
          AND (
            binding.payload->'payerKeys' @> pg_catalog.jsonb_build_array(member.id::text)
            OR COALESCE((binding.payload->'included'->>member.id::text)::boolean, false)
          )
      ), '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || context.circle_id::text),
          'label', pg_catalog.btrim(circle.name)
        ))
        FROM public.relationship_circle_expense_contexts AS context
        JOIN public.relationship_circles AS circle
          ON circle.id = context.circle_id AND circle.status = 'active'
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE context.group_id = binding.group_id
          AND pg_catalog.strpos(circle.name, '@') = 0
          AND circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM exact_bindings AS binding
    WHERE binding.mode = 'private' AND binding.actor_user_id = p_actor_id
      AND pg_catalog.jsonb_typeof(binding.payload->'included') = 'object'
      AND pg_catalog.jsonb_typeof(binding.payload->'payerKeys') = 'array'
  ),
  shared_presentations AS (
    SELECT CASE WHEN binding.draft_id IS NOT NULL
      THEN pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|expense|' || binding.expense_id::text)
      ELSE pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|draft|' || publication.draft_id::text)
      END AS presentation_key,
      'shared_draft'::text AS presentation_state,

      publication.title, false AS needs_attention,
      publication.total_minor, publication.currency,
      CASE
        WHEN publication.actor_user_id = p_actor_id AND binding.draft_id IS NOT NULL
          THEN '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || binding.expense_id::text
            || '/breyta?step=split&draft=' || binding.draft_id::text
        WHEN publication.actor_user_id = p_actor_id
          AND publication.context_type = 'group'
          THEN '/auth-mvp/utlagt-og-endurgreitt/hopar/' || publication.group_id::text
            || '/nytt-utgjald?draft=' || publication.draft_id::text
        WHEN publication.actor_user_id = p_actor_id
          THEN '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=' || publication.draft_id::text
        ELSE '/auth-mvp/utlagt-og-endurgreitt/drog/' || publication.publication_id::text
      END AS href,
      'visible_updated_at'::text AS order_basis,
      pg_catalog.to_char(publication.updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_primary,
      pg_catalog.to_char(publication.published_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE(facets.facets, '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || circle_source.circle_id::text),
          'label', pg_catalog.btrim(authorized_circle.name)
        ))
        FROM (
          SELECT context.circle_id
          FROM public.relationship_circle_expense_contexts AS context
          WHERE publication.context_type = 'group'
            AND context.group_id = publication.group_id
          UNION ALL
          SELECT source.circle_id
          FROM shared_one_off_sources AS source
          WHERE publication.context_type = 'one_off'
            AND source.draft_id = publication.draft_id
        ) AS circle_source
        JOIN public.relationship_circles AS authorized_circle
          ON authorized_circle.id = circle_source.circle_id
         AND authorized_circle.status = 'active'
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = authorized_circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE pg_catalog.strpos(authorized_circle.name, '@') = 0
          AND authorized_circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(authorized_circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '')
              = authorized_circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM visible_live_publications AS publication
    LEFT JOIN exact_bindings AS binding ON binding.draft_id = publication.draft_id
    LEFT JOIN publication_person_facets AS facets ON facets.draft_id = publication.draft_id
    WHERE (
        (binding.draft_id IS NOT NULL AND binding.mode = 'shared')
        OR (binding.draft_id IS NULL
          AND publication.context_type IN ('one_off', 'group')
          AND public.expense_sql159_snapshot_is_valid(publication.draft_id))
      )
  ),
  canonical_member_ids AS (
    SELECT payment.expense_id, payment.member_id FROM public.expense_payments AS payment
    UNION
    SELECT share_row.expense_id, share_row.member_id FROM public.expense_shares AS share_row
  ),
  canonical_presentations AS (
    SELECT pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|expense|' || expense.id::text) AS presentation_key,
      CASE
        WHEN expense.status = 'cancelled' THEN 'cancelled'
        WHEN EXISTS (
          SELECT 1 FROM public.expense_settlement_eligible_balances_v1(
            expense.group_id, false
          ) AS balance
        ) OR EXISTS (
          SELECT 1 FROM public.expense_repayments AS repayment
          WHERE repayment.group_id = expense.group_id
            AND repayment.status = 'reported'
        ) THEN 'confirmed'
        ELSE 'settled'
      END::text AS presentation_state,

      expense.title, false AS needs_attention,
      expense.total_minor, expense.currency,
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || expense.id::text AS href,
      'incurred_on'::text AS order_basis,
      expense.incurred_on::text AS order_primary,
      pg_catalog.to_char(expense.created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', CASE WHEN identity.target_user_id IS NOT NULL
            THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
              || p_actor_id::text || '|' || identity.target_user_id::text)
            ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
              || p_actor_id::text || '|expense|' || expense.group_id::text
              || '|' || member.id::text)
          END,
          'label', CASE
            WHEN identity.private_name IS NOT NULL
              AND pg_catalog.strpos(identity.private_name, '@') = 0
              AND identity.private_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.private_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.private_name
              THEN identity.private_name
            WHEN identity.profile_name IS NOT NULL
              AND pg_catalog.strpos(identity.profile_name, '@') = 0
              AND identity.profile_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.profile_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.profile_name
              THEN identity.profile_name
            WHEN pg_catalog.strpos(member.display_name, '@') = 0
              AND member.display_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(member.display_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = member.display_name
              THEN pg_catalog.btrim(member.display_name)
            WHEN identity.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
            ELSE 'Gestur'
          END,
          'kind', CASE WHEN identity.target_user_id IS NULL
            THEN 'manual' ELSE 'durable' END
        ) ORDER BY member.id)
        FROM canonical_member_ids AS selected
        JOIN public.expense_group_members AS member
          ON member.id = selected.member_id AND member.group_id = expense.group_id
        LEFT JOIN public.expense_member_identity_bindings AS identity_binding
          ON identity_binding.group_id = member.group_id
         AND identity_binding.member_id = member.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(member.user_id, identity_binding.target_user_id) AS target_user_id,
            NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
            NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
          FROM (SELECT 1) AS singleton
          LEFT JOIN public.relationships AS relationship
            ON relationship.owner_id = p_actor_id
           AND relationship.counterpart_user_id
             = COALESCE(member.user_id, identity_binding.target_user_id)
          LEFT JOIN public.profiles AS profile
            ON profile.id = COALESCE(member.user_id, identity_binding.target_user_id)
        ) AS identity ON true
        WHERE selected.expense_id = expense.id
          AND identity.target_user_id IS DISTINCT FROM p_actor_id
      ), '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || context.circle_id::text),
          'label', pg_catalog.btrim(circle.name)
        ))
        FROM public.relationship_circle_expense_contexts AS context
        JOIN public.relationship_circles AS circle
          ON circle.id = context.circle_id AND circle.status = 'active'
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE context.group_id = expense.group_id
          AND pg_catalog.strpos(circle.name, '@') = 0
          AND circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM public.expenses AS expense
    JOIN actor_groups AS actor_group ON actor_group.group_id = expense.group_id
    JOIN public.expense_groups AS group_row ON group_row.id = expense.group_id
    WHERE group_row.status IN ('active', 'settling', 'settled', 'closed')
      AND NOT EXISTS (
        SELECT 1 FROM public.expense_edit_revision_bindings AS binding
        WHERE binding.expense_id = expense.id
      )
  ),
  candidates AS (
    SELECT * FROM private_creation
    UNION ALL SELECT * FROM private_edit
    UNION ALL SELECT * FROM shared_presentations
    UNION ALL SELECT * FROM canonical_presentations
  ),
  limited AS (
    SELECT candidate.*
    FROM candidates AS candidate
    ORDER BY CASE candidate.presentation_state
      WHEN 'private_draft' THEN 1 WHEN 'shared_draft' THEN 2
      WHEN 'confirmed' THEN 3 WHEN 'settled' THEN 4 ELSE 5 END,
      candidate.order_primary DESC, candidate.order_secondary DESC,
      candidate.presentation_key
    LIMIT 101
  )
    -- END EXACT SQL174 PROJECTION CTES
  SELECT pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT limited.presentation_key)::integer,
    (SELECT pg_catalog.count(*)::integer FROM (
      SELECT 1 FROM invalid_visible_bindings LIMIT 101
    ) AS bounded_invalid_visible_bindings),
    (SELECT pg_catalog.count(*)::integer FROM (
      SELECT 1 FROM invalid_visible_publications LIMIT 101
    ) AS bounded_invalid_visible_publications),
    (SELECT pg_catalog.count(*)::integer FROM (
      SELECT 1 FROM invalid_visible_private_edits LIMIT 101
    ) AS bounded_invalid_visible_private_edits),
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'presentation_key', limited.presentation_key,
      'presentation_state', limited.presentation_state,

      'title', limited.title,
      'needs_attention', limited.needs_attention,
      'total_minor', limited.total_minor,
      'currency', limited.currency,
      'href', limited.href,
      'order', pg_catalog.jsonb_build_object(
        'basis', limited.order_basis,
        'primary', limited.order_primary,
        'secondary', limited.order_secondary,
        'tie_breaker', limited.presentation_key
      ),
      'person_facets', limited.person_facets,
      'circle_facets', limited.circle_facets
    ) ORDER BY CASE limited.presentation_state
      WHEN 'private_draft' THEN 1 WHEN 'shared_draft' THEN 2
      WHEN 'confirmed' THEN 3 WHEN 'settled' THEN 4 ELSE 5 END,
      limited.order_primary DESC, limited.order_secondary DESC,
      limited.presentation_key), '[]'::jsonb)
  INTO v_candidate_count, v_distinct_candidate_count,
    v_invalid_visible_bindings_count, v_invalid_visible_publications_count,
    v_invalid_visible_private_edits_count, v_discarded_rows
  FROM limited;

      IF v_invalid_visible_bindings_count <> 0 THEN
        v_classification := 'invalid_visible_bindings';
      ELSIF v_invalid_visible_publications_count <> 0 THEN
        v_classification := 'invalid_visible_publications';
      ELSIF v_invalid_visible_private_edits_count <> 0 THEN
        v_classification := 'invalid_visible_private_edits';
      ELSIF v_candidate_count > 100 THEN
        v_classification := 'candidate_limit_exceeded';
      ELSIF v_candidate_count IS DISTINCT FROM v_distinct_candidate_count THEN
        v_classification := 'duplicate_presentation_keys';
      ELSE
        v_classification := 'unavailable_not_reproduced';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
      v_failing_helper_substage := 'projection_query';
      IF v_sqlstate = 'P0001' THEN
        GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
        v_p0001_token := CASE
          WHEN v_message IN (
            'expense_unconfirmed_invalid_draft',
            'expense_unconfirmed_not_found',
            'expense_unconfirmed_event_unavailable',
            'expense_unconfirmed_source_changed',
            'expense_unconfirmed_duplicate_identity',
            'expense_unconfirmed_author_required',
            'teskeid_event_not_found',
            'teskeid_event_unavailable'
          ) THEN v_message
          ELSE 'unrecognized_p0001'
        END;
      END IF;
      v_classification := 'projection_residual_exception';
    END;
  END IF;

  IF v_sqlstate IS NOT NULL THEN
    v_error_category := CASE pg_catalog.left(v_sqlstate, 2)
      WHEN '22' THEN 'data_exception'
      WHEN '23' THEN 'integrity_constraint'
      WHEN '42' THEN 'syntax_or_access_rule'
      WHEN '53' THEN 'insufficient_resources'
      WHEN '54' THEN 'program_limit'
      WHEN '55' THEN 'object_state'
      WHEN '57' THEN 'operator_intervention'
      WHEN 'P0' THEN 'user_defined_exception'
      WHEN 'XX' THEN 'internal_error'
      ELSE 'other'
    END;
  END IF;

  IF v_classification = 'unavailable_not_reproduced' THEN
    v_stage := 'complete';
  END IF;

  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER
  RAISE EXCEPTION USING
    ERRCODE = 'P1741',
    MESSAGE = pg_catalog.jsonb_build_object(
    'diagnostic_contract_version', 4,
    'sql172_lineage_exact', v_sql172_lineage_exact,
    'classification', v_classification,
    'failing_helper_substage', v_failing_helper_substage,
    'stage', v_stage,
    'actor_account_exists', v_actor_account_exists,
    'actor_beta_access', v_actor_beta_access,
    'identity_binding_conflict', v_identity_binding_conflict,
    'private_creation_probe_count',
      CASE WHEN v_private_creation_probe_count IS NULL THEN NULL
        ELSE LEAST(v_private_creation_probe_count, 101) END,
    'private_creation_completed_count',
      LEAST(v_private_creation_completed_count, 101),
    'private_adapter_contained_count',
      LEAST(v_private_adapter_contained_count, 101),
    'live_publication_probe_count',
      CASE WHEN v_live_publication_probe_count IS NULL THEN NULL
        ELSE LEAST(v_live_publication_probe_count, 101) END,
    'live_publication_completed_count',
      LEAST(v_live_publication_completed_count, 101),
    'settlement_probe_count',
      CASE WHEN v_settlement_probe_count IS NULL THEN NULL
        ELSE LEAST(v_settlement_probe_count, 101) END,
    'settlement_completed_count',
      LEAST(v_settlement_completed_count, 101),
    'invalid_visible_bindings_count',
      CASE WHEN v_invalid_visible_bindings_count IS NULL THEN NULL
        ELSE LEAST(v_invalid_visible_bindings_count, 101) END,
    'invalid_visible_publications_count',
      CASE WHEN v_invalid_visible_publications_count IS NULL THEN NULL
        ELSE LEAST(v_invalid_visible_publications_count, 101) END,
    'invalid_visible_private_edits_count',
      CASE WHEN v_invalid_visible_private_edits_count IS NULL THEN NULL
        ELSE LEAST(v_invalid_visible_private_edits_count, 101) END,
    'candidate_count',
      CASE WHEN v_candidate_count IS NULL THEN NULL
        ELSE LEAST(v_candidate_count, 101) END,
    'distinct_presentation_key_count',
      CASE WHEN v_distinct_candidate_count IS NULL THEN NULL
        ELSE LEAST(v_distinct_candidate_count, 101) END,
    'sqlstate', CASE
      WHEN v_sqlstate ~ '^[0-9A-Z]{5}$' THEN v_sqlstate ELSE NULL END,
    'error_category', v_error_category,
    'p0001_token', v_p0001_token
  )::text;
  -- END SAFE CONTROLLED EXCEPTION PUBLISHER
END;
$sql174_dashboard_runtime_diagnostic$;
